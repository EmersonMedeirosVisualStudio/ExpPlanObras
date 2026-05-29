import type { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '@/plugins/prisma.js'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isTrialExpired(
  tenant: { subscriptionStatus?: string | null; trialEndsAt?: Date | null },
  now: Date,
): boolean {
  return (
    (tenant.subscriptionStatus || 'TRIAL') === 'TRIAL' &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt < now
  )
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers?.authorization
    const queryToken = (request.query as Record<string, unknown>)?.token
    const url = String((request as unknown as { url: string }).url || '')

    const allowQueryToken =
      url.includes('/realtime/') || (url.includes('/eventos/') && url.includes('/anexos/'))

    if (!authHeader && typeof queryToken === 'string' && queryToken && allowQueryToken) {
      ;(request.headers as Record<string, unknown>).authorization = `Bearer ${queryToken}`
      await request.jwtVerify()
    } else {
      await request.jwtVerify()
    }

    const user = request.user as Record<string, unknown>
    if (user?.isSystemAdmin) return

    const tenantId = user?.tenantId
    if (typeof tenantId !== 'number') return
    const userId = user?.userId
    if (typeof userId !== 'number') return

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        paidUntil: true,
        gracePeriodEndsAt: true,
      },
    })

    if (!tenant || tenant.status === 'INACTIVE') {
      reply.code(403).send({ message: 'Tenant inativo' })
      return
    }

    const now = new Date()
    const subStatus = String(tenant.subscriptionStatus || 'NONE')
    const graceDays = Number(process.env.GRACE_DAYS || '10')

    if (subStatus === 'NONE') {
      reply.code(402).send({ message: 'Sem assinatura. Faça uma assinatura para reativação.' })
      return
    }
    if (isTrialExpired(tenant, now)) {
      reply.code(402).send({ message: 'Período de teste expirou. Assinatura necessária' })
      return
    }

    if (subStatus === 'ACTIVE') {
      if (!tenant.paidUntil) {
        reply.code(402).send({ message: 'Assinatura inválida. Regularize para reativação.' })
        return
      }
      if (tenant.paidUntil < now) {
        const graceEndsAt = addDays(tenant.paidUntil, graceDays)
        if (now <= graceEndsAt) {
          if (tenant.subscriptionStatus !== 'GRACE_PERIOD' || !tenant.gracePeriodEndsAt) {
            await prisma.tenant.update({
              where: { id: tenant.id },
              data: { subscriptionStatus: 'GRACE_PERIOD', gracePeriodEndsAt: graceEndsAt } as never,
            })
            await prisma.tenantHistoryEntry.create({
              data: {
                tenantId: tenant.id,
                source: 'SYSTEM',
                action: 'SUBSCRIPTION_GRACE_PERIOD',
                message: `Assinatura vencida. Entrada automática em GRACE_PERIOD por ${graceDays} dia(s).`,
                actorUserId: null,
              },
            })
          }
          return
        }
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as never,
        })
        await prisma.tenantHistoryEntry.create({
          data: {
            tenantId: tenant.id,
            source: 'SYSTEM',
            action: 'SUBSCRIPTION_EXPIRED',
            message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
            actorUserId: null,
          },
        })
        reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' })
        return
      }
      return
    }

    if (subStatus === 'GRACE_PERIOD') {
      const graceEndsAt =
        tenant.gracePeriodEndsAt ||
        (tenant.paidUntil ? addDays(tenant.paidUntil, graceDays) : addDays(now, -1))
      if (now <= graceEndsAt) return

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as never,
      })
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: tenant.id,
          source: 'SYSTEM',
          action: 'SUBSCRIPTION_EXPIRED',
          message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
          actorUserId: null,
        },
      })
      reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' })
      return
    }

    if (subStatus === 'EXPIRED') {
      reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' })
      return
    }

    const tu = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        role: true,
        funcionarioId: true,
        ativo: true,
        bloqueado: true,
        bloqueadoAteEm: true,
        tokenRevokedBefore: true,
      },
    })

    if (!tu || !tu.ativo) {
      reply.code(403).send({ message: 'Acesso negado' })
      return
    }

    if (tu.bloqueado) {
      if (tu.bloqueadoAteEm && tu.bloqueadoAteEm <= now) {
        await prisma.tenantUser.update({
          where: { id: tu.id },
          data: { bloqueado: false, bloqueadoAteEm: null },
        })
      } else {
        reply.code(403).send({ message: 'Usuário bloqueado' })
        return
      }
    }

    if (tu.tokenRevokedBefore) {
      const iat = typeof user?.iat === 'number' ? (user.iat as number) : null
      if (iat) {
        const issuedAt = new Date(iat * 1000)
        if (issuedAt < tu.tokenRevokedBefore) {
          reply.code(401).send({ message: 'Reautenticação necessária' })
          return
        }
      }
    }

    const abrangencias = (await prisma.usuarioAbrangencia.findMany({
      where: { userId, ativo: true },
      select: { tipoAbrangencia: true, obraId: true, unidadeId: true },
    })) as Array<{ tipoAbrangencia: string; obraId: number | null; unidadeId: number | null }>

    const obras = new Set<number>()
    const unidades = new Set<number>()
    let empresa = false

    for (const a of abrangencias) {
      const tipo = String(a.tipoAbrangencia || '').toUpperCase()
      if (tipo === 'EMPRESA') { empresa = true; continue }
      if (tipo === 'OBRA' && typeof a.obraId === 'number' && a.obraId > 0) obras.add(a.obraId)
      if (tipo === 'UNIDADE' && typeof a.unidadeId === 'number' && a.unidadeId > 0) unidades.add(a.unidadeId)
    }

    if (!empresa && obras.size === 0 && unidades.size === 0) empresa = true

    if (String(tu.role || '').toUpperCase() === 'ADMIN') {
      empresa = true
      obras.clear()
      unidades.clear()
    }

    user.tenantUserId = tu.id
    user.tenantRole = tu.role
    user.funcionarioId = tu.funcionarioId ?? null
    user.abrangencia = { empresa, obras: Array.from(obras), unidades: Array.from(unidades) }
  } catch {
    reply.code(401).send({ message: 'Não autenticado' })
  }
}

