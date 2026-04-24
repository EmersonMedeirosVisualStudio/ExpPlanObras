import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { normalizeEmail, onlyDigits } from '../../utils/validators.js';
import { loadSubjectContext } from '../security-fields/service.js';
import { sanitizeResourceObject } from '../security-fields/sanitizer.js';

type ApiSuccess<T> = { success: true; message?: string; data: T; meta?: any };
type ApiError = { success: false; message: string; errors?: Record<string, string[]> };

function ok<T>(reply: FastifyReply, data: T, input?: { message?: string; meta?: any }) {
  const payload: ApiSuccess<T> = { success: true, data };
  if (input?.message) payload.message = input.message;
  if (input?.meta) payload.meta = input.meta;
  return reply.send(payload);
}

function fail(reply: FastifyReply, code: number, message: string, errors?: Record<string, string[]>) {
  const payload: ApiError = { success: false, message };
  if (errors && Object.keys(errors).length > 0) payload.errors = errors;
  return reply.code(code).send(payload);
}

function isMissingTableError(error: any, tableName: string) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const msg = String(error?.message || '');
  if (code === 'P2021') return msg.includes(tableName);
  return msg.includes(tableName) && msg.toLowerCase().includes('does not exist');
}

function getAuthContext(request: FastifyRequest) {
  const u = request.user as any;
  const tenantId = u?.tenantId;
  const userId = u?.userId;
  const role = u?.role;
  if (typeof tenantId !== 'number' || typeof userId !== 'number') return null;
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', email: typeof u?.email === 'string' ? u.email : '' };
}

async function requireRepresentative(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { id: true, funcionarioId: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');

  const rep = await prisma.empresaRepresentante.findFirst({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { id: 'desc' },
    select: { id: true, funcionarioId: true, email: true, cpf: true, nomeRepresentante: true },
  });

  if (!rep) {
    if (ctx.role === 'ADMIN') return { ...ctx, tenantUserId: tenantUser.id, funcionarioId: tenantUser.funcionarioId };
    return fail(reply, 403, 'Acesso negado');
  }

  const repEmail = rep.email ? normalizeEmail(rep.email) : '';
  const actorEmail = ctx.email ? normalizeEmail(ctx.email) : '';
  const matchByFuncionario =
    typeof rep.funcionarioId === 'number' && typeof tenantUser.funcionarioId === 'number' && rep.funcionarioId === tenantUser.funcionarioId;
  const matchByEmail = Boolean(repEmail && actorEmail && repEmail === actorEmail);

  if (!matchByFuncionario && !matchByEmail) return fail(reply, 403, 'Acesso negado');

  let funcionarioId = tenantUser.funcionarioId ?? null;

  if (typeof funcionarioId !== 'number') {
    if (typeof rep.funcionarioId === 'number') {
      const updated = await prisma.tenantUser.update({
        where: { id: tenantUser.id },
        data: { funcionarioId: rep.funcionarioId },
        select: { funcionarioId: true },
      });
      funcionarioId = updated.funcionarioId ?? null;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, email: true, name: true, cpf: true },
      });

      const cpf = String(user?.cpf || rep.cpf || '').trim();
      if (cpf) {
        const existingByCpf = await prisma.funcionario.findFirst({
          where: { tenantId: ctx.tenantId, cpf },
          select: { id: true },
        });
        funcionarioId = existingByCpf?.id ?? null;
      }

      if (typeof funcionarioId !== 'number') {
        const baseMatricula = `REP-${ctx.userId}`;
        const existingMatricula = await prisma.funcionario.findFirst({
          where: { tenantId: ctx.tenantId, matricula: baseMatricula },
          select: { id: true },
        });
        const matricula = existingMatricula ? `REP-${ctx.userId}-${Date.now()}` : baseMatricula;
        const nomeCompleto = String(user?.name || rep.nomeRepresentante || 'Representante').trim();

        const created = await prisma.funcionario.create({
          data: {
            tenantId: ctx.tenantId,
            matricula,
            nomeCompleto,
            cpf: String(user?.cpf || rep.cpf || '').trim(),
            email: user?.email || null,
            cargo: 'Representante',
            funcaoPrincipal: 'Representante',
            statusFuncional: 'ATIVO',
            ativo: true,
          },
          select: { id: true },
        });
        funcionarioId = created.id;
      }

      if (typeof funcionarioId === 'number') {
        await prisma.$transaction([
          prisma.tenantUser.update({ where: { id: tenantUser.id }, data: { funcionarioId } }),
          prisma.empresaRepresentante.update({ where: { id: rep.id }, data: { funcionarioId } }),
        ]);
      }
    }
  }

  return { ...ctx, tenantUserId: tenantUser.id, funcionarioId, representanteId: rep.id };
}

async function requireEncarregado(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { id: true, role: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  if (tenantUser.role === 'ADMIN') return { ...ctx, tenantUserId: tenantUser.id, encarregadoId: null };
  const active = await prisma.empresaEncarregadoSistema.findFirst({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { id: 'desc' },
    select: { id: true, userId: true, solicitouSaida: true },
  });
  if (!active || typeof active.userId !== 'number' || active.userId !== ctx.userId) return fail(reply, 403, 'Acesso negado');
  return { ...ctx, tenantUserId: tenantUser.id, encarregadoId: active.id };
}

async function requireTenantUser(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { id: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  return { ...ctx, tenantUserId: tenantUser.id };
}

async function audit(input: {
  tenantId: number;
  userId?: number | null;
  entidade: string;
  idRegistro: string;
  acao: string;
  dadosAnteriores?: any;
  dadosNovos?: any;
}) {
  await prisma.auditoriaEvento.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      entidade: input.entidade,
      idRegistro: input.idRegistro,
      acao: input.acao,
      dadosAnteriores: input.dadosAnteriores ?? null,
      dadosNovos: input.dadosNovos ?? null,
    },
  });
}

async function ensureBasePerfis() {
  const existing = await prisma.perfil.findMany({
    where: { tenantScope: 'BASE' },
    select: { id: true, codigo: true },
  });
  const codes = new Set(existing.map((p) => p.codigo));
  const toCreate: Array<{ codigo: string; nome: string }> = [];
  if (!codes.has('CEO')) toCreate.push({ codigo: 'CEO', nome: 'CEO / Diretor Geral' });
  if (!codes.has('REPRESENTANTE_EMPRESA')) toCreate.push({ codigo: 'REPRESENTANTE_EMPRESA', nome: 'Representante da Empresa' });
  if (!codes.has('ENCARREGADO_SISTEMA_EMPRESA')) toCreate.push({ codigo: 'ENCARREGADO_SISTEMA_EMPRESA', nome: 'Encarregado do Sistema da Empresa' });
  if (toCreate.length === 0) return;
  await prisma.perfil.createMany({
    data: toCreate.map((p) => ({
      tenantId: null,
      tenantScope: 'BASE',
      tipoPerfil: 'BASE',
      codigo: p.codigo,
      nome: p.nome,
      ativo: true,
    })),
    skipDuplicates: true,
  });
}

function randomTempPassword() {
  return crypto.randomBytes(6).toString('base64url');
}

