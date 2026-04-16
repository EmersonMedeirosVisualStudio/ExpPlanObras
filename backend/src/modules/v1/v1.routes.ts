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
}
