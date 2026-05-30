import crypto from 'crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/middleware/authenticate.js'

import { makeRetencaoUseCases } from '@/modules/retencao/application/factories/makeRetencaoUseCases.js'
import { RetencaoForbiddenError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'
import { LegalHoldNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'
import { DescarteLoteNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'

import { auditRetencao } from '@/modules/retencao/audit.js'
import { simularDescarte, criarLoteDescarte, aprovarLote, executarLote } from '@/modules/retencao/disposal.js'
import { aplicarLegalHoldEmItem, aplicarLegalHoldPorCriteria, liberarLegalHold } from '@/modules/retencao/legal-hold.js'
import { listRetentionResources } from '@/modules/retencao/registry.js'
import { sincronizarItemRetencao } from '@/modules/retencao/policy-engine.js'

// ── Response helpers ──────────────────────────────────────────────────────

type ApiSuccess<T> = { success: true; message?: string; data: T; meta?: unknown }
type ApiError = { success: false; message: string; errors?: Record<string, string[]> }

function ok<T>(reply: FastifyReply, data: T, input?: { message?: string; meta?: unknown }) {
  const payload: ApiSuccess<T> = { success: true, data }
  if (input?.message) payload.message = input.message
  if (input?.meta) payload.meta = input.meta
  return reply.send(payload)
}

function fail(reply: FastifyReply, code: number, message: string, errors?: Record<string, string[]>) {
  const payload: ApiError = { success: false, message }
  if (errors && Object.keys(errors).length > 0) payload.errors = errors
  return reply.code(code).send(payload)
}

// ── Auth context ──────────────────────────────────────────────────────────

type AuthCtx =
  | { isSystemAdmin: true; tenantId: number | null; userId: number; role: string }
  | { isSystemAdmin: false; tenantId: number; userId: number; role: string }

function getAuthContext(request: FastifyRequest): AuthCtx | null {
  const u = request.user as Record<string, unknown>
  const tenantId = u?.['tenantId']
  const userId = u?.['userId']
  const role = u?.['role']
  const isSystemAdmin = Boolean(u?.['isSystemAdmin'])
  if (typeof userId !== 'number') return null
  if (isSystemAdmin)
    return {
      tenantId: typeof tenantId === 'number' ? tenantId : null,
      userId,
      role: typeof role === 'string' ? role : 'SYSTEM_ADMIN',
      isSystemAdmin: true,
    } as const
  if (typeof tenantId !== 'number') return null
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false } as const
}

function normResource(v: unknown) {
  return String(v || '').trim().toUpperCase()
}

// ── Route plugin ──────────────────────────────────────────────────────────

export default async function retencaoRoutes(server: FastifyInstance) {
  const {
    listPoliticas,
    getPoliticaById,
    createPolitica,
    updatePolitica,
    listRetencaoItems,
    listLegalHolds,
    getLegalHoldById,
    createLegalHold,
    listDescarteLotes,
    getDescarteLoteById,
    listAuditoria,
    repo,
  } = makeRetencaoUseCases()

  server.addHook('onRequest', authenticate)

  // ── Auth guard helper ─────────────────────────────────────────────────

  async function requireRetencaoAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<(AuthCtx & { isSystemAdmin: false }) | null> {
    const ctx = getAuthContext(request)
    if (!ctx) {
      fail(reply, 401, 'Não autenticado')
      return null
    }
    if (ctx.isSystemAdmin) {
      if (ctx.tenantId == null) {
        fail(reply, 403, 'Tenant não selecionado')
        return null
      }
      // System admin acting as tenant — treat as admin
      return { ...ctx, isSystemAdmin: false, tenantId: ctx.tenantId }
    }
    const role = await repo.getTenantUserRole(ctx.tenantId, ctx.userId)
    if (!role) {
      fail(reply, 403, 'Tenant não selecionado')
      return null
    }
    if (role !== 'ADMIN') {
      fail(reply, 403, 'Acesso negado')
      return null
    }
    return ctx
  }

  // ── Resources ─────────────────────────────────────────────────────────

  server.get('/recursos', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return
    return ok(reply, listRetentionResources())
  })

  // ── Inventory sync ────────────────────────────────────────────────────

  server.post(
    '/inventario/sincronizar',
    {
      schema: {
        body: z.object({
          recurso: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          limite: z.number().int().min(1).max(5000).default(500),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const body = request.body as { recurso?: string | null; entidadeId?: number | null; limite?: number }
      const recurso = body.recurso ? normResource(body.recurso) : null
      const limite = Number(body.limite ?? 500)
      const entidadeId = typeof body.entidadeId === 'number' ? body.entidadeId : null

      const recursos = recurso ? [recurso] : listRetentionResources()
      let processed = 0
      let okCount = 0
      let failCount = 0

      for (const r of recursos) {
        const ids: number[] = []
        if (entidadeId) {
          ids.push(entidadeId)
        } else {
          const { rows } = await listRetencaoItems.execute(ctx.tenantId, {
            recurso: r,
            limite,
            pagina: 1,
          })
          // We need raw entity IDs — use a lightweight Prisma call via repo for those tables
          // that are not yet in the repository (documento, documentoVersao, assinaturaArtefato).
          // The sincronizarItemRetencao helper from policy-engine handles these directly, so
          // we only need to pass the IDs that already exist in governancaRetencaoItem for this
          // resource, OR we fall back to the full-table scan done inside policy-engine itself.
          // For the inventory sync the original logic queried prisma directly; we preserve
          // that behaviour by delegating to the domain service sincronizarItemRetencao.
          ids.push(...(rows as Array<{ entidadeId: number }>).map((x) => x.entidadeId))
        }

        for (const id of ids) {
          processed++
          const res = await sincronizarItemRetencao({ tenantId: ctx.tenantId, recurso: r, entidadeId: id })
          if (res.ok) okCount++
          else failCount++
        }
      }

      await auditRetencao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: 'RETENCAO',
        tipoEvento: 'INVENTARIO_SINCRONIZADO',
        descricaoEvento: 'Inventário sincronizado',
        metadataJson: { recurso: recurso || 'ALL', processed, okCount, failCount },
      })

      return ok(reply, { processed, okCount, failCount }, { message: 'Sincronização concluída' })
    },
  )

  // ── Politicas ─────────────────────────────────────────────────────────

  server.get('/politicas', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const q = z
      .object({
        recurso: z.string().optional(),
        ativo: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    try {
      const { rows, total } = await listPoliticas.execute(ctx.tenantId, {
        recurso: q.recurso ? normResource(q.recurso) : undefined,
        ativo: q.ativo === 'true' ? true : q.ativo === 'false' ? false : undefined,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/politicas',
    {
      schema: {
        body: z.object({
          codigoPolitica: z.string().min(2),
          nomePolitica: z.string().min(2),
          recurso: z.string().min(2),
          categoriaRecurso: z.string().optional().nullable(),
          eventoBase: z.string().min(2),
          periodoValor: z.number().int().min(1),
          periodoUnidade: z.enum(['DIAS', 'MESES', 'ANOS']),
          acaoFinal: z.string().min(2),
          exigeAprovacaoDescarte: z.boolean().default(true),
          respeitaBackupTtl: z.boolean().default(true),
          anonimizarCamposJson: z.unknown().optional().nullable(),
          condicaoJson: z.unknown().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const body = request.body as {
        codigoPolitica: string
        nomePolitica: string
        recurso: string
        categoriaRecurso?: string | null
        eventoBase: string
        periodoValor: number
        periodoUnidade: string
        acaoFinal: string
        exigeAprovacaoDescarte: boolean
        respeitaBackupTtl: boolean
        anonimizarCamposJson?: unknown
        condicaoJson?: unknown
        prioridade: number
        ativo: boolean
      }

      try {
        const created = (await createPolitica.execute(ctx.tenantId, {
          codigoPolitica: String(body.codigoPolitica).toUpperCase(),
          nomePolitica: String(body.nomePolitica),
          recurso: normResource(body.recurso),
          categoriaRecurso: body.categoriaRecurso ?? null,
          eventoBase: String(body.eventoBase).toUpperCase(),
          periodoValor: Number(body.periodoValor),
          periodoUnidade: String(body.periodoUnidade),
          acaoFinal: String(body.acaoFinal).toUpperCase(),
          exigeAprovacaoDescarte: body.exigeAprovacaoDescarte !== false,
          respeitaBackupTtl: body.respeitaBackupTtl !== false,
          anonimizarCamposJson: body.anonimizarCamposJson ?? null,
          condicaoJson: body.condicaoJson ?? null,
          prioridade: Number(body.prioridade ?? 0),
          ativo: body.ativo !== false,
          criadoPorUserId: ctx.userId,
          atualizadoPorUserId: ctx.userId,
        })) as { id: number; codigoPolitica: string; recurso: string }

        await auditRetencao({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          recurso: created.recurso,
          tipoEvento: 'POLITICA_APLICADA',
          descricaoEvento: `Política criada (${created.codigoPolitica})`,
          metadataJson: { politicaId: created.id },
        })

        return ok(reply, { id: created.id }, { message: 'Política criada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.put(
    '/politicas/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          nomePolitica: z.string().min(2),
          categoriaRecurso: z.string().optional().nullable(),
          eventoBase: z.string().min(2),
          periodoValor: z.number().int().min(1),
          periodoUnidade: z.enum(['DIAS', 'MESES', 'ANOS']),
          acaoFinal: z.string().min(2),
          exigeAprovacaoDescarte: z.boolean().default(true),
          respeitaBackupTtl: z.boolean().default(true),
          anonimizarCamposJson: z.unknown().optional().nullable(),
          condicaoJson: z.unknown().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const { id } = request.params as { id: number }
      const body = request.body as {
        nomePolitica: string
        categoriaRecurso?: string | null
        eventoBase: string
        periodoValor: number
        periodoUnidade: string
        acaoFinal: string
        exigeAprovacaoDescarte: boolean
        respeitaBackupTtl: boolean
        anonimizarCamposJson?: unknown
        condicaoJson?: unknown
        prioridade: number
        ativo: boolean
      }

      try {
        const updated = (await updatePolitica.execute(ctx.tenantId, id, {
          nomePolitica: String(body.nomePolitica),
          categoriaRecurso: body.categoriaRecurso ?? null,
          eventoBase: String(body.eventoBase).toUpperCase(),
          periodoValor: Number(body.periodoValor),
          periodoUnidade: String(body.periodoUnidade),
          acaoFinal: String(body.acaoFinal).toUpperCase(),
          exigeAprovacaoDescarte: body.exigeAprovacaoDescarte !== false,
          respeitaBackupTtl: body.respeitaBackupTtl !== false,
          anonimizarCamposJson: body.anonimizarCamposJson ?? null,
          condicaoJson: body.condicaoJson ?? null,
          prioridade: Number(body.prioridade ?? 0),
          ativo: body.ativo !== false,
          atualizadoPorUserId: ctx.userId,
        })) as { id: number; codigoPolitica: string; recurso: string }

        await auditRetencao({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          recurso: updated.recurso,
          tipoEvento: 'POLITICA_APLICADA',
          descricaoEvento: `Política atualizada (${updated.codigoPolitica})`,
          metadataJson: { politicaId: updated.id },
        })

        return ok(reply, { id: updated.id }, { message: 'Política atualizada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── Inventário ────────────────────────────────────────────────────────

  server.get('/inventario', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const q = z
      .object({
        recurso: z.string().optional(),
        status: z.string().optional(),
        holdAtivo: z.enum(['true', 'false']).optional(),
        elegivel: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    try {
      const { rows, total } = await listRetencaoItems.execute(ctx.tenantId, {
        recurso: q.recurso ? normResource(q.recurso) : undefined,
        status: q.status ? String(q.status).toUpperCase() : undefined,
        holdAtivo: q.holdAtivo === 'true' ? true : q.holdAtivo === 'false' ? false : undefined,
        elegivel: q.elegivel === 'true' ? true : q.elegivel === 'false' ? false : undefined,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Legal holds ───────────────────────────────────────────────────────

  server.get('/legal-holds', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    try {
      const rows = await listLegalHolds.execute(ctx.tenantId)
      return ok(reply, rows)
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/legal-holds',
    {
      schema: {
        body: z.object({
          codigoHold: z.string().min(2).optional().nullable(),
          tituloHold: z.string().min(2),
          motivoHold: z.string().min(5),
          tipoHold: z.string().min(2),
          criteriaJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const body = request.body as {
        codigoHold?: string | null
        tituloHold: string
        motivoHold: string
        tipoHold: string
        criteriaJson?: unknown
      }

      const codigoHold = body.codigoHold
        ? String(body.codigoHold).toUpperCase()
        : `HOLD_${crypto.randomBytes(6).toString('hex').toUpperCase()}`

      try {
        const created = (await createLegalHold.execute(ctx.tenantId, {
          codigoHold,
          tituloHold: String(body.tituloHold),
          motivoHold: String(body.motivoHold),
          tipoHold: String(body.tipoHold).toUpperCase(),
          criteriaJson: body.criteriaJson ?? null,
          criadorUserId: ctx.userId,
        })) as { id: number; codigoHold: string; criteriaJson: unknown }

        let applied = 0
        if (created.criteriaJson) {
          const r = await aplicarLegalHoldPorCriteria({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            legalHoldId: created.id,
            criteriaJson: created.criteriaJson,
          })
          applied = r.applied
        }

        await auditRetencao({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          recurso: 'RETENCAO',
          tipoEvento: 'HOLD_APLICADO',
          descricaoEvento: `Legal hold criado (${created.codigoHold})`,
          metadataJson: { legalHoldId: created.id, applied },
        })

        return ok(reply, { id: created.id, applied }, { message: 'Legal hold criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/legal-holds/:id/aplicar',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({ retencaoItemId: z.number().int() }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const { id } = request.params as { id: number }
      const body = request.body as { retencaoItemId: number }

      try {
        const hold = await getLegalHoldById.execute(ctx.tenantId, id)
        const holdRecord = hold as { id: number; tenantId: number }
        const r = await aplicarLegalHoldEmItem({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          legalHoldId: holdRecord.id,
          retencaoItemId: Number(body.retencaoItemId),
        })
        if (!r.ok) return fail(reply, 400, r.reason)
        return ok(reply, { ok: true }, { message: 'Hold aplicado' })
      } catch (err) {
        if (err instanceof LegalHoldNotFoundError) return fail(reply, 404, err.message)
        return replyError(reply, err)
      }
    },
  )

  server.post('/legal-holds/:id/liberar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})

    try {
      const r = await liberarLegalHold({ tenantId: ctx.tenantId, userId: ctx.userId, legalHoldId: id })
      if (!r.ok) return fail(reply, 400, r.reason)
      return ok(reply, { ok: true }, { message: 'Hold liberado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Descarte ──────────────────────────────────────────────────────────

  server.post(
    '/descarte/simular',
    {
      schema: {
        body: z.object({
          recurso: z.string().optional().nullable(),
          elegivelAte: z.string().optional().nullable(),
          incluirHold: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const body = request.body as { recurso?: string | null; elegivelAte?: string | null; incluirHold?: boolean }
      const elegivelAte = body.elegivelAte ? new Date(String(body.elegivelAte)) : new Date()

      try {
        const result = await simularDescarte({
          tenantId: ctx.tenantId,
          filtro: {
            recurso: body.recurso ? normResource(body.recurso) : undefined,
            elegivelAte,
            incluirHold: Boolean(body.incluirHold),
          },
        })
        return ok(reply, result)
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.get('/descarte/lotes', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    try {
      const rows = await listDescarteLotes.execute(ctx.tenantId)
      return ok(reply, rows)
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/descarte/lotes',
    {
      schema: {
        body: z.object({
          nomeLote: z.string().min(2),
          tipoExecucao: z.enum(['SIMULACAO', 'REAL']),
          recurso: z.string().optional().nullable(),
          elegivelAte: z.string().optional().nullable(),
          incluirHold: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply)
      if (!ctx) return

      const body = request.body as {
        nomeLote: string
        tipoExecucao: 'SIMULACAO' | 'REAL'
        recurso?: string | null
        elegivelAte?: string | null
        incluirHold?: boolean
      }
      const elegivelAte = body.elegivelAte ? new Date(String(body.elegivelAte)) : new Date()

      try {
        const id = await criarLoteDescarte({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          nomeLote: String(body.nomeLote),
          tipoExecucao: body.tipoExecucao,
          filtro: {
            recurso: body.recurso ? normResource(body.recurso) : undefined,
            elegivelAte,
            incluirHold: Boolean(body.incluirHold),
          },
        })
        return ok(reply, { id }, { message: 'Lote criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.get('/descarte/lotes/:id', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})

    try {
      const result = await getDescarteLoteById.execute(ctx.tenantId, id)
      return ok(reply, result)
    } catch (err) {
      if (err instanceof DescarteLoteNotFoundError) return fail(reply, 404, err.message)
      return replyError(reply, err)
    }
  })

  server.post('/descarte/lotes/:id/aprovar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})

    try {
      const r = await aprovarLote({ tenantId: ctx.tenantId, userId: ctx.userId, loteId: id })
      if (!r.ok) return fail(reply, 400, r.reason)
      return ok(reply, { ok: true }, { message: 'Lote aprovado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post('/descarte/lotes/:id/executar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})

    try {
      const r = await executarLote({ tenantId: ctx.tenantId, userId: ctx.userId, loteId: id })
      if (!r.ok) return fail(reply, 400, r.reason)
      return ok(reply, r, { message: 'Lote executado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Auditoria ─────────────────────────────────────────────────────────

  server.get('/auditoria', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply)
    if (!ctx) return

    const q = z
      .object({
        recurso: z.string().optional(),
        tipoEvento: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query ?? {})

    try {
      const { rows, total } = await listAuditoria.execute(ctx.tenantId, {
        recurso: q.recurso ? normResource(q.recurso) : undefined,
        tipoEvento: q.tipoEvento ? String(q.tipoEvento).toUpperCase() : undefined,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })
}