export default async function v1Routes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/empresa/configuracao', async (request, reply) => {
    const ctx = await requireRepresentative(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const rep = await prisma.empresaRepresentante.findFirst({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: { id: 'desc' },
      include: {
        funcionario: { select: { telefone: true } },
      },
    });

    const encarregado = await prisma.empresaEncarregadoSistema.findFirst({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: { id: 'desc' },
      include: {
        funcionario: { select: { id: true, nomeCompleto: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });

    let titulares: Array<{ roleCode: string; funcionarioId: number; funcionario: { nomeCompleto: string } }> = [];
    try {
      titulares = await prisma.empresaTitular.findMany({
        where: { tenantId: ctx.tenantId, ativo: true },
        include: {
          funcionario: { select: { id: true, nomeCompleto: true } },
        },
      });
    } catch (e: any) {
      if (!isMissingTableError(e, 'EmpresaTitular')) throw e;
      titulares = [];
    }

    const repFuncionarioId = typeof rep?.funcionarioId === 'number' ? rep.funcionarioId : typeof ctx.funcionarioId === 'number' ? ctx.funcionarioId : null;

    if (typeof repFuncionarioId === 'number') {
      const needCeo = !titulares.some((t) => t.roleCode === 'CEO');
      const needRh = !titulares.some((t) => t.roleCode === 'GERENTE_RH');
      const needEncarregado = !encarregado;

      const canUseTitularesTable = titulares.length > 0 || needCeo || needRh;

      if ((needCeo || needRh) && canUseTitularesTable) {
        try {
          const now = new Date();
          await prisma.$transaction(async (tx) => {
            if (needCeo) {
              const created = await tx.empresaTitular.create({
                data: { tenantId: ctx.tenantId, roleCode: 'CEO', funcionarioId: repFuncionarioId, ativo: true, dataInicio: now, dataFim: null },
              });
              await audit({
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                entidade: 'empresa_titulares',
                idRegistro: String(created.id),
                acao: 'DEFAULT_TITULAR',
                dadosNovos: { roleCode: 'CEO', funcionarioId: repFuncionarioId },
              });
            }
            if (needRh) {
              const created = await tx.empresaTitular.create({
                data: { tenantId: ctx.tenantId, roleCode: 'GERENTE_RH', funcionarioId: repFuncionarioId, ativo: true, dataInicio: now, dataFim: null },
              });
              await audit({
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                entidade: 'empresa_titulares',
                idRegistro: String(created.id),
                acao: 'DEFAULT_TITULAR',
                dadosNovos: { roleCode: 'GERENTE_RH', funcionarioId: repFuncionarioId },
              });
            }
          });
        } catch (e: any) {
          if (!isMissingTableError(e, 'EmpresaTitular')) throw e;
        }
      }

      if (needEncarregado) {
        const now = new Date();
        const current = await prisma.empresaEncarregadoSistema.findFirst({
          where: { tenantId: ctx.tenantId, ativo: true },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        if (!current) {
          if (!rep) return fail(reply, 400, 'Representante não definido');
          const created = await prisma.empresaEncarregadoSistema.create({
            data: {
              tenantId: ctx.tenantId,
              funcionarioId: repFuncionarioId,
              userId: ctx.userId,
              definidoPorRepresentanteId: rep.id,
              ativo: true,
              dataInicio: now,
              dataFim: null,
              solicitouSaida: false,
              dataSolicitacaoSaida: null,
              motivoSolicitacaoSaida: null,
            },
          });
          await audit({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            entidade: 'empresa_encarregado_sistema',
            idRegistro: String(created.id),
            acao: 'DEFAULT_ENCARREGADO',
            dadosNovos: { funcionarioId: repFuncionarioId, userId: ctx.userId },
          });
        }
      }
    }

    const encarregadoFinal = await prisma.empresaEncarregadoSistema.findFirst({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: { id: 'desc' },
      include: {
        funcionario: { select: { id: true, nomeCompleto: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });

    let titularesFinal: Array<{ roleCode: string; funcionarioId: number; funcionario: { nomeCompleto: string } }> = titulares;
    try {
      titularesFinal = await prisma.empresaTitular.findMany({
        where: { tenantId: ctx.tenantId, ativo: true },
        include: { funcionario: { select: { id: true, nomeCompleto: true } } },
      });
    } catch (e: any) {
      if (!isMissingTableError(e, 'EmpresaTitular')) throw e;
      titularesFinal = titulares;
    }

    const ceoTitular = titularesFinal.find((t) => t.roleCode === 'CEO');
    const rhTitular = titularesFinal.find((t) => t.roleCode === 'GERENTE_RH');

    const representativeData = rep
      ? {
          id: rep.id,
          nome: rep.nomeRepresentante,
          cpf: rep.cpf,
          email: rep.email,
          telefone: rep.funcionario?.telefone ?? null,
          idFuncionario: rep.funcionarioId,
        }
      : null;

    const encarregadoData = encarregadoFinal
      ? {
          id: encarregadoFinal.id,
          idFuncionario: encarregadoFinal.funcionarioId,
          nome: encarregadoFinal.funcionario?.nomeCompleto || encarregadoFinal.user?.name || '',
          idUsuario: encarregadoFinal.userId,
          usuario: encarregadoFinal.user?.email || '',
          dataInicio: encarregadoFinal.dataInicio.toISOString().slice(0, 10),
          ativo: encarregadoFinal.ativo,
          solicitouSaida: encarregadoFinal.solicitouSaida,
        }
      : null;

    const historico = await prisma.tenantHistoryEntry.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, source: true, action: true, message: true, createdAt: true },
    });

    const subject = await loadSubjectContext({ tenantId: ctx.tenantId, userId: ctx.userId });
    const safeRepresentative = representativeData
      ? await sanitizeResourceObject(representativeData, { tenantId: ctx.tenantId, userId: ctx.userId, resource: 'EMPRESA_REPRESENTANTE', action: 'VIEW', entityId: representativeData.id, exportacao: false }, subject)
      : null;

    return ok(reply, {
      representante: safeRepresentative,
      encarregadoSistema: encarregadoData,
      ceo: ceoTitular ? { roleCode: 'CEO', idFuncionario: ceoTitular.funcionarioId, nome: ceoTitular.funcionario.nomeCompleto } : null,
      gerenteRh: rhTitular ? { roleCode: 'GERENTE_RH', idFuncionario: rhTitular.funcionarioId, nome: rhTitular.funcionario.nomeCompleto } : null,
      historico: historico.map((h) => ({
        id: h.id,
        source: h.source,
        action: h.action,
        message: h.message,
        createdAt: h.createdAt.toISOString(),
      })),
      haSolicitacaoSaida: Boolean(encarregado?.solicitouSaida),
    });
  });

  server.put(
    '/empresa/representante',
    {
      schema: {
        body: z.object({
          nome: z.string().min(2),
          cpf: z.string().min(3),
          email: z.string().email().optional().nullable(),
          telefone: z.string().optional().nullable(),
          idFuncionario: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRepresentative(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const body = request.body as any;
      const errors: Record<string, string[]> = {};
      const cpf = String(body.cpf || '');
      const cpfDigits = onlyDigits(cpf);
      if (cpfDigits.length < 11) errors.cpf = ['CPF inválido'];
      const email = body.email === null || body.email === undefined ? null : normalizeEmail(String(body.email));
      const nome = String(body.nome || '').trim();
      if (nome.length < 2) errors.nome = ['Nome inválido'];
      if (Object.keys(errors).length > 0) return fail(reply, 400, 'Dados inválidos', errors);

      const now = new Date();
      const current = await prisma.empresaRepresentante.findFirst({
        where: { tenantId: ctx.tenantId, ativo: true },
        orderBy: { id: 'desc' },
      });

      const created = await prisma.$transaction(async (tx) => {
        if (current) {
          await tx.empresaRepresentante.update({
            where: { id: current.id },
            data: { ativo: false, dataFim: now },
          });
        }
        const rep = await tx.empresaRepresentante.create({
          data: {
            tenantId: ctx.tenantId,
            funcionarioId: typeof body.idFuncionario === 'number' ? body.idFuncionario : null,
            nomeRepresentante: nome,
            cpf: cpfDigits,
            email,
            ativo: true,
            dataInicio: now,
            dataFim: null,
          },
        });
        await tx.auditoriaEvento.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            entidade: 'empresa_representantes',
            idRegistro: String(rep.id),
            acao: 'UPDATE',
            dadosAnteriores: current as any,
            dadosNovos: rep as any,
          },
        });
        return rep;
      });

      return ok(reply, { id: created.id }, { message: 'Representante atualizado' });
    }
  );

  server.put(
    '/empresa/encarregado-sistema',
    {
      schema: {
        body: z.object({
          idFuncionario: z.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRepresentative(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const { idFuncionario } = request.body as { idFuncionario: number };

      const rep = await prisma.empresaRepresentante.findFirst({
        where: { tenantId: ctx.tenantId, ativo: true },
        orderBy: { id: 'desc' },
      });
      if (!rep) return fail(reply, 400, 'Representante não definido');

      const funcionario = await prisma.funcionario.findFirst({ where: { id: idFuncionario, tenantId: ctx.tenantId } });
      if (!funcionario) return fail(reply, 404, 'Funcionário não encontrado');

      const linked = await prisma.tenantUser.findFirst({
        where: { tenantId: ctx.tenantId, funcionarioId: idFuncionario },
        select: { userId: true },
      });
      const userId = linked?.userId ?? null;

      const now = new Date();
      const current = await prisma.empresaEncarregadoSistema.findFirst({
        where: { tenantId: ctx.tenantId, ativo: true },
        orderBy: { id: 'desc' },
      });

      const created = await prisma.$transaction(async (tx) => {
        if (current) {
          await tx.empresaEncarregadoSistema.update({ where: { id: current.id }, data: { ativo: false, dataFim: now } });
        }
        const enc = await tx.empresaEncarregadoSistema.create({
          data: {
            tenantId: ctx.tenantId,
            funcionarioId: idFuncionario,
            userId,
            definidoPorRepresentanteId: rep.id,
            ativo: true,
            dataInicio: now,
            dataFim: null,
            solicitouSaida: false,
            dataSolicitacaoSaida: null,
            motivoSolicitacaoSaida: null,
          },
        });
        await tx.auditoriaEvento.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            entidade: 'empresa_encarregado_sistema',
            idRegistro: String(enc.id),
            acao: 'UPDATE',
            dadosAnteriores: current as any,
            dadosNovos: enc as any,
          },
        });
        return enc;
      });

      return ok(reply, { id: created.id, precisaVincularUsuario: userId === null }, { message: 'Encarregado definido' });
    }
  );

  server.put(
    '/empresa/titulares',
    {
      schema: {
        body: z.object({
          roleCode: z.enum(['CEO', 'GERENTE_RH']),
          idFuncionario: z.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRepresentative(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const { roleCode, idFuncionario } = request.body as { roleCode: 'CEO' | 'GERENTE_RH'; idFuncionario: number };

      const funcionario = await prisma.funcionario.findFirst({ where: { id: idFuncionario, tenantId: ctx.tenantId } });
      if (!funcionario) return fail(reply, 404, 'Funcionário não encontrado');

      const now = new Date();
      let current: any = null;
      try {
        current = await prisma.empresaTitular.findFirst({
          where: { tenantId: ctx.tenantId, roleCode, ativo: true },
          orderBy: { id: 'desc' },
        });
      } catch (e: any) {
        if (isMissingTableError(e, 'EmpresaTitular')) return fail(reply, 501, 'Recurso ainda não disponível: migração de banco pendente (EmpresaTitular). Faça o redeploy do backend com as migrations atualizadas.');
        throw e;
      }

      let created: any;
      try {
        created = await prisma.$transaction(async (tx) => {
          if (current) {
            await tx.empresaTitular.update({ where: { id: current.id }, data: { ativo: false, dataFim: now } });
          }
          const titular = await tx.empresaTitular.create({
            data: {
              tenantId: ctx.tenantId,
              roleCode,
              funcionarioId: idFuncionario,
              ativo: true,
              dataInicio: now,
            },
          });
          await tx.auditoriaEvento.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              entidade: 'empresa_titulares',
              idRegistro: String(titular.id),
              acao: 'DEFINIR_TITULAR',
              dadosNovos: { roleCode, idFuncionario },
            },
          });
          return titular;
        });
      } catch (e: any) {
        if (isMissingTableError(e, 'EmpresaTitular')) return fail(reply, 501, 'Recurso ainda não disponível: migração de banco pendente (EmpresaTitular). Faça o redeploy do backend com as migrations atualizadas.');
        throw e;
      }

      return ok(reply, { id: created.id }, { message: 'Titular definido com sucesso' });
    }
  );

  server.post(
    '/apoio/funcionarios-simples',
    {
      schema: {
        body: z.object({
          nomeCompleto: z.string().min(2),
          email: z.string().email().optional().nullable(),
          cargo: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRepresentative(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const body = request.body as any;
      const nomeCompleto = String(body.nomeCompleto).trim();
      const email = body.email ? normalizeEmail(String(body.email)) : null;
      const cargo = body.cargo ? String(body.cargo).trim() : null;

      // Gerar matrícula e cpfFake com base no timestamp
      const timestamp = Date.now();
      const last = await prisma.funcionario.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { id: 'desc' },
        select: { id: true }
      });
      const matricula = `TEMP-${(last?.id || 0) + 1}-${timestamp}`;
      const cpfFake = `00${timestamp.toString().slice(-9)}`;

      const created = await prisma.$transaction(async (tx) => {
        const f = await tx.funcionario.create({
          data: {
            tenantId: ctx.tenantId,
            nomeCompleto,
            email,
            cargo,
            matricula,
            cpf: cpfFake,
            statusFuncional: 'ATIVO',
            ativo: true,
          },
        });
        await tx.auditoriaEvento.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            entidade: 'funcionarios',
            idRegistro: String(f.id),
            acao: 'CREATE_MINIMO',
            dadosNovos: { nomeCompleto, email, cargo },
          },
        });
        return f;
      });

      return ok(reply, { id: created.id, nome: created.nomeCompleto }, { message: 'Funcionário cadastrado com sucesso.' });
    }
  );

  server.post(
    '/empresa/encarregado-sistema/solicitar-saida',
    {
      schema: {
        body: z.object({ motivo: z.string().min(3).max(255) }),
      },
    },
    async (request, reply) => {
      const ctx = getAuthContext(request);
      if (!ctx) return fail(reply, 401, 'Não autenticado');

      const current = await prisma.empresaEncarregadoSistema.findFirst({
        where: { tenantId: ctx.tenantId, ativo: true },
        orderBy: { id: 'desc' },
      });
      if (!current || current.userId !== ctx.userId) return fail(reply, 403, 'Acesso negado');

      const { motivo } = request.body as { motivo: string };
      const now = new Date();
      const updated = await prisma.empresaEncarregadoSistema.update({
        where: { id: current.id },
        data: { solicitouSaida: true, dataSolicitacaoSaida: now, motivoSolicitacaoSaida: motivo },
      });
      await audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entidade: 'empresa_encarregado_sistema',
        idRegistro: String(updated.id),
        acao: 'SOLICITAR_SAIDA',
        dadosAnteriores: current as any,
        dadosNovos: updated as any,
      });
      await prisma.tenantHistoryEntry.create({
        data: { tenantId: ctx.tenantId, source: 'SYSTEM', message: `Encarregado solicitou saída da função. Motivo: ${motivo}`, actorUserId: ctx.userId },
      });
      return ok(reply, {}, { message: 'Solicitação registrada' });
    }
  );

  server.get('/apoio/funcionarios-select', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');

    const funcionarios = await prisma.funcionario.findMany({
      where: { tenantId: ctx.tenantId, ativo: true },
      select: { id: true, nomeCompleto: true, cargo: true },
      orderBy: { nomeCompleto: 'asc' },
    });

    return ok(
      reply,
      funcionarios.map((f) => ({
        id: f.id,
        nome: f.nomeCompleto,
        cargo: f.cargo,
      }))
    );
  });

  server.get('/governanca/usuarios', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const querySchema = z.object({
      q: z.string().optional(),
      ativo: z.string().optional(),
      bloqueado: z.string().optional(),
      perfil: z.string().optional(),
      pagina: z.coerce.number().int().min(1).default(1),
      limite: z.coerce.number().int().min(1).max(100).default(20),
    });
    const q = querySchema.parse(request.query || {});
    const skip = (q.pagina - 1) * q.limite;

    const whereTenantUser: any = { tenantId: ctx.tenantId };
    if (q.ativo === 'true') whereTenantUser.ativo = true;
    if (q.ativo === 'false') whereTenantUser.ativo = false;
    if (q.bloqueado === 'true') whereTenantUser.bloqueado = true;
    if (q.bloqueado === 'false') whereTenantUser.bloqueado = false;
    if (q.q && q.q.trim().length > 0) {
      const term = q.q.trim();
      whereTenantUser.OR = [
        { login: { contains: term } },
        { user: { email: { contains: term } } },
        { user: { name: { contains: term } } },
      ];
    }

    const rows = await prisma.tenantUser.findMany({
      where: whereTenantUser,
      include: {
        user: { select: { id: true, email: true, name: true } },
        funcionario: { select: { id: true, nomeCompleto: true } },
      },
      orderBy: { id: 'asc' },
      skip,
      take: q.limite,
    });
    const total = await prisma.tenantUser.count({ where: whereTenantUser });

    const userIds = rows.map((r) => r.userId);
    const perfis = await prisma.usuarioPerfil.findMany({
      where: { userId: { in: userIds }, ativo: true },
      include: { perfil: { select: { id: true, codigo: true } } },
    });
    const abrangencias = await prisma.usuarioAbrangencia.findMany({
      where: { userId: { in: userIds }, ativo: true },
      select: { userId: true, tipoAbrangencia: true },
    });

    const perfisByUser = new Map<number, string[]>();
    for (const up of perfis) {
      const list = perfisByUser.get(up.userId) || [];
      list.push(up.perfil.codigo);
      perfisByUser.set(up.userId, list);
    }
    const abByUser = new Map<number, string[]>();
    for (const a of abrangencias) {
      const list = abByUser.get(a.userId) || [];
      list.push(a.tipoAbrangencia);
      abByUser.set(a.userId, list);
    }

    const data = rows.map((r) => ({
      id: r.user.id,
      nome: r.user.name || '',
      idFuncionario: r.funcionarioId,
      login: r.login || '',
      emailLogin: r.user.email,
      ativo: r.ativo,
      bloqueado: r.bloqueado,
      perfis: perfisByUser.get(r.userId) || [],
      abrangencias: abByUser.get(r.userId) || [],
    }));

    if (q.perfil && q.perfil.trim().length > 0) {
      const code = q.perfil.trim();
      const filtered = data.filter((u) => u.perfis.includes(code));
      return ok(reply, filtered, { meta: { pagina: q.pagina, limite: q.limite, total: filtered.length } });
    }

    return ok(reply, data, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/governanca/usuarios',
    {
      schema: {
        body: z.object({
          idFuncionario: z.number().int(),
          login: z.string().min(3),
          emailLogin: z.string().email(),
          ativo: z.boolean().default(true),
          bloqueado: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const body = request.body as any;
      const login = String(body.login || '').trim();
      const email = normalizeEmail(String(body.emailLogin || ''));

      const funcionario = await prisma.funcionario.findFirst({ where: { id: body.idFuncionario, tenantId: ctx.tenantId } });
      if (!funcionario) return fail(reply, 404, 'Funcionário não encontrado');

      const existingForFuncionario = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantId, funcionarioId: body.idFuncionario } });
      if (existingForFuncionario) return fail(reply, 409, 'Funcionário já possui usuário');

      const existingLogin = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantId, login } });
      if (existingLogin) return fail(reply, 409, 'Login já utilizado');

      const existingUser = await prisma.user.findUnique({ where: { email } }).catch(() => null);
      const tempPassword = randomTempPassword();
      const hashed = await bcrypt.hash(tempPassword, 10);

      const created = await prisma.$transaction(async (tx) => {
        const user =
          existingUser ||
          (await tx.user.create({
            data: {
              email,
              cpf: funcionario.cpf,
              name: funcionario.nomeCompleto,
              password: hashed,
              whatsapp: funcionario.telefone || null,
              address: null,
              location: null,
            },
          }));

        const tenantUser = await tx.tenantUser.create({
          data: {
            tenantId: ctx.tenantId,
            userId: user.id,
            role: 'USER',
            login,
            ativo: Boolean(body.ativo),
            bloqueado: Boolean(body.bloqueado),
            funcionarioId: body.idFuncionario,
          },
        });

        await tx.auditoriaEvento.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            entidade: 'tenant_user',
            idRegistro: String(tenantUser.id),
            acao: 'CREATE',
            dadosNovos: { tenantUserId: tenantUser.id, userId: user.id, funcionarioId: body.idFuncionario, login },
          },
        });

        return { user, tenantUser };
      });

      return ok(
        reply,
        { id: created.user.id },
        {
          message: 'Usuário criado',
          meta: process.env.NODE_ENV === 'production' ? undefined : { senhaTemporaria: tempPassword },
        }
      );
    }
  );

  server.put(
    '/governanca/usuarios/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          emailLogin: z.string().email().optional(),
          ativo: z.boolean().optional(),
          bloqueado: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const body = request.body as any;

      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: id } } }).catch(() => null);
      if (!link) return fail(reply, 404, 'Usuário não encontrado');

      const before = link;
      const updated = await prisma.$transaction(async (tx) => {
        if (body.emailLogin) {
          await tx.user.update({ where: { id }, data: { email: normalizeEmail(String(body.emailLogin)) } });
        }
        const tu = await tx.tenantUser.update({
          where: { id: link.id },
          data: {
            ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
            bloqueado: typeof body.bloqueado === 'boolean' ? body.bloqueado : undefined,
          },
        });
        await tx.auditoriaEvento.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'tenant_user', idRegistro: String(tu.id), acao: 'UPDATE', dadosAnteriores: before as any, dadosNovos: tu as any },
        });
        return tu;
      });

      return ok(reply, { id }, { message: 'Usuário atualizado' });
    }
  );

  server.patch(
    '/governanca/usuarios/:id/status',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({ ativo: z.boolean().optional(), bloqueado: z.boolean().optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const body = request.body as any;

      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: id } } }).catch(() => null);
      if (!link) return fail(reply, 404, 'Usuário não encontrado');

      const tu = await prisma.tenantUser.update({
        where: { id: link.id },
        data: {
          ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
          bloqueado: typeof body.bloqueado === 'boolean' ? body.bloqueado : undefined,
        },
      });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'tenant_user', idRegistro: String(tu.id), acao: 'STATUS', dadosAnteriores: link as any, dadosNovos: tu as any });
      return ok(reply, {}, { message: 'Status atualizado' });
    }
  );

  server.post(
    '/governanca/usuarios/:id/reset-acesso',
    {
      schema: { params: z.object({ id: z.coerce.number().int() }) },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: id } } }).catch(() => null);
      if (!link) return fail(reply, 404, 'Usuário não encontrado');
      const resetToken = (server.jwt as any).sign({ userId: id, tenantId: ctx.tenantId, purpose: 'RESET_PASSWORD', nonce: crypto.randomUUID() }, { expiresIn: '1h' });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'tenant_user', idRegistro: String(link.id), acao: 'RESET_ACESSO', dadosNovos: { resetTokenGenerated: true } });
      return ok(reply, {}, { message: 'Link de redefinição gerado com sucesso.', meta: { resetToken } });
    }
  );

  server.get('/governanca/perfis', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    await ensureBasePerfis();
    const perfis = await prisma.perfil.findMany({
      where: { OR: [{ tenantScope: 'BASE' }, { tenantId: ctx.tenantId }] },
      orderBy: [{ tenantScope: 'asc' }, { id: 'asc' }],
    });
    const ids = perfis.map((p) => p.id);
    const counts = await prisma.perfilPermissao.groupBy({ by: ['perfilId'], where: { perfilId: { in: ids } }, _count: { _all: true } });
    const countMap = new Map(counts.map((c) => [c.perfilId, c._count._all]));
    return ok(
      reply,
      perfis.map((p) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        tipo: p.tipoPerfil,
        ativo: p.ativo,
        qtdePermissoes: countMap.get(p.id) || 0,
      }))
    );
  });

  server.post(
    '/governanca/perfis',
    {
      schema: {
        body: z.object({
          nome: z.string().min(2),
          codigo: z.string().min(2),
          permissoes: z.array(z.string().min(3)).default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const codigo = String(body.codigo || '').trim().toUpperCase();
      const nome = String(body.nome || '').trim();
      const tenantScope = `T${ctx.tenantId}`;
      const created = await prisma.$transaction(async (tx) => {
        const perfil = await tx.perfil.create({
          data: { tenantId: ctx.tenantId, tenantScope, tipoPerfil: 'EMPRESA', codigo, nome, ativo: true },
        });
        if (Array.isArray(body.permissoes) && body.permissoes.length > 0) {
          await tx.perfilPermissao.createMany({
            data: body.permissoes.map((perm: string) => {
              const raw = String(perm || '').trim().toLowerCase();
              const parts = raw.split('.').filter(Boolean);
              return {
                perfilId: perfil.id,
                modulo: parts[0] || 'modulo',
                janela: raw,
                acao: parts[parts.length - 1] || 'acao',
                permitido: true,
              };
            }),
          });
        }
        await tx.auditoriaEvento.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'perfil', idRegistro: String(perfil.id), acao: 'CREATE', dadosNovos: perfil as any },
        });
        return perfil;
      });
      return ok(reply, { id: created.id }, { message: 'Perfil criado' });
    }
  );

  server.put(
    '/governanca/perfis/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({ nome: z.string().min(2), codigo: z.string().min(2), permissoes: z.array(z.string().min(3)).default([]) }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const body = request.body as any;

      const perfil = await prisma.perfil.findUnique({ where: { id } }).catch(() => null);
      if (!perfil || perfil.tipoPerfil === 'BASE') return fail(reply, 403, 'Perfil base não pode ser alterado');
      if (perfil.tenantId !== ctx.tenantId) return fail(reply, 403, 'Acesso negado');

      const before = perfil;
      await prisma.$transaction(async (tx) => {
        const updated = await tx.perfil.update({
          where: { id },
          data: { nome: String(body.nome).trim(), codigo: String(body.codigo).trim().toUpperCase() },
        });
        await tx.perfilPermissao.deleteMany({ where: { perfilId: id } });
        if (Array.isArray(body.permissoes) && body.permissoes.length > 0) {
          await tx.perfilPermissao.createMany({
            data: body.permissoes.map((perm: string) => {
              const raw = String(perm || '').trim().toLowerCase();
              const parts = raw.split('.').filter(Boolean);
              return {
                perfilId: id,
                modulo: parts[0] || 'modulo',
                janela: raw,
                acao: parts[parts.length - 1] || 'acao',
                permitido: true,
              };
            }),
          });
        }
        await tx.auditoriaEvento.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'perfil', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: before as any, dadosNovos: updated as any },
        });
      });
      return ok(reply, {}, { message: 'Perfil atualizado' });
    }
  );

  server.patch(
    '/governanca/perfis/:id/status',
    {
      schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ ativo: z.boolean() }) },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const { ativo } = request.body as { ativo: boolean };
      const perfil = await prisma.perfil.findUnique({ where: { id } }).catch(() => null);
      if (!perfil || perfil.tipoPerfil === 'BASE') return fail(reply, 403, 'Perfil base não pode ser alterado');
      if (perfil.tenantId !== ctx.tenantId) return fail(reply, 403, 'Acesso negado');
      const updated = await prisma.perfil.update({ where: { id }, data: { ativo } });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'perfil', idRegistro: String(id), acao: 'STATUS', dadosAnteriores: perfil as any, dadosNovos: updated as any });
      return ok(reply, {}, { message: 'Status atualizado' });
    }
  );

  server.put(
    '/governanca/usuarios/:id/perfis',
    {
      schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ perfisIds: z.array(z.number().int()).min(1) }) },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const { perfisIds } = request.body as { perfisIds: number[] };
      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: id } } }).catch(() => null);
      if (!link) return fail(reply, 404, 'Usuário não encontrado');
      const perfis = await prisma.perfil.findMany({ where: { id: { in: perfisIds }, OR: [{ tenantScope: 'BASE' }, { tenantId: ctx.tenantId }] } });
      if (perfis.length !== perfisIds.length) return fail(reply, 400, 'Perfis inválidos');

      const before = await prisma.usuarioPerfil.findMany({ where: { userId: id }, select: { perfilId: true, ativo: true } });
      await prisma.$transaction(async (tx) => {
        await tx.usuarioPerfil.deleteMany({ where: { userId: id } });
        await tx.usuarioPerfil.createMany({ data: perfisIds.map((pid) => ({ userId: id, perfilId: pid, ativo: true })) });
        await tx.auditoriaEvento.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'usuario_perfis', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: before as any, dadosNovos: perfisIds as any },
        });
      });
      return ok(reply, {}, { message: 'Perfis atualizados' });
    }
  );

  server.get('/governanca/abrangencias', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const querySchema = z.object({
      idUsuario: z.coerce.number().int().optional(),
      tipo: z.string().optional(),
      ativo: z.string().optional(),
    });
    const q = querySchema.parse(request.query || {});
    const where: any = {};
    if (typeof q.idUsuario === 'number') {
      const link = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenantId, userId: q.idUsuario } },
        select: { userId: true },
      });
      if (!link) return ok(reply, []);
      where.userId = q.idUsuario;
    } else {
      const links = await prisma.tenantUser.findMany({ where: { tenantId: ctx.tenantId }, select: { userId: true } });
      where.userId = { in: links.map((l) => l.userId) };
    }
    if (q.tipo) where.tipoAbrangencia = q.tipo;
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;
    const rows = await prisma.usuarioAbrangencia.findMany({ where, orderBy: { id: 'desc' } });
    return ok(reply, rows);
  });

  server.post(
    '/governanca/abrangencias',
    {
      schema: {
        body: z.object({
          idUsuario: z.number().int(),
          tipoAbrangencia: z.enum(['EMPRESA', 'OBRA', 'UNIDADE']),
          idObra: z.number().int().optional().nullable(),
          idUnidade: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const userId = body.idUsuario;
      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId } } }).catch(() => null);
      if (!link) return fail(reply, 404, 'Usuário não encontrado');

      if (body.tipoAbrangencia === 'OBRA' && typeof body.idObra !== 'number') return fail(reply, 400, 'idObra obrigatório');
      if (body.tipoAbrangencia === 'UNIDADE' && typeof body.idUnidade !== 'number') return fail(reply, 400, 'idUnidade obrigatório');

      const created = await prisma.usuarioAbrangencia.create({
        data: {
          userId,
          tipoAbrangencia: body.tipoAbrangencia,
          obraId: body.tipoAbrangencia === 'OBRA' ? body.idObra : null,
          unidadeId: body.tipoAbrangencia === 'UNIDADE' ? body.idUnidade : null,
          ativo: true,
        },
      });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'usuario_abrangencias', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
      return ok(reply, { id: created.id }, { message: 'Abrangência criada' });
    }
  );

  server.put(
    '/governanca/abrangencias/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoAbrangencia: z.enum(['EMPRESA', 'OBRA', 'UNIDADE']),
          idObra: z.number().int().optional().nullable(),
          idUnidade: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const body = request.body as any;
      const current = await prisma.usuarioAbrangencia.findUnique({ where: { id } }).catch(() => null);
      if (!current) return fail(reply, 404, 'Abrangência não encontrada');
      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: current.userId } } }).catch(() => null);
      if (!link) return fail(reply, 403, 'Acesso negado');
      const updated = await prisma.usuarioAbrangencia.update({
        where: { id },
        data: {
          tipoAbrangencia: body.tipoAbrangencia,
          obraId: body.tipoAbrangencia === 'OBRA' ? body.idObra : null,
          unidadeId: body.tipoAbrangencia === 'UNIDADE' ? body.idUnidade : null,
        },
      });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'usuario_abrangencias', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
      return ok(reply, {}, { message: 'Abrangência atualizada' });
    }
  );

  server.patch(
    '/governanca/abrangencias/:id/status',
    {
      schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ ativo: z.boolean() }) },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as { id: number };
      const { ativo } = request.body as { ativo: boolean };
      const current = await prisma.usuarioAbrangencia.findUnique({ where: { id } }).catch(() => null);
      if (!current) return fail(reply, 404, 'Abrangência não encontrada');
      const link = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: current.userId } } }).catch(() => null);
      if (!link) return fail(reply, 403, 'Acesso negado');
      const updated = await prisma.usuarioAbrangencia.update({ where: { id }, data: { ativo } });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'usuario_abrangencias', idRegistro: String(id), acao: 'STATUS', dadosAnteriores: current as any, dadosNovos: updated as any });
      return ok(reply, {}, { message: 'Status atualizado' });
    }
  );

  server.get('/admin/backup/politica', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const policy = await prisma.backupPoliticaTenant.findFirst({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: { id: 'desc' },
    });
    return ok(reply, policy);
  });

  server.put(
    '/admin/backup/politica',
    {
      schema: {
        body: z.object({
          periodicidade: z.enum(['DIARIO', 'SEMANAL']),
          horaExecucao: z.string().min(4),
          diaSemana: z.number().int().nullable().optional(),
          retencaoDias: z.number().int().min(7),
          ativo: z.boolean(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      if (body.periodicidade === 'SEMANAL' && (typeof body.diaSemana !== 'number' || body.diaSemana < 1 || body.diaSemana > 7)) {
        return fail(reply, 400, 'Dados inválidos', { diaSemana: ['Dia da semana obrigatório para periodicidade semanal'] });
      }
      const now = new Date();
      const current = await prisma.backupPoliticaTenant.findFirst({ where: { tenantId: ctx.tenantId, ativo: true }, orderBy: { id: 'desc' } });
      const policy = await prisma.$transaction(async (tx) => {
        if (current) {
          await tx.backupPoliticaTenant.update({ where: { id: current.id }, data: { ativo: false } });
        }
        const created = await tx.backupPoliticaTenant.create({
          data: {
            tenantId: ctx.tenantId,
            periodicidade: body.periodicidade,
            horaExecucao: body.horaExecucao,
            diaSemana: body.periodicidade === 'SEMANAL' ? body.diaSemana : null,
            retencaoDias: body.retencaoDias,
            ativo: body.ativo,
            configuradoPorUserId: ctx.userId,
            configuradoEm: now,
          },
        });
        await tx.auditoriaEvento.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'backup_politica', idRegistro: String(created.id), acao: 'UPSERT', dadosAnteriores: current as any, dadosNovos: created as any },
        });
        return created;
      });
      return ok(reply, policy, { message: 'Política atualizada' });
    }
  );

  server.get('/admin/backup/execucoes', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const rows = await prisma.backupExecucaoTenant.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return ok(reply, rows);
  });

  server.post('/admin/backup/executar', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const policy = await prisma.backupPoliticaTenant.findFirst({ where: { tenantId: ctx.tenantId }, orderBy: { id: 'desc' } });
    if (!policy) return fail(reply, 400, 'Política de backup não configurada');
    const now = new Date();
    const created = await prisma.backupExecucaoTenant.create({
      data: {
        tenantId: ctx.tenantId,
        politicaId: policy.id,
        dataHoraInicio: now,
        status: 'EXECUTANDO',
      },
    });
    const finished = await prisma.backupExecucaoTenant.update({
      where: { id: created.id },
      data: {
        dataHoraFim: new Date(),
        status: 'SUCESSO',
        referenciaArquivo: `backup-tenant-${ctx.tenantId}-${created.id}.json`,
        hashArquivo: crypto.createHash('sha256').update(String(created.id)).digest('hex'),
        observacao: 'Backup lógico executado manualmente (placeholder).',
      },
    });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'backup_execucao', idRegistro: String(created.id), acao: 'EXECUTAR', dadosNovos: finished as any });
    return ok(reply, finished, { message: 'Backup executado' });
  });

  server.post(
    '/admin/backup/restauracoes',
    {
      schema: { body: z.object({ pontoReferencia: z.string().min(3), motivo: z.string().min(5).max(255) }) },
    },
    async (request, reply) => {
      const ctx = await requireEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.backupRestauracaoTenant.create({
        data: {
          tenantId: ctx.tenantId,
          pontoReferencia: String(body.pontoReferencia),
          motivo: String(body.motivo),
          status: 'SOLICITADA',
          solicitadoPorUserId: ctx.userId,
        },
      });
      await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'backup_restauracao', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
      return ok(reply, { id: created.id }, { message: 'Solicitação registrada' });
    }
  );

  server.get('/admin/backup/restauracoes', async (request, reply) => {
    const ctx = await requireEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const rows = await prisma.backupRestauracaoTenant.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { id: 'desc' }, take: 50 });
    return ok(reply, rows);
  });

  server.get('/dashboard/me/filtros', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const scope = (request.user as any)?.abrangencia as any;
    const empresaTotal = !!scope?.empresa;
    const scopedObras: number[] = Array.isArray(scope?.obras) ? scope.obras.map((n: any) => Number(n)).filter((n: any) => Number.isInteger(n) && n > 0) : [];

    const obras = await prisma.obra.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(empresaTotal ? {} : scopedObras.length ? { id: { in: scopedObras } } : { id: { in: [] as number[] } }),
      },
      select: { id: true, name: true },
      orderBy: { id: 'desc' },
      take: 1000,
    });

    return ok(reply, {
      empresaTotal,
      diretorias: [],
      unidades: [],
      obras: obras.map((o) => ({ id: o.id, nome: o.name })),
    });
  });

  server.get('/engenharia/obras/responsaveis', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ idObra: z.coerce.number().int().positive() }).parse(request.query || {});
    const obra = await prisma.obra.findUnique({ where: { id: q.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const rows = await prisma.responsavelObra.findMany({
      where: { obraId: obra.id },
      include: { responsavel: true },
      orderBy: { id: 'desc' },
    });

    return ok(
      reply,
      rows.map((r) => ({
        idResponsavelObra: r.id,
        idObra: r.obraId,
        tipo: String(r.role || '').toUpperCase() === 'FISCAL_OBRA' ? 'FISCAL_OBRA' : 'RESPONSAVEL_TECNICO',
        nome: r.responsavel?.name || '',
        registroProfissional: r.responsavel?.crea ?? null,
        cpf: r.responsavel?.cpf ?? null,
        email: r.responsavel?.email ?? null,
        telefone: r.responsavel?.phone ?? null,
        ativo: r.endDate == null,
      }))
    );
  });

  server.post('/engenharia/obras/responsaveis', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        idObra: z.number().int().positive(),
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        nome: z.string().min(2),
        registroProfissional: z.string().optional().nullable(),
        cpf: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        ativo: z.boolean().default(true),
      })
      .parse(request.body || {});

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const cpf = body.cpf ? onlyDigits(String(body.cpf)) : '';
    const email = body.email ? normalizeEmail(String(body.email)) : '';

    let resp = null as any;
    if (cpf) resp = await prisma.responsavelTecnico.findFirst({ where: { tenantId: ctx.tenantId, cpf } }).catch(() => null);
    if (!resp && email) resp = await prisma.responsavelTecnico.findFirst({ where: { tenantId: ctx.tenantId, email } }).catch(() => null);

    if (!resp) {
      resp = await prisma.responsavelTecnico.create({
        data: {
          tenantId: ctx.tenantId,
          name: String(body.nome),
          crea: body.registroProfissional ?? null,
          cpf: cpf || null,
          email: email || null,
          phone: body.telefone ?? null,
        },
      });
    } else {
      resp = await prisma.responsavelTecnico.update({
        where: { id: resp.id },
        data: {
          name: String(body.nome),
          crea: body.registroProfissional ?? null,
          cpf: cpf || null,
          email: email || null,
          phone: body.telefone ?? null,
        },
      });
    }

    const created = await prisma.responsavelObra.create({
      data: {
        obraId: obra.id,
        responsavelId: resp.id,
        role: body.tipo,
        endDate: body.ativo ? null : new Date(),
      },
    });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsaveis', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: { ...created, responsavelId: resp.id } });
    return ok(reply, { idResponsavelObra: created.id }, { message: 'Responsável cadastrado' });
  });

  server.put('/engenharia/obras/responsaveis/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        idObra: z.number().int().positive(),
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        nome: z.string().min(2),
        registroProfissional: z.string().optional().nullable(),
        cpf: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        ativo: z.boolean().default(true),
      })
      .parse(request.body || {});

    const current = await prisma.responsavelObra.findUnique({ where: { id }, include: { responsavel: true, obra: { select: { tenantId: true } } } }).catch(() => null);
    if (!current || current.obra?.tenantId !== ctx.tenantId) return fail(reply, 404, 'Registro não encontrado');

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const cpf = body.cpf ? onlyDigits(String(body.cpf)) : '';
    const email = body.email ? normalizeEmail(String(body.email)) : '';

    const respUpdated = await prisma.responsavelTecnico.update({
      where: { id: current.responsavelId },
      data: {
        name: String(body.nome),
        crea: body.registroProfissional ?? null,
        cpf: cpf || null,
        email: email || null,
        phone: body.telefone ?? null,
      },
    });

    const updated = await prisma.responsavelObra.update({
      where: { id },
      data: {
        obraId: obra.id,
        role: body.tipo,
        endDate: body.ativo ? null : new Date(),
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsaveis', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: { ...updated, responsavel: respUpdated } as any });
    return ok(reply, {}, { message: 'Responsável atualizado' });
  });

  server.delete('/engenharia/obras/responsaveis/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const current = await prisma.responsavelObra.findUnique({ where: { id }, include: { obra: { select: { tenantId: true } } } }).catch(() => null);
    if (!current || current.obra?.tenantId !== ctx.tenantId) return fail(reply, 404, 'Registro não encontrado');
    await prisma.responsavelObra.delete({ where: { id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsaveis', idRegistro: String(id), acao: 'DELETE', dadosAnteriores: current as any });
    return ok(reply, {}, { message: 'Responsável removido' });
  });

  const LICITACAO_STATUS = ['PREVISTA', 'EM_ANALISE', 'EM_PREPARACAO', 'PARTICIPANDO', 'AGUARDANDO_RESULTADO', 'ENCERRADA', 'VENCIDA', 'DESISTIDA'] as const;

  function dateOnlyToIso(value: Date | null) {
    if (!value) return null;
    return new Date(value).toISOString().slice(0, 10);
  }

  function parseDateOnly(input: any) {
    const s = String(input ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isFinalLicitacaoStatus(status: string) {
    const s = String(status || '').toUpperCase();
    return s === 'ENCERRADA' || s === 'VENCIDA' || s === 'DESISTIDA';
  }

  function isClosedRecursoStatus(status: string) {
    const s = String(status || '').toUpperCase();
    if (!s) return false;
    if (s.includes('CONCL')) return true;
    if (s.includes('ENCERR')) return true;
    if (s.includes('FINAL')) return true;
    if (s.includes('RESPOND')) return true;
    if (s.includes('DEFER')) return true;
    if (s.includes('INDEFER')) return true;
    return false;
  }

  const CONTRAPARTE_CLASSIFICACOES = ['EXCELENTE', 'BOA', 'REGULAR', 'EM_AVALIACAO', 'NAO_RECOMENDADO'] as const;
  const CONTRAPARTE_GRAVIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

  function normalizeListParam(value: unknown) {
    const s = String(value ?? '').trim();
    if (!s) return [];
    return s
      .split(',')
      .map((v) => String(v || '').trim().toUpperCase())
      .filter(Boolean);
  }

  server.get('/engenharia/contrapartes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const q = z
      .object({
        q: z.string().optional(),
        tipo: z.enum(['PJ', 'PF']).optional(),
        status: z.enum(['ATIVO', 'INATIVO']).optional(),
        classificacaoStatus: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
      })
      .parse(request.query || {});

    const search = String(q.q || '').trim();
    const cidade = q.cidade ? String(q.cidade).trim() : '';
    const uf = q.uf ? String(q.uf).trim().toUpperCase() : '';
    const classificacoes = normalizeListParam(q.classificacaoStatus).filter((s) => (CONTRAPARTE_CLASSIFICACOES as readonly string[]).includes(s));

    const where: any = {
      tenantId: ctx.tenantId,
      ...(q.tipo ? { tipo: q.tipo } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(classificacoes.length ? { classificacaoStatus: { in: classificacoes } } : {}),
      ...(cidade ? { cidade } : {}),
      ...(uf ? { uf } : {}),
      ...(search
        ? {
            OR: [
              { nomeRazao: { contains: search, mode: 'insensitive' } },
              { documento: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await prisma.engenhariaContraparte.findMany({
      where,
      orderBy: { nomeRazao: 'asc' },
      take: 500,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idContraparte: r.id,
        tipo: r.tipo,
        nomeRazao: r.nomeRazao,
        documento: r.documento,
        email: r.email,
        telefone: r.telefone,
        status: r.status,
        classificacaoStatus: r.classificacaoStatus,
        observacao: r.observacao,
        cep: r.cep,
        logradouro: r.logradouro,
        numero: r.numero,
        complemento: r.complemento,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        latitude: r.latitude,
        longitude: r.longitude,
        criadoEm: r.createdAt,
      }))
    );
  });

  server.post('/engenharia/contrapartes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        tipo: z.enum(['PJ', 'PF']),
        nomeRazao: z.string().min(1),
        documento: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        classificacaoStatus: z.enum(CONTRAPARTE_CLASSIFICACOES).optional(),
        observacao: z.string().optional().nullable(),
        cep: z.string().optional().nullable(),
        logradouro: z.string().optional().nullable(),
        numero: z.string().optional().nullable(),
        complemento: z.string().optional().nullable(),
        bairro: z.string().optional().nullable(),
        cidade: z.string().optional().nullable(),
        uf: z.string().optional().nullable(),
        latitude: z.string().optional().nullable(),
        longitude: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const documentoDigits = body.documento ? onlyDigits(String(body.documento)) : '';
    if (documentoDigits && documentoDigits.length !== 11 && documentoDigits.length !== 14) {
      return fail(reply, 422, 'Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos).');
    }

    if (documentoDigits) {
      const exists = await prisma.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 as ok
        FROM "EngenhariaContraparte" c
        WHERE c."tenantId" = ${ctx.tenantId}
          AND regexp_replace(COALESCE(c."documento", ''), '\\D', '', 'g') = ${documentoDigits}
        LIMIT 1
      `;
      if (Array.isArray(exists) && exists.length > 0) return fail(reply, 409, 'Já existe uma contraparte com este CPF/CNPJ.');
    }

    const created = await prisma.engenhariaContraparte.create({
      data: {
        tenantId: ctx.tenantId,
        tipo: body.tipo,
        nomeRazao: body.nomeRazao.trim(),
        documento: documentoDigits ? documentoDigits : null,
        email: body.email ? String(body.email).trim() : null,
        telefone: body.telefone ? String(body.telefone).trim() : null,
        status: 'ATIVO',
        classificacaoStatus: body.classificacaoStatus || 'EM_AVALIACAO',
        observacao: body.observacao ? String(body.observacao).trim() : null,
        cep: body.cep ? String(body.cep).trim() : null,
        logradouro: body.logradouro ? String(body.logradouro).trim() : null,
        numero: body.numero ? String(body.numero).trim() : null,
        complemento: body.complemento ? String(body.complemento).trim() : null,
        bairro: body.bairro ? String(body.bairro).trim() : null,
        cidade: body.cidade ? String(body.cidade).trim() : null,
        uf: body.uf ? String(body.uf).trim().toUpperCase() : null,
        latitude: body.latitude ? String(body.latitude).trim() : null,
        longitude: body.longitude ? String(body.longitude).trim() : null,
        usuarioCriadorId: ctx.userId,
      },
      select: { id: true },
    });

    return ok(reply, { idContraparte: created.id });
  });

  server.put('/engenharia/contrapartes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        tipo: z.enum(['PJ', 'PF']).optional(),
        nomeRazao: z.string().min(1).optional(),
        documento: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        status: z.enum(['ATIVO', 'INATIVO']).optional(),
        classificacaoStatus: z.enum(CONTRAPARTE_CLASSIFICACOES).optional(),
        observacao: z.string().optional().nullable(),
        cep: z.string().optional().nullable(),
        logradouro: z.string().optional().nullable(),
        numero: z.string().optional().nullable(),
        complemento: z.string().optional().nullable(),
        bairro: z.string().optional().nullable(),
        cidade: z.string().optional().nullable(),
        uf: z.string().optional().nullable(),
        latitude: z.string().optional().nullable(),
        longitude: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const existing = await prisma.engenhariaContraparte.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!existing) return fail(reply, 404, 'Contraparte não encontrada');

    const documentoDigits = body.documento !== undefined ? (body.documento ? onlyDigits(String(body.documento)) : '') : null;
    if (documentoDigits != null && documentoDigits && documentoDigits.length !== 11 && documentoDigits.length !== 14) {
      return fail(reply, 422, 'Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos).');
    }

    if (documentoDigits != null && documentoDigits) {
      const exists = await prisma.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 as ok
        FROM "EngenhariaContraparte" c
        WHERE c."tenantId" = ${ctx.tenantId}
          AND c."id" <> ${params.id}
          AND regexp_replace(COALESCE(c."documento", ''), '\\D', '', 'g') = ${documentoDigits}
        LIMIT 1
      `;
      if (Array.isArray(exists) && exists.length > 0) return fail(reply, 409, 'Já existe uma contraparte com este CPF/CNPJ.');
    }

    const updated = await prisma.engenhariaContraparte.update({
      where: { id: params.id },
      data: {
        ...(body.tipo ? { tipo: body.tipo } : {}),
        ...(body.nomeRazao ? { nomeRazao: body.nomeRazao.trim() } : {}),
        ...(body.documento !== undefined ? { documento: documentoDigits ? documentoDigits : null } : {}),
        ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
        ...(body.telefone !== undefined ? { telefone: body.telefone ? String(body.telefone).trim() : null } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.classificacaoStatus ? { classificacaoStatus: body.classificacaoStatus } : {}),
        ...(body.observacao !== undefined ? { observacao: body.observacao ? String(body.observacao).trim() : null } : {}),
        ...(body.cep !== undefined ? { cep: body.cep ? String(body.cep).trim() : null } : {}),
        ...(body.logradouro !== undefined ? { logradouro: body.logradouro ? String(body.logradouro).trim() : null } : {}),
        ...(body.numero !== undefined ? { numero: body.numero ? String(body.numero).trim() : null } : {}),
        ...(body.complemento !== undefined ? { complemento: body.complemento ? String(body.complemento).trim() : null } : {}),
        ...(body.bairro !== undefined ? { bairro: body.bairro ? String(body.bairro).trim() : null } : {}),
        ...(body.cidade !== undefined ? { cidade: body.cidade ? String(body.cidade).trim() : null } : {}),
        ...(body.uf !== undefined ? { uf: body.uf ? String(body.uf).trim().toUpperCase() : null } : {}),
        ...(body.latitude !== undefined ? { latitude: body.latitude ? String(body.latitude).trim() : null } : {}),
        ...(body.longitude !== undefined ? { longitude: body.longitude ? String(body.longitude).trim() : null } : {}),
      },
      select: { id: true },
    });

    return ok(reply, { idContraparte: updated.id });
  });

  server.delete('/engenharia/contrapartes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const existing = await prisma.engenhariaContraparte.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { id: true, documento: true } });
    if (!existing) return fail(reply, 404, 'Contraparte não encontrada');

    const documentoDigits = existing.documento ? onlyDigits(String(existing.documento)) : '';
    if (documentoDigits) {
      const linked = await prisma.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 as ok
        FROM "Contrato" c
        WHERE c."tenantId" = ${ctx.tenantId}
          AND regexp_replace(COALESCE(c."empresaParceiraDocumento", ''), '\\D', '', 'g') = ${documentoDigits}
        LIMIT 1
      `;
      if (Array.isArray(linked) && linked.length > 0) return fail(reply, 409, 'Não é possível excluir: existe contrato vinculado a esta contraparte.');
    }

    await prisma.engenhariaContraparte.update({ where: { id: params.id }, data: { status: 'INATIVO' } });
    return ok(reply, { success: true });
  });

  server.get('/engenharia/contrapartes/:id/documentos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const existing = await prisma.engenhariaContraparte.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!existing) return fail(reply, 404, 'Contraparte não encontrada');

    const rows = await prisma.engenhariaContraparteDocumento.findMany({
      where: { tenantId: ctx.tenantId, contraparteId: params.id },
      orderBy: { id: 'desc' },
      take: 200,
      select: { id: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, createdAt: true },
    });

    return ok(
      reply,
      rows.map((r) => ({
        idDocumento: r.id,
        nomeArquivo: r.nomeArquivo,
        mimeType: r.mimeType,
        tamanhoBytes: r.tamanhoBytes,
        criadoEm: r.createdAt,
      }))
    );
  });

  server.post('/engenharia/contrapartes/:id/documentos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        nomeArquivo: z.string().min(1),
        mimeType: z.string().min(1),
        conteudoBase64: z.string().min(1),
      })
      .parse(request.body || {});

    const existing = await prisma.engenhariaContraparte.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!existing) return fail(reply, 404, 'Contraparte não encontrada');

    const raw = String(body.conteudoBase64 || '');
    const base64 = raw.includes('base64,') ? raw.split('base64,').slice(1).join('base64,') : raw;
    let buf: Buffer;
    try {
      buf = Buffer.from(base64, 'base64');
    } catch {
      return fail(reply, 422, 'Arquivo inválido (base64).');
    }
    if (!buf || !buf.length) return fail(reply, 422, 'Arquivo vazio.');
    if (buf.length > 10 * 1024 * 1024) return fail(reply, 413, 'Arquivo muito grande (limite 10MB).');

    const created = await prisma.engenhariaContraparteDocumento.create({
      data: {
        tenantId: ctx.tenantId,
        contraparteId: params.id,
        nomeArquivo: String(body.nomeArquivo).trim(),
        mimeType: String(body.mimeType).trim(),
        tamanhoBytes: buf.length,
        conteudo: buf,
        actorUserId: ctx.userId,
      },
      select: { id: true },
    });

    return ok(reply, { idDocumento: created.id });
  });

  server.get('/engenharia/contrapartes/:id/documentos/:docId/download', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z
      .object({ id: z.coerce.number().int().positive(), docId: z.coerce.number().int().positive() })
      .parse(request.params || {});

    const doc = await prisma.engenhariaContraparteDocumento
      .findFirst({
        where: { tenantId: ctx.tenantId, contraparteId: params.id, id: params.docId },
        select: { nomeArquivo: true, mimeType: true, conteudo: true },
      })
      .catch(() => null);
    if (!doc) return fail(reply, 404, 'Documento não encontrado');

    reply.header('Content-Type', doc.mimeType || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nomeArquivo || 'documento')}"`);
    return reply.send(doc.conteudo);
  });

  server.delete('/engenharia/contrapartes/:id/documentos/:docId', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z
      .object({ id: z.coerce.number().int().positive(), docId: z.coerce.number().int().positive() })
      .parse(request.params || {});

    const existing = await prisma.engenhariaContraparteDocumento.findFirst({
      where: { tenantId: ctx.tenantId, contraparteId: params.id, id: params.docId },
      select: { id: true },
    });
    if (!existing) return fail(reply, 404, 'Documento não encontrado');

    await prisma.engenhariaContraparteDocumento.delete({ where: { id: params.docId } });
    return ok(reply, { success: true });
  });

  server.get('/engenharia/contrapartes/:id/avaliacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const rows = await prisma.engenhariaContraparteAvaliacao.findMany({
      where: { tenantId: ctx.tenantId, contraparteId: params.id },
      orderBy: { id: 'desc' },
      take: 200,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idAvaliacao: r.id,
        nota: r.nota == null ? null : Number(r.nota),
        comentario: r.comentario,
        criadoEm: r.createdAt,
      }))
    );
  });

  server.post('/engenharia/contrapartes/:id/avaliacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        nota: z.number().int().min(0).max(10).optional().nullable(),
        comentario: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const comentario = body.comentario ? String(body.comentario).trim() : null;
    const nota = body.nota == null ? null : body.nota;
    if (nota == null && !comentario) return fail(reply, 422, 'Informe nota ou comentário');

    const created = await prisma.engenhariaContraparteAvaliacao.create({
      data: { tenantId: ctx.tenantId, contraparteId: params.id, nota, comentario, usuarioCriadorId: ctx.userId },
      select: { id: true },
    });
    return ok(reply, { idAvaliacao: created.id });
  });

  server.get('/engenharia/contrapartes/:id/ocorrencias', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const rows = await prisma.engenhariaContraparteOcorrencia.findMany({
      where: { tenantId: ctx.tenantId, contraparteId: params.id },
      orderBy: { id: 'desc' },
      take: 200,
    });

    return ok(
      reply,
      rows.map((o) => ({
        idOcorrencia: o.id,
        idContratoLocacao: o.contratoLocacaoId,
        tipo: o.tipo,
        gravidade: o.gravidade,
        dataOcorrencia: o.dataOcorrencia ? o.dataOcorrencia.toISOString().slice(0, 10) : null,
        descricao: o.descricao,
        criadoEm: o.createdAt,
      }))
    );
  });

  server.post('/engenharia/contrapartes/:id/ocorrencias', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        idContratoLocacao: z.number().int().positive().optional().nullable(),
        tipo: z.string().optional().nullable(),
        gravidade: z.enum(CONTRAPARTE_GRAVIDADES).default('MEDIA'),
        dataOcorrencia: z.string().optional().nullable(),
        descricao: z.string().min(1),
      })
      .parse(request.body || {});

    const dataOcorrencia = body.dataOcorrencia ? new Date(String(body.dataOcorrencia)) : null;
    const created = await prisma.engenhariaContraparteOcorrencia.create({
      data: {
        tenantId: ctx.tenantId,
        contraparteId: params.id,
        contratoLocacaoId: body.idContratoLocacao ?? null,
        tipo: body.tipo ? String(body.tipo).trim() : null,
        gravidade: body.gravidade,
        dataOcorrencia: dataOcorrencia && !Number.isNaN(dataOcorrencia.getTime()) ? dataOcorrencia : null,
        descricao: String(body.descricao).trim(),
        usuarioCriadorId: ctx.userId,
      },
      select: { id: true },
    });
    return ok(reply, { idOcorrencia: created.id });
  });

  server.get('/engenharia/contratos-locacao', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    z.object({ idContraparte: z.coerce.number().int().positive() }).parse(request.query || {});
    return ok(reply, []);
  });

  server.get('/engenharia/licitacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const q = z
      .object({
        incluirSaude: z.string().optional(),
        diasAlerta: z.string().optional(),
      })
      .parse(request.query || {});

    const incluirSaude = q.incluirSaude === '1';
    const diasAlertaNum = Math.max(0, Number.parseInt(String(q.diasAlerta || '30'), 10) || 30);
    const now = new Date();
    const alertaAte = addDays(now, diasAlertaNum);

    const rows = await prisma.engenhariaLicitacao.findMany({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: { id: 'desc' },
      take: 500,
      select: {
        id: true,
        titulo: true,
        orgaoContratante: true,
        status: true,
        dataAbertura: true,
        dataEncerramento: true,
        orcamentoId: true,
      },
    });

    const licitacaoIds = rows.map((r) => r.id);

    const recursosByLicitacaoId = new Map<number, Array<{ prazoResposta: Date | null; status: string }>>();
    const docValidadesByLicitacaoId = new Map<number, Array<Date>>();

    if (incluirSaude && licitacaoIds.length > 0) {
      const recursos = await prisma.engenhariaLicitacaoRecurso.findMany({
        where: { tenantId: ctx.tenantId, licitacaoId: { in: licitacaoIds } },
        select: { licitacaoId: true, prazoResposta: true, status: true },
      });
      for (const r of recursos) {
        const key = r.licitacaoId;
        const arr = recursosByLicitacaoId.get(key) || [];
        arr.push({ prazoResposta: r.prazoResposta ?? null, status: r.status });
        recursosByLicitacaoId.set(key, arr);
      }

      const vinculos = await prisma.engenhariaLicitacaoDocumento.findMany({
        where: { tenantId: ctx.tenantId, licitacaoId: { in: licitacaoIds } },
        select: { licitacaoId: true, documentoEmpresaId: true },
      });
      const docIds = Array.from(new Set(vinculos.map((v) => v.documentoEmpresaId)));
      const docs = docIds.length
        ? await prisma.engenhariaDocumentoEmpresa.findMany({
            where: { tenantId: ctx.tenantId, id: { in: docIds } },
            select: { id: true, dataValidade: true },
          })
        : [];
      const docsById = new Map<number, Date | null>();
      for (const d of docs) docsById.set(d.id, d.dataValidade ?? null);

      for (const v of vinculos) {
        const dv = docsById.get(v.documentoEmpresaId) || null;
        if (!dv) continue;
        const key = v.licitacaoId;
        const arr = docValidadesByLicitacaoId.get(key) || [];
        arr.push(dv);
        docValidadesByLicitacaoId.set(key, arr);
      }
    }

    const data = rows.map((r) => {
      const saude = incluirSaude
        ? (() => {
            let criticos = 0;
            let alertas = 0;
            let infos = 0;

            if (!isFinalLicitacaoStatus(r.status) && r.dataEncerramento) {
              const d = new Date(r.dataEncerramento);
              if (d.getTime() < now.getTime()) criticos += 1;
              else if (d.getTime() <= alertaAte.getTime()) alertas += 1;
            }

            const recursos = recursosByLicitacaoId.get(r.id) || [];
            for (const rc of recursos) {
              if (isClosedRecursoStatus(rc.status)) continue;
              if (!rc.prazoResposta) {
                infos += 1;
                continue;
              }
              const d = new Date(rc.prazoResposta);
              if (d.getTime() < now.getTime()) criticos += 1;
              else if (d.getTime() <= alertaAte.getTime()) alertas += 1;
            }

            const docs = docValidadesByLicitacaoId.get(r.id) || [];
            for (const dv of docs) {
              const d = new Date(dv);
              if (d.getTime() < now.getTime()) criticos += 1;
              else if (d.getTime() <= alertaAte.getTime()) alertas += 1;
            }

            return { criticos, alertas, infos };
          })()
        : undefined;

      return {
        idLicitacao: r.id,
        titulo: r.titulo,
        orgao: r.orgaoContratante ?? null,
        status: r.status,
        dataAbertura: dateOnlyToIso(r.dataAbertura ?? null),
        idOrcamento: r.orcamentoId ?? null,
        saude,
      };
    });

    return ok(reply, data);
  });

  server.post('/engenharia/licitacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        titulo: z.string().min(1),
        orgao: z.string().optional().nullable(),
        objeto: z.string().optional().nullable(),
        status: z.enum(LICITACAO_STATUS).optional().nullable(),
        fase: z.string().optional().nullable(),
        dataAbertura: z.string().optional().nullable(),
        dataEncerramento: z.string().optional().nullable(),
        responsavelNome: z.string().optional().nullable(),
        portalUrl: z.string().optional().nullable(),
        observacoes: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const created = await prisma.engenhariaLicitacao.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: String(body.titulo),
        orgaoContratante: body.orgao ?? null,
        objeto: body.objeto ?? null,
        status: body.status ?? 'EM_ANALISE',
        fase: body.fase ?? null,
        dataAbertura: parseDateOnly(body.dataAbertura),
        dataEncerramento: parseDateOnly(body.dataEncerramento),
        responsavelNome: body.responsavelNome ?? null,
        portalUrl: body.portalUrl ?? null,
        observacoes: body.observacoes ?? null,
        ativo: true,
        usuarioCriadorId: ctx.userId,
      },
    });

    return ok(reply, { idLicitacao: created.id }, { message: 'Licitação criada' });
  });

  server.get('/engenharia/licitacoes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const row = await prisma.engenhariaLicitacao.findFirst({ where: { id, tenantId: ctx.tenantId, ativo: true } });
    if (!row) return fail(reply, 404, 'Licitação não encontrada');
    return ok(reply, {
      idLicitacao: row.id,
      titulo: row.titulo,
      orgao: row.orgaoContratante ?? null,
      objeto: row.objeto ?? null,
      status: row.status,
      fase: row.fase ?? null,
      dataAbertura: dateOnlyToIso(row.dataAbertura ?? null),
      dataEncerramento: dateOnlyToIso(row.dataEncerramento ?? null),
      idOrcamento: row.orcamentoId ?? null,
      responsavelNome: row.responsavelNome ?? null,
      portalUrl: row.portalUrl ?? null,
      observacoes: row.observacoes ?? null,
    });
  });

  server.put('/engenharia/licitacoes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        titulo: z.string().optional(),
        orgao: z.string().optional().nullable(),
        objeto: z.string().optional().nullable(),
        status: z.enum(LICITACAO_STATUS).optional(),
        fase: z.string().optional().nullable(),
        dataAbertura: z.string().optional().nullable(),
        dataEncerramento: z.string().optional().nullable(),
        idOrcamento: z.number().int().optional().nullable(),
        responsavelNome: z.string().optional().nullable(),
        portalUrl: z.string().optional().nullable(),
        observacoes: z.string().optional().nullable(),
      })
      .passthrough()
      .parse(request.body || {});

    const current = await prisma.engenhariaLicitacao.findFirst({ where: { id, tenantId: ctx.tenantId, ativo: true } });
    if (!current) return fail(reply, 404, 'Licitação não encontrada');

    const updated = await prisma.engenhariaLicitacao.update({
      where: { id },
      data: {
        titulo: typeof body.titulo === 'string' ? String(body.titulo) : undefined,
        orgaoContratante: body.orgao !== undefined ? (body.orgao ?? null) : undefined,
        objeto: body.objeto !== undefined ? (body.objeto ?? null) : undefined,
        status: typeof body.status === 'string' ? String(body.status) : undefined,
        fase: body.fase !== undefined ? (body.fase ?? null) : undefined,
        dataAbertura: body.dataAbertura !== undefined ? parseDateOnly(body.dataAbertura) : undefined,
        dataEncerramento: body.dataEncerramento !== undefined ? parseDateOnly(body.dataEncerramento) : undefined,
        orcamentoId: body.idOrcamento !== undefined ? (body.idOrcamento ?? null) : undefined,
        responsavelNome: body.responsavelNome !== undefined ? (body.responsavelNome ?? null) : undefined,
        portalUrl: body.portalUrl !== undefined ? (body.portalUrl ?? null) : undefined,
        observacoes: body.observacoes !== undefined ? (body.observacoes ?? null) : undefined,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_licitacoes', idRegistro: String(updated.id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
    return ok(reply, {}, { message: 'Licitação atualizada' });
  });

  server.delete('/engenharia/licitacoes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const current = await prisma.engenhariaLicitacao.findFirst({ where: { id, tenantId: ctx.tenantId, ativo: true } });
    if (!current) return fail(reply, 404, 'Licitação não encontrada');
    const updated = await prisma.engenhariaLicitacao.update({ where: { id }, data: { ativo: false } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_licitacoes', idRegistro: String(updated.id), acao: 'DELETE', dadosAnteriores: current as any, dadosNovos: updated as any });
    return ok(reply, {}, { message: 'Licitação removida' });
  });

  server.get('/engenharia/licitacoes/documentos-empresa', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ q: z.string().optional(), categoria: z.string().optional() }).parse(request.query || {});
    const term = (q.q || '').trim().toLowerCase();
    const cat = (q.categoria || '').trim().toUpperCase();

    const rows = await prisma.engenhariaDocumentoEmpresa.findMany({
      where: {
        tenantId: ctx.tenantId,
        ativo: true,
        ...(cat ? { categoria: cat } : {}),
        ...(term
          ? {
              OR: [{ nome: { contains: term, mode: 'insensitive' } }, { numero: { contains: term, mode: 'insensitive' } }, { orgaoEmissor: { contains: term, mode: 'insensitive' } }],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 1000,
    });

    const now = new Date();
    const data = rows.map((r) => {
      const validade = r.dataValidade ? new Date(r.dataValidade) : null;
      let status = 'OK';
      if (validade && validade.getTime() < now.getTime()) status = 'VENCIDO';
      return {
        idDocumentoEmpresa: r.id,
        categoria: r.categoria,
        nome: r.nome,
        numero: r.numero ?? null,
        orgaoEmissor: r.orgaoEmissor ?? null,
        dataValidade: dateOnlyToIso(validade),
        status,
        idDocumentoRegistro: r.documentoRegistroId ?? 0,
      };
    });

    return ok(reply, data);
  });

  server.post('/engenharia/licitacoes/documentos-empresa', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        categoria: z.string().min(1),
        nome: z.string().min(1),
        numero: z.string().optional().nullable(),
        orgaoEmissor: z.string().optional().nullable(),
        dataEmissao: z.string().optional().nullable(),
        dataValidade: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const created = await prisma.engenhariaDocumentoEmpresa.create({
      data: {
        tenantId: ctx.tenantId,
        categoria: String(body.categoria).trim().toUpperCase(),
        nome: String(body.nome).trim(),
        numero: body.numero ?? null,
        orgaoEmissor: body.orgaoEmissor ?? null,
        dataEmissao: parseDateOnly(body.dataEmissao),
        dataValidade: parseDateOnly(body.dataValidade),
        documentoRegistroId: null,
        ativo: true,
        usuarioCriadorId: ctx.userId,
      },
    });
    return ok(reply, { idDocumentoEmpresa: created.id }, { message: 'Documento criado' });
  });

  server.get('/engenharia/licitacoes/acervo-empresa', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ q: z.string().optional(), tipo: z.string().optional() }).parse(request.query || {});
    const term = (q.q || '').trim().toLowerCase();
    const tipo = (q.tipo || '').trim().toUpperCase();

    const rows = await prisma.engenhariaAcervoEmpresa.findMany({
      where: {
        tenantId: ctx.tenantId,
        ativo: true,
        ...(tipo ? { tipo } : {}),
        ...(term
          ? {
              OR: [{ titulo: { contains: term, mode: 'insensitive' } }, { numeroDocumento: { contains: term, mode: 'insensitive' } }, { orgaoEmissor: { contains: term, mode: 'insensitive' } }, { nomeObra: { contains: term, mode: 'insensitive' } }],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 1000,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idAcervo: r.id,
        titulo: r.titulo,
        descricao: r.descricao ?? null,
        tipo: r.tipo,
        numeroDocumento: r.numeroDocumento ?? null,
        orgaoEmissor: r.orgaoEmissor ?? null,
        dataEmissao: dateOnlyToIso(r.dataEmissao ?? null),
        nomeObra: r.nomeObra ?? null,
        contratante: r.contratante ?? null,
        localObra: r.localObra ?? null,
        valorObra: r.valorObra == null ? null : Number(r.valorObra),
        dataInicio: dateOnlyToIso(r.dataInicio ?? null),
        dataFim: dateOnlyToIso(r.dataFim ?? null),
        categoria: r.categoria ?? null,
        subcategoria: r.subcategoria ?? null,
        porteObra: r.porteObra ?? null,
        idDocumentoRegistro: r.documentoRegistroId ?? null,
      }))
    );
  });

  server.post('/engenharia/licitacoes/acervo-empresa', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        titulo: z.string().min(1),
        descricao: z.string().optional().nullable(),
        tipo: z.string().optional().nullable(),
        numeroDocumento: z.string().optional().nullable(),
        orgaoEmissor: z.string().optional().nullable(),
        dataEmissao: z.string().optional().nullable(),
        nomeObra: z.string().optional().nullable(),
        contratante: z.string().optional().nullable(),
        localObra: z.string().optional().nullable(),
        valorObra: z.number().optional().nullable(),
        dataInicio: z.string().optional().nullable(),
        dataFim: z.string().optional().nullable(),
        categoria: z.string().optional().nullable(),
        subcategoria: z.string().optional().nullable(),
        porteObra: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const created = await prisma.engenhariaAcervoEmpresa.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: String(body.titulo).trim(),
        descricao: body.descricao ?? null,
        tipo: (body.tipo ? String(body.tipo).trim().toUpperCase() : 'ATESTADO') || 'ATESTADO',
        numeroDocumento: body.numeroDocumento ?? null,
        orgaoEmissor: body.orgaoEmissor ?? null,
        dataEmissao: parseDateOnly(body.dataEmissao),
        nomeObra: body.nomeObra ?? null,
        contratante: body.contratante ?? null,
        localObra: body.localObra ?? null,
        valorObra: body.valorObra == null ? null : body.valorObra,
        dataInicio: parseDateOnly(body.dataInicio),
        dataFim: parseDateOnly(body.dataFim),
        categoria: body.categoria ?? null,
        subcategoria: body.subcategoria ?? null,
        porteObra: body.porteObra ?? null,
        documentoRegistroId: null,
        ativo: true,
        usuarioCriadorId: ctx.userId,
      },
    });
    return ok(reply, { idAcervo: created.id }, { message: 'Acervo criado' });
  });

  server.get('/engenharia/licitacoes/:id/documentos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoDocumento.findMany({
      where: { tenantId: ctx.tenantId, licitacaoId: id },
      include: { documentoEmpresa: true },
      orderBy: { id: 'desc' },
    });
    return ok(
      reply,
      rows.map((r) => ({
        idDocumentoEmpresa: r.documentoEmpresaId,
        categoria: r.documentoEmpresa.categoria,
        nome: r.documentoEmpresa.nome,
        dataValidade: dateOnlyToIso(r.documentoEmpresa.dataValidade ?? null),
        idDocumentoRegistro: r.documentoEmpresa.documentoRegistroId ?? 0,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/documentos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z.object({ idDocumentoEmpresa: z.number().int().positive() }).parse(request.body || {});
    await prisma.engenhariaLicitacaoDocumento.upsert({
      where: { tenantId_licitacaoId_documentoEmpresaId: { tenantId: ctx.tenantId, licitacaoId: id, documentoEmpresaId: body.idDocumentoEmpresa } },
      create: { tenantId: ctx.tenantId, licitacaoId: id, documentoEmpresaId: body.idDocumentoEmpresa, usuarioCriadorId: ctx.userId },
      update: {},
    });
    return ok(reply, {}, { message: 'Vínculo criado' });
  });

  server.delete('/engenharia/licitacoes/:id/documentos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idDocumentoEmpresa } = z.object({ idDocumentoEmpresa: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoDocumento.deleteMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, documentoEmpresaId: Number(idDocumentoEmpresa) } });
    return ok(reply, {}, { message: 'Vínculo removido' });
  });

  server.get('/engenharia/licitacoes/:id/acervo', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoAcervo.findMany({
      where: { tenantId: ctx.tenantId, licitacaoId: id },
      include: { acervoEmpresa: true },
      orderBy: { id: 'desc' },
    });
    return ok(
      reply,
      rows.map((r) => ({
        idAcervo: r.acervoEmpresaId,
        titulo: r.acervoEmpresa.titulo,
        tipo: r.acervoEmpresa.tipo,
        orgaoEmissor: r.acervoEmpresa.orgaoEmissor ?? null,
        numeroDocumento: r.acervoEmpresa.numeroDocumento ?? null,
        dataEmissao: dateOnlyToIso(r.acervoEmpresa.dataEmissao ?? null),
        idDocumentoRegistro: r.acervoEmpresa.documentoRegistroId ?? null,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/acervo', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z.object({ idAcervo: z.number().int().positive() }).parse(request.body || {});
    await prisma.engenhariaLicitacaoAcervo.upsert({
      where: { tenantId_licitacaoId_acervoEmpresaId: { tenantId: ctx.tenantId, licitacaoId: id, acervoEmpresaId: body.idAcervo } },
      create: { tenantId: ctx.tenantId, licitacaoId: id, acervoEmpresaId: body.idAcervo, usuarioCriadorId: ctx.userId },
      update: {},
    });
    return ok(reply, {}, { message: 'Vínculo criado' });
  });

  server.delete('/engenharia/licitacoes/:id/acervo', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idAcervo } = z.object({ idAcervo: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoAcervo.deleteMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, acervoEmpresaId: Number(idAcervo) } });
    return ok(reply, {}, { message: 'Vínculo removido' });
  });

  server.get('/engenharia/licitacoes/:id/checklist', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoChecklistItem.findMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, ativo: true }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    return ok(
      reply,
      rows.map((r) => ({
        idItem: r.id,
        categoria: r.categoria,
        nome: r.nome,
        obrigatorio: r.obrigatorio,
        diasAlerta: r.diasAlerta,
        ordem: r.ordem,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/checklist', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        preset: z.string().optional(),
        categoria: z.string().optional(),
        nome: z.string().optional(),
        obrigatorio: z.boolean().optional(),
        diasAlerta: z.number().int().optional(),
        ordem: z.number().int().optional(),
      })
      .passthrough()
      .parse(request.body || {});

      if (String(body.preset || '').toUpperCase() === 'PADRAO') {
        const defaults = [
          { categoria: 'JURIDICO', nome: 'Contrato social / Estatuto', obrigatorio: true },
          { categoria: 'FISCAL', nome: 'Certidão negativa', obrigatorio: true },
          { categoria: 'TECNICO', nome: 'Atestado de capacidade técnica', obrigatorio: true },
        ];
        await prisma.$transaction(
          defaults.map((d, idx) =>
            prisma.engenhariaLicitacaoChecklistItem.create({
              data: {
                tenantId: ctx.tenantId,
                licitacaoId: id,
                categoria: d.categoria,
                nome: d.nome,
                obrigatorio: d.obrigatorio,
                diasAlerta: 30,
                ordem: idx,
                ativo: true,
                usuarioCriadorId: ctx.userId,
              },
            })
          )
        );
        return ok(reply, {}, { message: 'Checklist criado' });
      }

      const categoria = String(body.categoria || '').trim().toUpperCase();
      const nome = String(body.nome || '').trim();
      if (!categoria || !nome) return fail(reply, 422, 'categoria e nome são obrigatórios');

      const created = await prisma.engenhariaLicitacaoChecklistItem.create({
        data: {
          tenantId: ctx.tenantId,
          licitacaoId: id,
          categoria,
          nome,
          obrigatorio: body.obrigatorio ?? true,
          diasAlerta: typeof body.diasAlerta === 'number' ? body.diasAlerta : 30,
          ordem: typeof body.ordem === 'number' ? body.ordem : 0,
          ativo: true,
          usuarioCriadorId: ctx.userId,
        },
      });

    return ok(reply, { idItem: created.id }, { message: 'Item criado' });
  });

  server.delete('/engenharia/licitacoes/:id/checklist', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idItem } = z.object({ idItem: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoChecklistItem.updateMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, id: Number(idItem) }, data: { ativo: false } });
    return ok(reply, {}, { message: 'Item removido' });
  });

  server.get('/engenharia/licitacoes/:id/andamento', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoAndamentoEvento.findMany({ where: { tenantId: ctx.tenantId, licitacaoId: id }, orderBy: [{ dataEvento: 'desc' }, { id: 'desc' }] });
    return ok(
      reply,
      rows.map((r) => ({
        idEvento: r.id,
        dataEvento: dateOnlyToIso(r.dataEvento),
        tipo: r.tipo,
        titulo: r.titulo,
        descricao: r.descricao ?? null,
        idDocumentoRegistro: r.documentoRegistroId ?? null,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/andamento', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({ dataEvento: z.string().min(10), tipo: z.string().min(1), titulo: z.string().min(1), descricao: z.string().optional().nullable() })
      .parse(request.body || {});
    const created = await prisma.engenhariaLicitacaoAndamentoEvento.create({
      data: {
        tenantId: ctx.tenantId,
        licitacaoId: id,
        dataEvento: parseDateOnly(body.dataEvento) || new Date(),
        tipo: String(body.tipo),
        titulo: String(body.titulo),
        descricao: body.descricao ?? null,
        documentoRegistroId: null,
        usuarioCriadorId: ctx.userId,
      },
    });
    return ok(reply, { idEvento: created.id }, { message: 'Evento criado' });
  });

  server.delete('/engenharia/licitacoes/:id/andamento', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idEvento } = z.object({ idEvento: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoAndamentoEvento.deleteMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, id: Number(idEvento) } });
    return ok(reply, {}, { message: 'Evento removido' });
  });

  server.get('/engenharia/licitacoes/:id/comunicacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoComunicacao.findMany({ where: { tenantId: ctx.tenantId, licitacaoId: id }, orderBy: [{ dataReferencia: 'desc' }, { id: 'desc' }] });
    return ok(
      reply,
      rows.map((r) => ({
        idComunicacao: r.id,
        direcao: r.direcao,
        canal: r.canal,
        dataReferencia: dateOnlyToIso(r.dataReferencia),
        assunto: r.assunto,
        descricao: r.descricao ?? null,
        idDocumentoRegistro: r.documentoRegistroId ?? null,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/comunicacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        direcao: z.string().min(2),
        canal: z.string().optional().nullable(),
        dataReferencia: z.string().min(10),
        assunto: z.string().min(1),
        descricao: z.string().optional().nullable(),
      })
      .parse(request.body || {});
    const created = await prisma.engenhariaLicitacaoComunicacao.create({
      data: {
        tenantId: ctx.tenantId,
        licitacaoId: id,
        direcao: String(body.direcao).toUpperCase(),
        canal: body.canal ? String(body.canal).toUpperCase() : 'EMAIL',
        dataReferencia: parseDateOnly(body.dataReferencia) || new Date(),
        assunto: String(body.assunto),
        descricao: body.descricao ?? null,
        documentoRegistroId: null,
        usuarioCriadorId: ctx.userId,
      },
    });
    return ok(reply, { idComunicacao: created.id }, { message: 'Comunicação criada' });
  });

  server.delete('/engenharia/licitacoes/:id/comunicacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idComunicacao } = z.object({ idComunicacao: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoComunicacao.deleteMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, id: Number(idComunicacao) } });
    return ok(reply, {}, { message: 'Comunicação removida' });
  });

  server.get('/engenharia/licitacoes/:id/recursos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const rows = await prisma.engenhariaLicitacaoRecurso.findMany({ where: { tenantId: ctx.tenantId, licitacaoId: id }, orderBy: [{ id: 'desc' }] });
    return ok(
      reply,
      rows.map((r) => ({
        idRecurso: r.id,
        tipo: r.tipo,
        fase: r.fase ?? null,
        status: r.status,
        dataEnvio: dateOnlyToIso(r.dataEnvio ?? null),
        prazoResposta: dateOnlyToIso(r.prazoResposta ?? null),
        protocolo: r.protocolo ?? null,
        descricao: r.descricao ?? null,
        idDocumentoRegistro: r.documentoRegistroId ?? null,
      }))
    );
  });

  server.post('/engenharia/licitacoes/:id/recursos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        tipo: z.string().min(2),
        fase: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        dataEnvio: z.string().optional().nullable(),
        prazoResposta: z.string().optional().nullable(),
        protocolo: z.string().optional().nullable(),
        descricao: z.string().optional().nullable(),
      })
      .parse(request.body || {});
    const created = await prisma.engenhariaLicitacaoRecurso.create({
      data: {
        tenantId: ctx.tenantId,
        licitacaoId: id,
        tipo: String(body.tipo).toUpperCase(),
        fase: body.fase ?? null,
        status: body.status ? String(body.status).toUpperCase() : 'RASCUNHO',
        dataEnvio: parseDateOnly(body.dataEnvio),
        prazoResposta: parseDateOnly(body.prazoResposta),
        protocolo: body.protocolo ?? null,
        descricao: body.descricao ?? null,
        documentoRegistroId: null,
        usuarioCriadorId: ctx.userId,
      },
    });
    return ok(reply, { idRecurso: created.id }, { message: 'Recurso criado' });
  });

  server.delete('/engenharia/licitacoes/:id/recursos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const { idRecurso } = z.object({ idRecurso: z.coerce.number().int().positive() }).parse(request.query || {});
    await prisma.engenhariaLicitacaoRecurso.deleteMany({ where: { tenantId: ctx.tenantId, licitacaoId: id, id: Number(idRecurso) } });
    return ok(reply, {}, { message: 'Recurso removido' });
  });

  server.get('/engenharia/licitacoes/:id/validar', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const q = z.object({ diasAlerta: z.string().optional() }).parse(request.query || {});
    const diasAlertaNum = Math.max(0, Number.parseInt(String(q.diasAlerta || '30'), 10) || 30);
    const now = new Date();
    const alertaAte = addDays(now, diasAlertaNum);

    const lic = await prisma.engenhariaLicitacao.findFirst({
      where: { tenantId: ctx.tenantId, id, ativo: true },
      select: { id: true, status: true, dataEncerramento: true },
    });
    if (!lic) return fail(reply, 404, 'Licitação não encontrada');

    const recursos = await prisma.engenhariaLicitacaoRecurso.findMany({
      where: { tenantId: ctx.tenantId, licitacaoId: id },
      select: { id: true, tipo: true, status: true, prazoResposta: true },
      orderBy: { id: 'desc' },
    });

    const vinculos = await prisma.engenhariaLicitacaoDocumento.findMany({
      where: { tenantId: ctx.tenantId, licitacaoId: id },
      select: { documentoEmpresaId: true },
    });
    const docIds = Array.from(new Set(vinculos.map((v) => v.documentoEmpresaId)));
    const docs = docIds.length
      ? await prisma.engenhariaDocumentoEmpresa.findMany({
          where: { tenantId: ctx.tenantId, id: { in: docIds } },
          select: { id: true, nome: true, dataValidade: true },
        })
      : [];
    const docsById = new Map<number, { nome: string; dataValidade: Date | null }>();
    for (const d of docs) docsById.set(d.id, { nome: d.nome, dataValidade: d.dataValidade ?? null });

    let criticos = 0;
    let alertas = 0;
    let infos = 0;
    const issues: Array<{ severidade: 'CRITICO' | 'ALERTA' | 'INFO'; codigo: string; titulo: string; detalhe?: string | null }> = [];

    if (!isFinalLicitacaoStatus(lic.status) && lic.dataEncerramento) {
      const d = new Date(lic.dataEncerramento);
      if (d.getTime() < now.getTime()) {
        criticos += 1;
        issues.push({ severidade: 'CRITICO', codigo: 'PRAZO_LICITACAO_VENCIDO', titulo: 'Prazo da licitação vencido', detalhe: dateOnlyToIso(d) });
      } else if (d.getTime() <= alertaAte.getTime()) {
        alertas += 1;
        issues.push({ severidade: 'ALERTA', codigo: 'PRAZO_LICITACAO_PROXIMO', titulo: 'Prazo da licitação próximo', detalhe: dateOnlyToIso(d) });
      }
    }

    for (const rc of recursos) {
      if (isClosedRecursoStatus(rc.status)) continue;
      if (!rc.prazoResposta) {
        infos += 1;
        issues.push({ severidade: 'INFO', codigo: 'RECURSO_SEM_PRAZO', titulo: `Recurso sem prazo (${rc.tipo})`, detalhe: null });
        continue;
      }
      const d = new Date(rc.prazoResposta);
      if (d.getTime() < now.getTime()) {
        criticos += 1;
        issues.push({ severidade: 'CRITICO', codigo: 'RECURSO_PRAZO_VENCIDO', titulo: `Prazo vencido (${rc.tipo})`, detalhe: dateOnlyToIso(d) });
      } else if (d.getTime() <= alertaAte.getTime()) {
        alertas += 1;
        issues.push({ severidade: 'ALERTA', codigo: 'RECURSO_PRAZO_PROXIMO', titulo: `Prazo próximo (${rc.tipo})`, detalhe: dateOnlyToIso(d) });
      }
    }

    for (const v of vinculos) {
      const doc = docsById.get(v.documentoEmpresaId);
      if (!doc?.dataValidade) continue;
      const d = new Date(doc.dataValidade);
      if (d.getTime() < now.getTime()) {
        criticos += 1;
        issues.push({ severidade: 'CRITICO', codigo: 'DOCUMENTO_VENCIDO', titulo: `Documento vencido: ${doc.nome}`, detalhe: dateOnlyToIso(d) });
      } else if (d.getTime() <= alertaAte.getTime()) {
        alertas += 1;
        issues.push({ severidade: 'ALERTA', codigo: 'DOCUMENTO_PRAZO_PROXIMO', titulo: `Documento a vencer: ${doc.nome}`, detalhe: dateOnlyToIso(d) });
      }
    }

    return ok(reply, { resumo: { criticos, alertas, infos }, issues });
  });

  server.get('/engenharia/licitacoes/:id/dossie', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    return ok(reply, { documentos: [], checklist: [], acervo: [], andamento: [], comunicacoes: [], recursos: [] });
  });

  server.post('/engenharia/licitacoes/:id/declaracoes/gerar', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    z.object({ template: z.string().min(2) }).passthrough().parse(request.body || {});
    return ok(reply, { abrirUrl: null }, { message: 'Declaração gerada (placeholder)' });
  });
}
