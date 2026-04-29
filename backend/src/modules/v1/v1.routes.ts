import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { normalizeEmail, onlyDigits } from '../../utils/validators.js';
import { loadSubjectContext } from '../security-fields/service.js';
import { sanitizeResourceObject } from '../security-fields/sanitizer.js';
import { addTenantHistoryEntry } from '../admin/tenantHistory.service.js';

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

function parseResponsavelObraNotes(notes: any): {
  responsabilidade: string | null;
  docInclusaoTipo: 'ART' | 'RRT' | 'PORTARIA' | 'CONTRATO' | null;
  docInclusaoNumero: string | null;
  docInclusaoDescricao: string | null;
  docBaixaTipo: 'ART' | 'RRT' | 'PORTARIA' | 'CONTRATO' | null;
  docBaixaNumero: string | null;
} {
  const raw = String(notes || '').trim();
  if (!raw) {
    return { responsabilidade: null, docInclusaoTipo: null, docInclusaoNumero: null, docInclusaoDescricao: null, docBaixaTipo: null, docBaixaNumero: null };
  }
  try {
    const parsed = JSON.parse(raw) as any;
    const resp = parsed?.responsabilidade != null ? String(parsed.responsabilidade).trim() : '';
    const inTipo = parsed?.docInclusaoTipo != null ? String(parsed.docInclusaoTipo).trim().toUpperCase() : '';
    const inNum = parsed?.docInclusaoNumero != null ? String(parsed.docInclusaoNumero).trim() : '';
    const inDesc = parsed?.docInclusaoDescricao != null ? String(parsed.docInclusaoDescricao).trim() : '';
    const bxTipo = parsed?.docBaixaTipo != null ? String(parsed.docBaixaTipo).trim().toUpperCase() : '';
    const bxNum = parsed?.docBaixaNumero != null ? String(parsed.docBaixaNumero).trim() : '';
    const validTipo = (v: string): any => (v === 'ART' || v === 'RRT' || v === 'PORTARIA' || v === 'CONTRATO' ? v : null);
    return {
      responsabilidade: resp || null,
      docInclusaoTipo: validTipo(inTipo),
      docInclusaoNumero: inNum || null,
      docInclusaoDescricao: inDesc || null,
      docBaixaTipo: validTipo(bxTipo),
      docBaixaNumero: bxNum || null,
    };
  } catch {
    const legacy = raw.slice(0, 240);
    return { responsabilidade: legacy || null, docInclusaoTipo: null, docInclusaoNumero: null, docInclusaoDescricao: null, docBaixaTipo: null, docBaixaNumero: null };
  }
}

function buildResponsavelObraNotes(input: {
  responsabilidade?: string | null;
  docInclusaoTipo?: 'ART' | 'RRT' | 'PORTARIA' | 'CONTRATO' | null;
  docInclusaoNumero?: string | null;
  docInclusaoDescricao?: string | null;
  docBaixaTipo?: 'ART' | 'RRT' | 'PORTARIA' | 'CONTRATO' | null;
  docBaixaNumero?: string | null;
}) {
  const payload: any = {};
  const responsabilidade = input.responsabilidade != null ? String(input.responsabilidade).trim() : '';
  if (responsabilidade) payload.responsabilidade = responsabilidade;
  const docInclusaoTipo = input.docInclusaoTipo != null ? String(input.docInclusaoTipo).trim().toUpperCase() : '';
  if (docInclusaoTipo) payload.docInclusaoTipo = docInclusaoTipo;
  const docInclusaoNumero = input.docInclusaoNumero != null ? String(input.docInclusaoNumero).trim() : '';
  if (docInclusaoNumero) payload.docInclusaoNumero = docInclusaoNumero;
  const docInclusaoDescricao = input.docInclusaoDescricao != null ? String(input.docInclusaoDescricao).trim() : '';
  if (docInclusaoDescricao) payload.docInclusaoDescricao = docInclusaoDescricao.slice(0, 400);
  const docBaixaTipo = input.docBaixaTipo != null ? String(input.docBaixaTipo).trim().toUpperCase() : '';
  if (docBaixaTipo) payload.docBaixaTipo = docBaixaTipo;
  const docBaixaNumero = input.docBaixaNumero != null ? String(input.docBaixaNumero).trim() : '';
  if (docBaixaNumero) payload.docBaixaNumero = docBaixaNumero;
  const keys = Object.keys(payload);
  if (!keys.length) return null;
  return JSON.stringify(payload);
}

function inferDocTipoFromNumero(numero: string | null): 'ART' | 'RRT' | 'PORTARIA' | 'CONTRATO' {
  const s = String(numero || '').trim().toUpperCase();
  if (s.includes('RRT')) return 'RRT';
  if (s.includes('ART')) return 'ART';
  if (s.includes('PORTARIA')) return 'PORTARIA';
  return 'CONTRATO';
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

function canAccessObraId(obraId: number, scope: any) {
  if (!scope || scope.empresa) return true;
  const obras: number[] = Array.isArray(scope.obras) ? scope.obras.map((n: any) => Number(n)).filter((n: any) => Number.isInteger(n) && n > 0) : [];
  return obras.includes(obraId);
}

function normalizeHeader(h: string) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvTextAuto(text: string) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const sep = semi > comma ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === sep) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => split(l));
  return { headers, rows };
}

function toDec(v: unknown) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const norm = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!norm) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function detectTipoLinha(item: string, und: string, quant: string, valorUnit: string) {
  const hasServ = !!(und.trim() || quant.trim() || valorUnit.trim());
  if (hasServ) return { tipo: 'SERVICO' as const, nivel: item.trim() ? Math.max(0, item.split('.').filter(Boolean).length) : 0 };
  const parts = item.trim() ? item.split('.').filter(Boolean) : [];
  if (parts.length <= 1) return { tipo: 'ITEM' as const, nivel: parts.length };
  return { tipo: 'SUBITEM' as const, nivel: parts.length };
}

async function ensurePlanilhaOrcamentariaTables(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_planilhas_versoes (
      id_planilha BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_obra BIGINT NOT NULL,
      numero_versao INT NOT NULL,
      nome VARCHAR(120) NOT NULL DEFAULT 'Planilha orçamentária',
      atual BOOLEAN NOT NULL DEFAULT TRUE,
      origem VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
      data_base_sbc VARCHAR(16) NULL,
      data_base_sinapi VARCHAR(16) NULL,
      bdi_servicos_sbc NUMERIC(10,4) NULL,
      bdi_servicos_sinapi NUMERIC(10,4) NULL,
      bdi_diferenciado_sbc NUMERIC(10,4) NULL,
      bdi_diferenciado_sinapi NUMERIC(10,4) NULL,
      enc_sociais_sem_des_sbc NUMERIC(10,4) NULL,
      enc_sociais_sem_des_sinapi NUMERIC(10,4) NULL,
      desconto_sbc NUMERIC(10,4) NULL,
      desconto_sinapi NUMERIC(10,4) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      id_usuario_criador BIGINT NOT NULL
    )
  `);
  await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS obras_planilhas_versoes_uk_versao ON obras_planilhas_versoes (tenant_id, id_obra, numero_versao)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS obras_planilhas_versoes_idx_atual ON obras_planilhas_versoes (tenant_id, id_obra, atual)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS obras_planilhas_versoes_idx_obra ON obras_planilhas_versoes (tenant_id, id_obra)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_planilhas_linhas (
      id_linha BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_planilha BIGINT NOT NULL,
      ordem INT NOT NULL DEFAULT 0,
      item VARCHAR(40) NULL,
      codigo VARCHAR(80) NULL,
      fonte VARCHAR(40) NULL,
      servico VARCHAR(260) NULL,
      und VARCHAR(16) NULL,
      quantidade NUMERIC(14,4) NULL,
      valor_unitario NUMERIC(14,6) NULL,
      valor_parcial NUMERIC(14,6) NULL,
      nivel INT NOT NULL DEFAULT 0,
      tipo_linha VARCHAR(16) NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS obras_planilhas_linhas_idx_planilha ON obras_planilhas_linhas (tenant_id, id_planilha, ordem, id_linha)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS obras_planilhas_linhas_idx_tipo ON obras_planilhas_linhas (tenant_id, id_planilha, tipo_linha)`);
}

const ORGANOGRAMA_CARGOS_BASE = [
  'Servente',
  'Pedreiro',
  'Pedreiro de Acabamento',
  'Carpinteiro',
  'Armador',
  'Eletricista',
  'Eletricista Industrial',
  'Encanador',
  'Pintor',
  'Gesseiro',
  'Azulejista',
  'Serralheiro',
  'Soldador',
  'Topógrafo',
  'Auxiliar de Topografia',
  'Mestre de Obras',
  'Encarregado',
  'Engenheiro Civil',
  'Engenheiro de Segurança',
  'Técnico em Edificações',
  'Técnico de Segurança do Trabalho',
  'Apontador',
  'Almoxarife',
  'Operador de Máquinas',
  'Operador de Betoneira',
  'Operador de Retroescavadeira',
  'Operador de Escavadeira',
  'Motorista',
  'Vigia',
  'Auxiliar Administrativo',
  'Comprador',
] as const;

async function ensureOrganogramaCargosBase(tenantId: number) {
  const nomes = ORGANOGRAMA_CARGOS_BASE.map((s) => String(s).trim()).filter(Boolean);
  if (!nomes.length) return;
  await prisma.organizacaoCargo.createMany({
    data: nomes.map((nomeCargo) => ({ tenantId, nomeCargo, ativo: true })),
    skipDuplicates: true,
  });
}

export default async function v1Routes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/organograma/estrutura', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    await ensureOrganogramaCargosBase(ctx.tenantId);

    const [setores, cargos, posicoes, vinculos, ocupacoes] = await Promise.all([
      prisma.organizacaoSetor.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, nomeSetor: true, tipoSetor: true, setorPaiId: true, ativo: true },
        orderBy: [{ nomeSetor: 'asc' }, { id: 'desc' }],
        take: 5000,
      }),
      prisma.organizacaoCargo.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, nomeCargo: true, ativo: true },
        orderBy: [{ nomeCargo: 'asc' }, { id: 'desc' }],
        take: 5000,
      }),
      prisma.organogramaPosicao.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          id: true,
          setorId: true,
          cargoId: true,
          tituloExibicao: true,
          ativo: true,
          setor: { select: { nomeSetor: true } },
          cargo: { select: { nomeCargo: true } },
        },
        orderBy: [{ tituloExibicao: 'asc' }, { id: 'desc' }],
        take: 10000,
      }),
      prisma.organogramaVinculo.findMany({
        where: {
          ativo: true,
          posicaoSuperior: { tenantId: ctx.tenantId },
          posicaoSubordinada: { tenantId: ctx.tenantId },
        },
        select: { id: true, posicaoSuperiorId: true, posicaoSubordinadaId: true },
        orderBy: [{ id: 'desc' }],
        take: 20000,
      }),
      prisma.funcionarioPosicao.findMany({
        where: { vigente: true, posicao: { tenantId: ctx.tenantId } },
        select: {
          id: true,
          funcionarioId: true,
          posicaoId: true,
          dataInicio: true,
          dataFim: true,
          vigente: true,
          funcionario: { select: { nomeCompleto: true } },
        },
        orderBy: [{ vigente: 'desc' }, { id: 'desc' }],
        take: 20000,
      }),
    ]);

    return ok(reply, {
      setores: setores.map((s) => ({
        id: s.id,
        nomeSetor: s.nomeSetor,
        tipoSetor: s.tipoSetor || null,
        idSetorPai: s.setorPaiId ?? null,
        ativo: !!s.ativo,
      })),
      cargos: cargos.map((c) => ({
        id: c.id,
        nomeCargo: c.nomeCargo,
        ativo: !!c.ativo,
      })),
      posicoes: posicoes.map((p) => ({
        id: p.id,
        idSetor: p.setorId,
        idCargo: p.cargoId,
        tituloExibicao: p.tituloExibicao,
        ordemExibicao: 0,
        ativo: !!p.ativo,
        setorNome: p.setor?.nomeSetor || '',
        cargoNome: p.cargo?.nomeCargo || '',
      })),
      vinculos: vinculos.map((v) => ({
        id: v.id,
        idPosicaoSuperior: v.posicaoSuperiorId,
        idPosicaoSubordinada: v.posicaoSubordinadaId,
      })),
      ocupacoes: ocupacoes.map((o) => ({
        id: o.id,
        idFuncionario: o.funcionarioId,
        idPosicao: o.posicaoId,
        funcionarioNome: o.funcionario?.nomeCompleto || '',
        dataInicio: o.dataInicio.toISOString(),
        dataFim: o.dataFim ? o.dataFim.toISOString() : null,
        vigente: !!o.vigente,
      })),
    });
  });

  server.post('/organograma/cargos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        nomeCargo: z.string().min(2),
      })
      .parse(request.body || {});

    const nomeCargo = String(body.nomeCargo || '').trim();
    if (!nomeCargo) return fail(reply, 422, 'Nome do cargo é obrigatório');

    const created = await prisma.organizacaoCargo
      .create({
        data: { tenantId: ctx.tenantId, nomeCargo, ativo: true },
        select: { id: true, nomeCargo: true, ativo: true },
      })
      .catch((e: any) => {
        if (String(e?.code || '') === 'P2002') return null;
        throw e;
      });

    if (!created) return fail(reply, 409, 'Cargo já cadastrado');

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'organizacao_cargos',
      idRegistro: String(created.id),
      acao: 'CREATE',
      dadosNovos: created as any,
    });

    return ok(reply, created, { message: 'Cargo criado' });
  });

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
      select: { id: true, name: true, contratoId: true },
      orderBy: { id: 'desc' },
      take: 1000,
    });

    return ok(reply, {
      empresaTotal,
      diretorias: [],
      unidades: [],
      obras: obras.map((o) => ({ id: o.id, nome: o.name, contratoId: o.contratoId })),
    });
  });

  server.get('/rh/contratos-select', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const contratos = await prisma.contrato.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, numeroContrato: true },
      orderBy: [{ numeroContrato: 'asc' }, { id: 'desc' }],
      take: 1000,
    });

    return ok(
      reply,
      contratos.map((c) => ({
        id: c.id,
        numeroContrato: c.numeroContrato,
      }))
    );
  });

  server.get('/rh/funcionarios', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const query = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        idObra: z.coerce.number().int().optional(),
        idContrato: z.coerce.number().int().optional(),
      })
      .parse(request.query || {});

    const term = query.q ? query.q.trim() : '';
    const cpfTerm = term ? onlyDigits(term) : '';
    const where: any = { tenantId: ctx.tenantId, tipoVinculo: 'FUNCIONARIO', dataFim: null };
    if (term) {
      where.OR = [
        { matricula: { contains: term, mode: 'insensitive' } },
        { funcao: { contains: term, mode: 'insensitive' } },
        { pessoa: { nomeCompleto: { contains: term, mode: 'insensitive' } } },
        ...(cpfTerm ? [{ pessoa: { cpf: { contains: cpfTerm } } }] : []),
      ];
    }

    const vinculos = await prisma.pessoaVinculo.findMany({
      where,
      select: {
        matricula: true,
        funcao: true,
        dataInicio: true,
        ativo: true,
        pessoa: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
          },
        },
      },
      orderBy: [{ pessoa: { nomeCompleto: 'asc' } }, { id: 'desc' }],
      take: query.limit,
    });

    return ok(
      reply,
      vinculos.map((v) => ({
        id: v.pessoa.id,
        matricula: v.matricula ?? '',
        nomeCompleto: v.pessoa.nomeCompleto,
        cpf: v.pessoa.cpf,
        cargoContratual: v.funcao ?? null,
        funcaoPrincipal: null,
        statusFuncional: v.ativo ? 'ATIVO' : 'INATIVO',
        statusCadastroRh: 'OK',
        dataAdmissao: v.dataInicio ? v.dataInicio.toISOString() : '',
        ativo: v.ativo,
        tipoLocal: null,
        idObra: null,
        idUnidade: null,
        localNome: null,
        contratoId: null,
        contratoNumero: null,
        presencaPercent: null,
        custoHora: null,
      }))
    );
  });

  server.get('/rh/funcionarios/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const params = z
      .object({
        id: z.coerce.number().int().positive(),
      })
      .parse((request as any).params || {});

    const id = Number(params.id);

    const funcionario = await prisma.funcionario.findFirst({
      where: { tenantId: ctx.tenantId, id },
      select: {
        id: true,
        matricula: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        cargo: true,
        statusFuncional: true,
        dataAdmissao: true,
        ativo: true,
      },
    });
    if (!funcionario) return fail(reply, 404, 'Funcionário não encontrado');

    const vinculo = await prisma.pessoaVinculo.findFirst({
      where: { tenantId: ctx.tenantId, pessoaId: id, tipoVinculo: 'FUNCIONARIO', dataFim: null },
      select: { matricula: true, funcao: true, dataInicio: true, ativo: true },
      orderBy: [{ id: 'desc' }],
    });

    const matricula = String(vinculo?.matricula || funcionario.matricula || '').trim();
    const cargoContratual = vinculo?.funcao ?? funcionario.cargo ?? null;
    const dataAdmissao = vinculo?.dataInicio ?? funcionario.dataAdmissao ?? null;
    const ativo = typeof vinculo?.ativo === 'boolean' ? vinculo.ativo : Boolean(funcionario.ativo);

    return ok(reply, {
      id: funcionario.id,
      matricula: matricula || '',
      nomeCompleto: funcionario.nomeCompleto,
      cpf: funcionario.cpf,
      cargoContratual,
      funcaoPrincipal: null,
      statusFuncional: String(funcionario.statusFuncional || (ativo ? 'ATIVO' : 'INATIVO')),
      statusCadastroRh: 'OK',
      dataAdmissao: dataAdmissao ? dataAdmissao.toISOString() : '',
      ativo,
      tipoLocal: null,
      idObra: null,
      idUnidade: null,
      localNome: null,
      contratoId: null,
      contratoNumero: null,
      presencaPercent: null,
      custoHora: null,
      nomeSocial: null,
      rg: null,
      orgaoEmissorRg: null,
      dataNascimento: null,
      titulo: null,
      nomeMae: null,
      nomePai: null,
      telefoneWhatsapp: funcionario.telefone ? String(funcionario.telefone) : null,
      idEmpresa: null,
      sexo: null,
      estadoCivil: null,
      pisPasep: null,
      ctpsNumero: null,
      ctpsSerie: null,
      ctpsUf: null,
      cnhNumero: null,
      cnhCategoria: null,
      cboCodigo: null,
      tipoVinculo: 'FUNCIONARIO',
      dataDesligamento: null,
      salarioBase: null,
      emailPessoal: null,
      telefonePrincipal: funcionario.telefone ? String(funcionario.telefone) : null,
      contatoEmergenciaNome: null,
      contatoEmergenciaTelefone: null,
      lotacoes: [],
      supervisoes: [],
      jornadas: [],
      horasExtras: [],
    });
  });

  server.post(
    '/rh/funcionarios/:id/lotacoes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          tipoLotacao: z.enum(['OBRA', 'UNIDADE']),
          idObra: z.coerce.number().int().positive().optional().nullable(),
          idUnidade: z.coerce.number().int().positive().optional().nullable(),
          dataInicio: z.string().min(8),
          observacao: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const { id } = (request.params as any) as { id: number };
      const body = request.body as any;

      const tipoLotacao = String(body.tipoLotacao || '').toUpperCase();
      const idObra = body.idObra == null ? null : Number(body.idObra);
      const idUnidade = body.idUnidade == null ? null : Number(body.idUnidade);
      const dataInicioRaw = String(body.dataInicio || '').slice(0, 10);
      const observacao = body.observacao == null ? null : String(body.observacao).trim();

      if (tipoLotacao !== 'OBRA' && tipoLotacao !== 'UNIDADE') return fail(reply, 422, 'Tipo de lotação inválido');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicioRaw)) return fail(reply, 422, 'Data de início inválida');

      if (tipoLotacao === 'OBRA' && (!idObra || !Number.isFinite(idObra))) return fail(reply, 422, 'Informe a obra');
      if (tipoLotacao === 'UNIDADE' && (!idUnidade || !Number.isFinite(idUnidade))) return fail(reply, 422, 'Informe a unidade');

      const dataInicio = new Date(`${dataInicioRaw}T00:00:00.000Z`);
      if (Number.isNaN(dataInicio.getTime())) return fail(reply, 422, 'Data de início inválida');

      const funcionario = await prisma.funcionario.findFirst({ where: { tenantId: ctx.tenantId, id: Number(id) }, select: { id: true } });
      if (!funcionario) return fail(reply, 404, 'Funcionário não encontrado');

      const created = await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.funcionarioLotacao.updateMany({
          where: { funcionarioId: funcionario.id, atual: true },
          data: { atual: false, dataFim: now },
        });

        const lotacao = await tx.funcionarioLotacao.create({
          data: {
            funcionarioId: funcionario.id,
            tipoLotacao,
            obraId: tipoLotacao === 'OBRA' ? (idObra as number) : null,
            unidadeId: tipoLotacao === 'UNIDADE' ? (idUnidade as number) : null,
            dataInicio,
            dataFim: null,
            atual: true,
            observacao: observacao || null,
          },
          select: { id: true },
        });

        return lotacao;
      });

      await audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entidade: 'funcionario_lotacoes',
        idRegistro: String(created.id),
        acao: 'CREATE',
        dadosNovos: { funcionarioId: funcionario.id, tipoLotacao, idObra, idUnidade, dataInicio: dataInicioRaw, observacao: observacao || null },
      });

      return ok(reply, { id: created.id }, { message: 'Lotação registrada' });
    }
  );

  server.post('/rh/funcionarios', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        matricula: z.string().min(1),
        nomeCompleto: z.string().min(2),
        cpf: z.string().min(1),
        telefoneWhatsapp: z.string().optional().nullable(),
        cargoContratual: z.string().optional().nullable(),
        dataAdmissao: z.string().optional().nullable(),
        ativo: z.boolean().optional().default(true),
      })
      .passthrough()
      .parse(request.body || {});

    const matriculaInput = String(body.matricula || '').trim();
    const nomeCompleto = String(body.nomeCompleto || '').trim();
    const cpfDigits = onlyDigits(String(body.cpf || ''));
    if (!matriculaInput) return fail(reply, 400, 'Campo Matrícula: obrigatório');
    if (!nomeCompleto) return fail(reply, 400, 'Campo Nome completo: obrigatório');
    if (cpfDigits.length !== 11) return fail(reply, 400, 'Campo CPF: deve ter 11 dígitos');

    const telefoneDigits = body.telefoneWhatsapp ? onlyDigits(String(body.telefoneWhatsapp || '')) : '';
    const telefone = telefoneDigits && (telefoneDigits.length === 10 || telefoneDigits.length === 11) ? telefoneDigits : null;
    const cargo = body.cargoContratual ? String(body.cargoContratual || '').trim() : '';

    let dataAdmissao: Date | null = null;
    if (body.dataAdmissao) {
      const d = String(body.dataAdmissao || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dataAdmissao = new Date(`${d}T00:00:00.000Z`);
    }

    const created = await prisma
      .$transaction(async (tx) => {
        const existingPessoa = await tx.pessoa.findUnique({ where: { tenantId_cpf: { tenantId: ctx.tenantId, cpf: cpfDigits } } }).catch(() => null);

        let pessoaId: number;
        let matriculaBase: string;

        if (!existingPessoa) {
          const funcionario = await tx.funcionario.create({
            data: {
              tenantId: ctx.tenantId,
              matricula: matriculaInput,
              nomeCompleto,
              cpf: cpfDigits,
              telefone,
              cargo: cargo ? cargo : null,
              statusFuncional: 'ATIVO',
              dataAdmissao,
              ativo: body.ativo !== false,
            },
            select: { id: true },
          });

          const pessoa = await tx.pessoa.create({
            data: {
              id: funcionario.id,
              tenantId: ctx.tenantId,
              nomeCompleto,
              cpf: cpfDigits,
              telefoneWhatsapp: telefone,
              matriculaBase: matriculaInput,
            },
            select: { id: true, matriculaBase: true },
          });
          pessoaId = pessoa.id;
          matriculaBase = String(pessoa.matriculaBase || '').trim() || matriculaInput;
        } else {
          pessoaId = existingPessoa.id;
          matriculaBase = String(existingPessoa.matriculaBase || '').trim() || matriculaInput;

          if (!existingPessoa.matriculaBase) {
            await tx.pessoa.update({
              where: { id: existingPessoa.id },
              data: { matriculaBase },
            });
          }

          const funcionarioExists = await tx.funcionario.findFirst({ where: { id: existingPessoa.id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
          if (!funcionarioExists) {
            await tx.funcionario.create({
              data: {
                id: existingPessoa.id,
                tenantId: ctx.tenantId,
                matricula: matriculaBase,
                nomeCompleto,
                cpf: cpfDigits,
                telefone,
                cargo: cargo ? cargo : null,
                statusFuncional: 'ATIVO',
                dataAdmissao,
                ativo: body.ativo !== false,
              },
              select: { id: true },
            });
          }
        }

        await tx.pessoaVinculo.updateMany({
          where: { tenantId: ctx.tenantId, pessoaId, dataFim: null },
          data: { dataFim: new Date(), ativo: false },
        });

        const last = await tx.pessoaVinculo
          .findFirst({ where: { tenantId: ctx.tenantId, pessoaId }, orderBy: [{ sequencia: 'desc' }, { id: 'desc' }], select: { sequencia: true } })
          .catch(() => null);
        const sequencia = (last?.sequencia || 0) + 1;
        const matriculaFull = sequencia === 1 ? matriculaBase : `${matriculaBase}-${sequencia}`;

        const vinculo = await tx.pessoaVinculo.create({
          data: {
            tenantId: ctx.tenantId,
            pessoaId,
            tipoVinculo: 'FUNCIONARIO',
            sequencia,
            matricula: matriculaFull,
            funcao: cargo ? cargo : null,
            dataInicio: dataAdmissao ?? new Date(),
            dataFim: null,
            ativo: body.ativo !== false,
          },
          select: { id: true, pessoaId: true, matricula: true },
        });

        await tx.funcionario.updateMany({
          where: { id: pessoaId, tenantId: ctx.tenantId },
          data: {
            matricula: matriculaFull,
            nomeCompleto,
            telefone,
            cargo: cargo ? cargo : null,
            statusFuncional: 'ATIVO',
            dataAdmissao,
            ativo: body.ativo !== false,
          },
        });

        return vinculo;
      })
      .catch((e: any) => {
        if (String(e?.code || '') === 'P2002') return null;
        throw e;
      });

    if (!created) return fail(reply, 409, 'CPF ou matrícula já cadastrados');

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'pessoas_vinculos',
      idRegistro: String(created.id),
      acao: 'CREATE',
      dadosNovos: created as any,
    });

    return ok(reply, { id: created.pessoaId }, { message: 'Funcionário cadastrado com sucesso.' });
  });

  server.get('/rh/terceirizados', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const query = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        idObra: z.coerce.number().int().optional(),
        idContrato: z.coerce.number().int().optional(),
      })
      .parse(request.query || {});

    const term = query.q ? query.q.trim() : '';
    const cpfTerm = term ? onlyDigits(term) : '';
    const where: any = { tenantId: ctx.tenantId, tipoVinculo: 'TERCEIRIZADO', dataFim: null, empresaContraparteId: { not: null } };
    if (term) {
      where.OR = [
        { funcao: { contains: term, mode: 'insensitive' } },
        { pessoa: { nomeCompleto: { contains: term, mode: 'insensitive' } } },
        ...(cpfTerm ? [{ pessoa: { cpf: { contains: cpfTerm } } }] : []),
      ];
    }

    const vinculos = await prisma.pessoaVinculo.findMany({
      where,
      select: {
        funcao: true,
        ativo: true,
        pessoa: { select: { id: true, nomeCompleto: true, cpf: true } },
        empresaContraparte: { select: { id: true, nomeRazao: true } },
      },
      orderBy: [{ pessoa: { nomeCompleto: 'asc' } }, { id: 'desc' }],
      take: query.limit,
    });

    return ok(
      reply,
      vinculos.map((v) => ({
        id: v.pessoa.id,
        nomeCompleto: v.pessoa.nomeCompleto,
        cpf: v.pessoa.cpf,
        funcao: v.funcao ?? null,
        ativo: v.ativo,
        idEmpresaParceira: v.empresaContraparte?.id ?? 0,
        empresaParceira: v.empresaContraparte?.nomeRazao ?? '',
        tipoLocal: null,
        idObra: null,
        idUnidade: null,
        localNome: null,
        contratoId: null,
        contratoNumero: null,
      }))
    );
  });

  server.post('/rh/terceirizados', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        nomeCompleto: z.string().min(2),
        cpf: z.string().min(1),
        dataNascimento: z.string().optional().nullable(),
        funcao: z.string().optional().nullable(),
        telefoneWhatsapp: z.string().optional().nullable(),
        identidade: z.string().optional().nullable(),
        titulo: z.string().optional().nullable(),
        nomeMae: z.string().optional().nullable(),
        nomePai: z.string().optional().nullable(),
        idContraparteEmpresa: z.number().int().positive().optional().nullable(),
        ativo: z.boolean().optional().default(true),
      })
      .passthrough()
      .parse(request.body || {});

    const nomeCompleto = String(body.nomeCompleto || '').trim();
    const cpfDigits = onlyDigits(String(body.cpf || ''));
    if (!nomeCompleto) return fail(reply, 400, 'Campo Nome completo: obrigatório');
    if (cpfDigits.length !== 11) return fail(reply, 400, 'Campo CPF: deve ter 11 dígitos');
    const empresaContraparteId = typeof body.idContraparteEmpresa === 'number' ? body.idContraparteEmpresa : null;
    if (!empresaContraparteId) return fail(reply, 400, 'Campo Empresa: obrigatório');

    const telefoneDigits = body.telefoneWhatsapp ? onlyDigits(String(body.telefoneWhatsapp || '')) : '';
    const telefone = telefoneDigits && (telefoneDigits.length === 10 || telefoneDigits.length === 11) ? telefoneDigits : null;
    const funcao = body.funcao ? String(body.funcao || '').trim() : '';

    const created = await prisma
      .$transaction(async (tx) => {
        const pessoa =
          (await tx.pessoa.findUnique({ where: { tenantId_cpf: { tenantId: ctx.tenantId, cpf: cpfDigits } } }).catch(() => null)) ||
          (await tx.pessoa.create({
            data: {
              tenantId: ctx.tenantId,
              nomeCompleto,
              cpf: cpfDigits,
              telefoneWhatsapp: telefone,
              rg: body.identidade ? String(body.identidade || '').trim() : null,
              titulo: body.titulo ? String(body.titulo || '').trim() : null,
              nomeMae: body.nomeMae ? String(body.nomeMae || '').trim() : null,
              nomePai: body.nomePai ? String(body.nomePai || '').trim() : null,
            },
            select: { id: true },
          }));

        await tx.pessoaVinculo.updateMany({
          where: { tenantId: ctx.tenantId, pessoaId: pessoa.id, dataFim: null },
          data: { dataFim: new Date(), ativo: false },
        });

        const last = await tx.pessoaVinculo
          .findFirst({
            where: { tenantId: ctx.tenantId, pessoaId: pessoa.id },
            orderBy: [{ sequencia: 'desc' }, { id: 'desc' }],
            select: { sequencia: true },
          })
          .catch(() => null);
        const sequencia = (last?.sequencia || 0) + 1;

        const vinculo = await tx.pessoaVinculo.create({
          data: {
            tenantId: ctx.tenantId,
            pessoaId: pessoa.id,
            tipoVinculo: 'TERCEIRIZADO',
            sequencia,
            matricula: null,
            funcao: funcao ? funcao : null,
            empresaContraparteId,
            dataInicio: new Date(),
            dataFim: null,
            ativo: body.ativo !== false,
          },
          select: { id: true, pessoaId: true },
        });

        return vinculo;
      })
      .catch((e: any) => {
        if (String(e?.code || '') === 'P2002') return null;
        throw e;
      });

    if (!created) return fail(reply, 409, 'CPF já cadastrado');

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'pessoas_vinculos',
      idRegistro: String(created.id),
      acao: 'CREATE',
      dadosNovos: created as any,
    });

    return ok(reply, { id: created.pessoaId }, { message: 'Terceirizado cadastrado com sucesso.' });
  });

  server.get('/rh/pessoas/:id/checklist', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const q = z
      .object({
        tipoVinculo: z.string().optional().nullable(),
      })
      .parse(request.query || {});

    const tipoVinculoIn = String(q.tipoVinculo || '').trim().toUpperCase();
    const tipoVinculo = tipoVinculoIn === 'TERCEIRIZADO' ? 'TERCEIRIZADO' : 'FUNCIONARIO';

    const pessoa = await prisma.pessoa.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, nomeCompleto: true, cpf: true } }).catch(() => null);
    if (!pessoa) return fail(reply, 404, 'Pessoa não encontrada');

    const vinculo = await prisma.pessoaVinculo
      .findFirst({
        where: { tenantId: ctx.tenantId, pessoaId: pessoa.id, tipoVinculo, dataFim: null },
        select: {
          id: true,
          tipoVinculo: true,
          sequencia: true,
          matricula: true,
          funcao: true,
          dataInicio: true,
          ativo: true,
          empresaContraparte: { select: { id: true, nomeRazao: true } },
        },
      })
      .catch(() => null);
    if (!vinculo) return fail(reply, 404, 'Vínculo ativo não encontrado para este tipo');

    const now = new Date();

    const padroes = (tipo: 'FUNCIONARIO' | 'TERCEIRIZADO') => {
      if (tipo === 'TERCEIRIZADO') {
        return {
          codigo: 'RH_TERCEIRIZADO_PADRAO',
          nomeModelo: 'RH — Checklist de documentos (Terceirizado)',
          itens: [
            { ordemItem: 10, grupoItem: 'Identificação', tituloItem: 'Documento de identificação (RG/CPF)', obrigatorio: true, exigeValidade: false, validadeDias: null },
            { ordemItem: 20, grupoItem: 'Identificação', tituloItem: 'CNH (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 1825 },
            { ordemItem: 30, grupoItem: 'Identificação', tituloItem: 'Comprovante de residência (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },

            { ordemItem: 100, grupoItem: 'Empresa', tituloItem: 'Carta de alocação / declaração da contratada (vínculo, função e obra)', obrigatorio: true, exigeValidade: false, validadeDias: null },
            { ordemItem: 110, grupoItem: 'Empresa', tituloItem: 'Comprovação de vínculo com a contratada (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 120, grupoItem: 'Empresa', tituloItem: 'Ordem de Serviço / autorização de trabalho (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },

            { ordemItem: 200, grupoItem: 'Saúde', tituloItem: 'ASO vigente (Apto)', obrigatorio: true, exigeValidade: true, validadeDias: 365 },

            { ordemItem: 300, grupoItem: 'Segurança', tituloItem: 'Integração de segurança / regras de obra (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 310, grupoItem: 'Segurança', tituloItem: 'Ficha de EPI assinada (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 320, grupoItem: 'Segurança', tituloItem: 'Permissão de trabalho (PT) / APR (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },

            { ordemItem: 400, grupoItem: 'Treinamentos', tituloItem: 'NR-06 (EPI) (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 410, grupoItem: 'Treinamentos', tituloItem: 'NR-10 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 420, grupoItem: 'Treinamentos', tituloItem: 'NR-18 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 430, grupoItem: 'Treinamentos', tituloItem: 'NR-33 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 440, grupoItem: 'Treinamentos', tituloItem: 'NR-35 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 450, grupoItem: 'Treinamentos', tituloItem: 'NR-11 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 460, grupoItem: 'Treinamentos', tituloItem: 'NR-12 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 470, grupoItem: 'Treinamentos', tituloItem: 'NR-20 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          ],
        };
      }
      return {
        codigo: 'RH_FUNCIONARIO_PADRAO',
        nomeModelo: 'RH — Checklist de documentos (Funcionário)',
        itens: [
          { ordemItem: 10, grupoItem: 'Identificação', tituloItem: 'Documento de identificação (RG/CPF)', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 20, grupoItem: 'Identificação', tituloItem: 'CTPS / Registro (eSocial)', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 30, grupoItem: 'Identificação', tituloItem: 'PIS/NIS', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 40, grupoItem: 'Identificação', tituloItem: 'Comprovante de residência', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 50, grupoItem: 'Identificação', tituloItem: 'Certidão de nascimento/casamento (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 60, grupoItem: 'Identificação', tituloItem: 'Certificado de reservista (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 70, grupoItem: 'Identificação', tituloItem: 'Título de eleitor (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 80, grupoItem: 'Identificação', tituloItem: 'CNH (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 1825 },

          { ordemItem: 110, grupoItem: 'Admissão', tituloItem: 'Ficha de registro do empregado / dados cadastrais', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 120, grupoItem: 'Admissão', tituloItem: 'Dados bancários para pagamento', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 130, grupoItem: 'Admissão', tituloItem: 'Termo de ciência (políticas internas / LGPD) (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },

          { ordemItem: 200, grupoItem: 'Saúde', tituloItem: 'ASO Admissional (Apto) vigente', obrigatorio: true, exigeValidade: true, validadeDias: 365 },
          { ordemItem: 210, grupoItem: 'Saúde', tituloItem: 'ASO Periódico (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 365 },
          { ordemItem: 220, grupoItem: 'Saúde', tituloItem: 'ASO Retorno ao trabalho (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 230, grupoItem: 'Saúde', tituloItem: 'ASO Mudança de risco (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 240, grupoItem: 'Saúde', tituloItem: 'ASO Demissional (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },

          { ordemItem: 300, grupoItem: 'Segurança', tituloItem: 'Integração de segurança / regras de obra (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 310, grupoItem: 'Segurança', tituloItem: 'Ficha de EPI assinada (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },

          { ordemItem: 400, grupoItem: 'Treinamentos', tituloItem: 'NR-06 (EPI) (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 410, grupoItem: 'Treinamentos', tituloItem: 'NR-10 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 420, grupoItem: 'Treinamentos', tituloItem: 'NR-18 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 430, grupoItem: 'Treinamentos', tituloItem: 'NR-33 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 440, grupoItem: 'Treinamentos', tituloItem: 'NR-35 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 450, grupoItem: 'Treinamentos', tituloItem: 'NR-11 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 460, grupoItem: 'Treinamentos', tituloItem: 'NR-12 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 470, grupoItem: 'Treinamentos', tituloItem: 'NR-20 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
        ],
      };
    };

    const data = await prisma.$transaction(async (tx) => {
      const prismaAny = tx as any;
      const preset = padroes(tipoVinculo as any);

      const modelo =
        (await prismaAny.rhChecklistModelo
          .findFirst({
            where: { tenantId: ctx.tenantId, codigo: preset.codigo },
            select: { id: true, codigo: true, nomeModelo: true, tipoVinculo: true },
          })
          .catch(() => null)) ||
        (await prismaAny.rhChecklistModelo.create({
          data: { tenantId: ctx.tenantId, codigo: preset.codigo, nomeModelo: preset.nomeModelo, tipoVinculo, ativo: true },
          select: { id: true, codigo: true, nomeModelo: true, tipoVinculo: true },
        }));

      if (String(modelo.nomeModelo || '') !== preset.nomeModelo || String(modelo.tipoVinculo || '') !== tipoVinculo) {
        await prismaAny.rhChecklistModelo.updateMany({
          where: { tenantId: ctx.tenantId, id: modelo.id },
          data: { nomeModelo: preset.nomeModelo, tipoVinculo },
        });
      }

      const existentes = await prismaAny.rhChecklistItemModelo.findMany({
        where: { tenantId: ctx.tenantId, modeloId: modelo.id },
        select: { ordemItem: true },
        take: 2000,
      });
      const ordens = new Set<number>((existentes as any[]).map((e) => Number(e.ordemItem)));
      const faltantes = preset.itens.filter((i: any) => !ordens.has(Number(i.ordemItem)));

      if (faltantes.length > 0) {
        await prismaAny.rhChecklistItemModelo.createMany({
          data: faltantes.map((i: any) => ({
            tenantId: ctx.tenantId,
            modeloId: modelo.id,
            ordemItem: Number(i.ordemItem),
            grupoItem: i.grupoItem ?? null,
            codigoItem: null,
            tituloItem: i.tituloItem,
            descricaoItem: null,
            obrigatorio: !!i.obrigatorio,
            exigeValidade: !!i.exigeValidade,
            validadeDias: i.validadeDias == null ? null : Number(i.validadeDias),
          })),
          skipDuplicates: true,
        });
      }

      const execucao =
        (await prismaAny.rhChecklistExecucao
          .findUnique({
            where: { tenantId_modeloId_vinculoId: { tenantId: ctx.tenantId, modeloId: modelo.id, vinculoId: vinculo.id } },
            select: { id: true, status: true, iniciadoEm: true, finalizadoEm: true },
          })
          .catch(() => null)) ||
        (await prismaAny.rhChecklistExecucao.create({
          data: { tenantId: ctx.tenantId, modeloId: modelo.id, vinculoId: vinculo.id, status: 'ATIVA' },
          select: { id: true, status: true, iniciadoEm: true, finalizadoEm: true },
        }));

      const itensModelo = await prismaAny.rhChecklistItemModelo.findMany({
        where: { tenantId: ctx.tenantId, modeloId: modelo.id },
        select: {
          id: true,
          ordemItem: true,
          grupoItem: true,
          codigoItem: true,
          tituloItem: true,
          descricaoItem: true,
          obrigatorio: true,
          exigeValidade: true,
          validadeDias: true,
        },
        orderBy: [{ ordemItem: 'asc' }, { id: 'asc' }],
      });

      if (Array.isArray(itensModelo) && itensModelo.length > 0) {
        await prismaAny.rhChecklistExecucaoItem.createMany({
          data: itensModelo.map((i: any) => ({
            tenantId: ctx.tenantId,
            execucaoId: execucao.id,
            itemModeloId: i.id,
            status: 'PENDENTE',
          })),
          skipDuplicates: true,
        });
      }

      const execItens = await prismaAny.rhChecklistExecucaoItem.findMany({
        where: { tenantId: ctx.tenantId, execucaoId: execucao.id },
        select: { itemModeloId: true, status: true, entregueEm: true, validadeAte: true, observacao: true },
      });

      const byItemId = new Map<number, any>();
      for (const e of execItens as any[]) byItemId.set(Number(e.itemModeloId), e);

      const itens = (itensModelo as any[]).map((i) => {
        const e = byItemId.get(Number(i.id)) || null;
        const entregueEm = e?.entregueEm ? new Date(e.entregueEm) : null;
        const validadeAte = e?.validadeAte ? new Date(e.validadeAte) : null;
        const exigeValidade = !!i.exigeValidade;
        const obrigatorio = !!i.obrigatorio;

        let status = entregueEm ? 'OK' : 'PENDENTE';
        if (entregueEm && exigeValidade) {
          if (validadeAte && Number.isFinite(validadeAte.getTime())) {
            const diffMs = validadeAte.getTime() - now.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays < 0) status = 'VENCIDO';
            else if (diffDays <= 30) status = 'A_VENCER';
            else status = 'OK';
          } else {
            status = 'PENDENTE_VALIDADE';
          }
        }

        return {
          idItem: Number(i.id),
          ordemItem: Number(i.ordemItem),
          grupoItem: i.grupoItem ? String(i.grupoItem) : null,
          tituloItem: String(i.tituloItem),
          descricaoItem: i.descricaoItem ? String(i.descricaoItem) : null,
          obrigatorio,
          exigeValidade,
          validadeDias: i.validadeDias == null ? null : Number(i.validadeDias),
          status,
          entregueEm: entregueEm ? entregueEm.toISOString() : null,
          validadeAte: validadeAte ? validadeAte.toISOString() : null,
          observacao: e?.observacao != null ? String(e.observacao) : null,
        };
      });

      const resumo = {
        total: itens.length,
        ok: itens.filter((x) => x.status === 'OK').length,
        pendente: itens.filter((x) => x.status === 'PENDENTE' || x.status === 'PENDENTE_VALIDADE').length,
        vencido: itens.filter((x) => x.status === 'VENCIDO').length,
        aVencer: itens.filter((x) => x.status === 'A_VENCER').length,
        obrigatoriosPendentes: itens.filter((x) => x.obrigatorio && (x.status === 'PENDENTE' || x.status === 'PENDENTE_VALIDADE' || x.status === 'VENCIDO')).length,
      };

      return { modelo, execucao, itens, resumo };
    });

    return ok(reply, {
      pessoa: { id: pessoa.id, nomeCompleto: pessoa.nomeCompleto, cpf: pessoa.cpf },
      vinculo: {
        id: vinculo.id,
        tipoVinculo: vinculo.tipoVinculo,
        matricula: vinculo.matricula ?? null,
        funcao: vinculo.funcao ?? null,
        empresa: vinculo.empresaContraparte ? { id: vinculo.empresaContraparte.id, nome: vinculo.empresaContraparte.nomeRazao } : null,
      },
      modelo: data.modelo,
      execucao: data.execucao,
      itens: data.itens,
      resumo: data.resumo,
    });
  });

  server.get('/rh/pessoas/checklist-alertas', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const q = z
      .object({
        tipoVinculo: z.string().optional().nullable(),
        ids: z.string().optional().nullable(),
      })
      .parse(request.query || {});

    const tipoVinculoIn = String(q.tipoVinculo || '').trim().toUpperCase();
    const tipoVinculo = tipoVinculoIn === 'TERCEIRIZADO' ? 'TERCEIRIZADO' : 'FUNCIONARIO';

    const ids = Array.from(
      new Set(
        String(q.ids || '')
          .split(',')
          .map((s) => Number(String(s || '').trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    ).slice(0, 200);

    if (!ids.length) return ok(reply, []);

    const now = new Date();

    const padroes = (tipo: 'FUNCIONARIO' | 'TERCEIRIZADO') => {
      if (tipo === 'TERCEIRIZADO') {
        return {
          codigo: 'RH_TERCEIRIZADO_PADRAO',
          nomeModelo: 'RH — Checklist de documentos (Terceirizado)',
          itens: [
            { ordemItem: 10, grupoItem: 'Identificação', tituloItem: 'Documento de identificação (RG/CPF)', obrigatorio: true, exigeValidade: false, validadeDias: null },
            { ordemItem: 20, grupoItem: 'Identificação', tituloItem: 'CNH (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 1825 },
            { ordemItem: 30, grupoItem: 'Identificação', tituloItem: 'Comprovante de residência (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 100, grupoItem: 'Empresa', tituloItem: 'Carta de alocação / declaração da contratada (vínculo, função e obra)', obrigatorio: true, exigeValidade: false, validadeDias: null },
            { ordemItem: 110, grupoItem: 'Empresa', tituloItem: 'Comprovação de vínculo com a contratada (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 120, grupoItem: 'Empresa', tituloItem: 'Ordem de Serviço / autorização de trabalho (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 200, grupoItem: 'Saúde', tituloItem: 'ASO vigente (Apto)', obrigatorio: true, exigeValidade: true, validadeDias: 365 },
            { ordemItem: 300, grupoItem: 'Segurança', tituloItem: 'Integração de segurança / regras de obra (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 310, grupoItem: 'Segurança', tituloItem: 'Ficha de EPI assinada (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 320, grupoItem: 'Segurança', tituloItem: 'Permissão de trabalho (PT) / APR (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 400, grupoItem: 'Treinamentos', tituloItem: 'NR-06 (EPI) (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
            { ordemItem: 410, grupoItem: 'Treinamentos', tituloItem: 'NR-10 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 420, grupoItem: 'Treinamentos', tituloItem: 'NR-18 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 430, grupoItem: 'Treinamentos', tituloItem: 'NR-33 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 440, grupoItem: 'Treinamentos', tituloItem: 'NR-35 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 450, grupoItem: 'Treinamentos', tituloItem: 'NR-11 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 460, grupoItem: 'Treinamentos', tituloItem: 'NR-12 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
            { ordemItem: 470, grupoItem: 'Treinamentos', tituloItem: 'NR-20 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          ],
        };
      }
      return {
        codigo: 'RH_FUNCIONARIO_PADRAO',
        nomeModelo: 'RH — Checklist de documentos (Funcionário)',
        itens: [
          { ordemItem: 10, grupoItem: 'Identificação', tituloItem: 'Documento de identificação (RG/CPF)', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 20, grupoItem: 'Identificação', tituloItem: 'CTPS / Registro (eSocial)', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 30, grupoItem: 'Identificação', tituloItem: 'PIS/NIS', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 40, grupoItem: 'Identificação', tituloItem: 'Comprovante de residência', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 50, grupoItem: 'Identificação', tituloItem: 'Certidão de nascimento/casamento (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 60, grupoItem: 'Identificação', tituloItem: 'Certificado de reservista (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 70, grupoItem: 'Identificação', tituloItem: 'Título de eleitor (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 80, grupoItem: 'Identificação', tituloItem: 'CNH (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 1825 },
          { ordemItem: 110, grupoItem: 'Admissão', tituloItem: 'Ficha de registro do empregado / dados cadastrais', obrigatorio: true, exigeValidade: false, validadeDias: null },
          { ordemItem: 120, grupoItem: 'Admissão', tituloItem: 'Dados bancários para pagamento', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 130, grupoItem: 'Admissão', tituloItem: 'Termo de ciência (políticas internas / LGPD) (quando exigido)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 200, grupoItem: 'Saúde', tituloItem: 'ASO Admissional (Apto) vigente', obrigatorio: true, exigeValidade: true, validadeDias: 365 },
          { ordemItem: 210, grupoItem: 'Saúde', tituloItem: 'ASO Periódico (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 365 },
          { ordemItem: 220, grupoItem: 'Saúde', tituloItem: 'ASO Retorno ao trabalho (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 230, grupoItem: 'Saúde', tituloItem: 'ASO Mudança de risco (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 240, grupoItem: 'Saúde', tituloItem: 'ASO Demissional (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 300, grupoItem: 'Segurança', tituloItem: 'Integração de segurança / regras de obra (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 310, grupoItem: 'Segurança', tituloItem: 'Ficha de EPI assinada (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 400, grupoItem: 'Treinamentos', tituloItem: 'NR-06 (EPI) (quando aplicável)', obrigatorio: false, exigeValidade: false, validadeDias: null },
          { ordemItem: 410, grupoItem: 'Treinamentos', tituloItem: 'NR-10 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 420, grupoItem: 'Treinamentos', tituloItem: 'NR-18 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 430, grupoItem: 'Treinamentos', tituloItem: 'NR-33 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 440, grupoItem: 'Treinamentos', tituloItem: 'NR-35 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 450, grupoItem: 'Treinamentos', tituloItem: 'NR-11 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 460, grupoItem: 'Treinamentos', tituloItem: 'NR-12 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
          { ordemItem: 470, grupoItem: 'Treinamentos', tituloItem: 'NR-20 (quando aplicável)', obrigatorio: false, exigeValidade: true, validadeDias: 730 },
        ],
      };
    };

    const preset = padroes(tipoVinculo as any);

    const modeloData = await prisma.$transaction(async (tx) => {
      const prismaAny = tx as any;

      const modelo =
        (await prismaAny.rhChecklistModelo
          .findFirst({
            where: { tenantId: ctx.tenantId, codigo: preset.codigo },
            select: { id: true, codigo: true, nomeModelo: true, tipoVinculo: true },
          })
          .catch(() => null)) ||
        (await prismaAny.rhChecklistModelo.create({
          data: { tenantId: ctx.tenantId, codigo: preset.codigo, nomeModelo: preset.nomeModelo, tipoVinculo, ativo: true },
          select: { id: true, codigo: true, nomeModelo: true, tipoVinculo: true },
        }));

      if (String(modelo.nomeModelo || '') !== preset.nomeModelo || String(modelo.tipoVinculo || '') !== tipoVinculo) {
        await prismaAny.rhChecklistModelo.updateMany({
          where: { tenantId: ctx.tenantId, id: modelo.id },
          data: { nomeModelo: preset.nomeModelo, tipoVinculo },
        });
      }

      const existentes = await prismaAny.rhChecklistItemModelo.findMany({
        where: { tenantId: ctx.tenantId, modeloId: modelo.id },
        select: { ordemItem: true },
        take: 2000,
      });
      const ordens = new Set<number>((existentes as any[]).map((e) => Number(e.ordemItem)));
      const faltantes = preset.itens.filter((i: any) => !ordens.has(Number(i.ordemItem)));

      if (faltantes.length > 0) {
        await prismaAny.rhChecklistItemModelo.createMany({
          data: faltantes.map((i: any) => ({
            tenantId: ctx.tenantId,
            modeloId: modelo.id,
            ordemItem: Number(i.ordemItem),
            grupoItem: i.grupoItem ?? null,
            codigoItem: null,
            tituloItem: i.tituloItem,
            descricaoItem: null,
            obrigatorio: !!i.obrigatorio,
            exigeValidade: !!i.exigeValidade,
            validadeDias: i.validadeDias == null ? null : Number(i.validadeDias),
          })),
          skipDuplicates: true,
        });
      }

      const itensModelo = await prismaAny.rhChecklistItemModelo.findMany({
        where: { tenantId: ctx.tenantId, modeloId: modelo.id },
        select: { id: true, ordemItem: true, tituloItem: true, obrigatorio: true, exigeValidade: true },
        orderBy: [{ ordemItem: 'asc' }, { id: 'asc' }],
      });

      return { modelo, itensModelo };
    });

    const vinculos = await prisma.pessoaVinculo.findMany({
      where: { tenantId: ctx.tenantId, pessoaId: { in: ids }, tipoVinculo, dataFim: null },
      select: { id: true, pessoaId: true },
    });

    const vinculoByPessoaId = new Map<number, number>();
    for (const v of vinculos as any[]) vinculoByPessoaId.set(Number(v.pessoaId), Number(v.id));

    const vinculoIds = Array.from(new Set(vinculos.map((v: any) => Number(v.id)).filter((n: any) => Number.isFinite(n) && n > 0)));

    const execucoes = await (prisma as any).rhChecklistExecucao.findMany({
      where: { tenantId: ctx.tenantId, modeloId: modeloData.modelo.id, vinculoId: { in: vinculoIds.length ? vinculoIds : [0] } },
      select: { id: true, vinculoId: true },
      take: 2000,
    });

    const execucaoByVinculoId = new Map<number, number>();
    for (const e of execucoes as any[]) execucaoByVinculoId.set(Number(e.vinculoId), Number(e.id));

    const execucaoIds = Array.from(new Set(execucoes.map((e: any) => Number(e.id)).filter((n: any) => Number.isFinite(n) && n > 0)));

    const execItens = await (prisma as any).rhChecklistExecucaoItem.findMany({
      where: { tenantId: ctx.tenantId, execucaoId: { in: execucaoIds.length ? execucaoIds : [0] } },
      select: { execucaoId: true, itemModeloId: true, status: true, entregueEm: true, validadeAte: true },
      take: 10000,
    });

    const itensByExecucaoId = new Map<number, Map<number, any>>();
    for (const r of execItens as any[]) {
      const exId = Number(r.execucaoId);
      if (!itensByExecucaoId.has(exId)) itensByExecucaoId.set(exId, new Map());
      itensByExecucaoId.get(exId)!.set(Number(r.itemModeloId), r);
    }

    const itensModelo = (modeloData.itensModelo as any[]).map((i) => ({
      id: Number(i.id),
      ordemItem: Number(i.ordemItem),
      tituloItem: String(i.tituloItem || ''),
      obrigatorio: !!i.obrigatorio,
      exigeValidade: !!i.exigeValidade,
    }));

    const results = ids.map((pessoaId) => {
      const vinculoId = vinculoByPessoaId.get(Number(pessoaId)) || null;
      const execucaoId = vinculoId ? execucaoByVinculoId.get(Number(vinculoId)) || null : null;
      const mapa = execucaoId ? itensByExecucaoId.get(Number(execucaoId)) || null : null;

      let okCount = 0;
      let pendenteCount = 0;
      let vencidoCount = 0;
      let aVencerCount = 0;
      let obrigatoriosPendentesCount = 0;
      const pendencias: Array<{ status: string; titulo: string }> = [];

      for (const i of itensModelo) {
        const e = mapa ? mapa.get(i.id) : null;
        const entregueEm = e?.entregueEm ? new Date(e.entregueEm) : null;
        const validadeAte = e?.validadeAte ? new Date(e.validadeAte) : null;

        let status = entregueEm ? 'OK' : 'PENDENTE';
        if (entregueEm && i.exigeValidade) {
          if (validadeAte && Number.isFinite(validadeAte.getTime())) {
            const diffMs = validadeAte.getTime() - now.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays < 0) status = 'VENCIDO';
            else if (diffDays <= 30) status = 'A_VENCER';
            else status = 'OK';
          } else {
            status = 'PENDENTE_VALIDADE';
          }
        }

        if (status === 'OK') okCount += 1;
        else if (status === 'VENCIDO') vencidoCount += 1;
        else if (status === 'A_VENCER') aVencerCount += 1;
        else pendenteCount += 1;

        if (i.obrigatorio && (status === 'PENDENTE' || status === 'PENDENTE_VALIDADE' || status === 'VENCIDO')) obrigatoriosPendentesCount += 1;
        if (status !== 'OK') pendencias.push({ status, titulo: i.tituloItem });
      }

      let nivel = 'OK';
      if (!vinculoId) nivel = 'SEM_VINCULO';
      else if (vencidoCount > 0) nivel = 'VENCIDO';
      else if (obrigatoriosPendentesCount > 0) nivel = 'PENDENTE_OBRIG';
      else if (aVencerCount > 0) nivel = 'A_VENCER';
      else if (pendenteCount > 0) nivel = 'PENDENTE';

      const linhas = [
        vinculoId ? `Vencidos: ${vencidoCount} • A vencer: ${aVencerCount} • Pendentes: ${pendenteCount} • Obrigatórios pendentes: ${obrigatoriosPendentesCount}` : 'Vínculo ativo não encontrado para este tipo.',
        ...pendencias.slice(0, 6).map((p) => `- ${p.status}: ${p.titulo}`),
      ].filter(Boolean);

      return {
        pessoaId: Number(pessoaId),
        tipoVinculo,
        nivel,
        tooltip: linhas.join('\n'),
        resumo: { total: itensModelo.length, ok: okCount, pendente: pendenteCount, vencido: vencidoCount, aVencer: aVencerCount, obrigatoriosPendentes: obrigatoriosPendentesCount },
      };
    });

    return ok(reply, results);
  });

  server.patch('/rh/pessoas/:id/checklist/itens/:itemId', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const { id, itemId } = z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        tipoVinculo: z.string().optional().nullable(),
        status: z.enum(['ENTREGUE', 'PENDENTE']),
        validadeAte: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const tipoVinculoIn = String(body.tipoVinculo || '').trim().toUpperCase();
    const tipoVinculo = tipoVinculoIn === 'TERCEIRIZADO' ? 'TERCEIRIZADO' : 'FUNCIONARIO';

    const pessoa = await prisma.pessoa.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!pessoa) return fail(reply, 404, 'Pessoa não encontrada');

    const vinculo = await prisma.pessoaVinculo.findFirst({ where: { tenantId: ctx.tenantId, pessoaId: pessoa.id, tipoVinculo, dataFim: null }, select: { id: true } }).catch(() => null);
    if (!vinculo) return fail(reply, 404, 'Vínculo ativo não encontrado para este tipo');

    const updated = await prisma.$transaction(async (tx) => {
      const prismaAny = tx as any;

      const itemModelo = await prismaAny.rhChecklistItemModelo
        .findFirst({
          where: { tenantId: ctx.tenantId, id: itemId },
          select: { id: true, modeloId: true, exigeValidade: true },
        })
        .catch(() => null);
      if (!itemModelo) return null;

      const execucao =
        (await prismaAny.rhChecklistExecucao
          .findUnique({
            where: { tenantId_modeloId_vinculoId: { tenantId: ctx.tenantId, modeloId: itemModelo.modeloId, vinculoId: vinculo.id } },
            select: { id: true },
          })
          .catch(() => null)) ||
        (await prismaAny.rhChecklistExecucao.create({
          data: { tenantId: ctx.tenantId, modeloId: itemModelo.modeloId, vinculoId: vinculo.id, status: 'ATIVA' },
          select: { id: true },
        }));

      const validadeAte = body.validadeAte ? parseDateOnly(String(body.validadeAte).slice(0, 10)) : null;

      const dataUpdate =
        body.status === 'ENTREGUE'
          ? {
              status: 'ENTREGUE',
              entregueEm: new Date(),
              validadeAte: itemModelo.exigeValidade ? validadeAte : null,
              observacao: body.observacao != null ? String(body.observacao) : null,
            }
          : {
              status: 'PENDENTE',
              entregueEm: null,
              validadeAte: null,
              observacao: body.observacao != null ? String(body.observacao) : null,
            };

      const row = await prismaAny.rhChecklistExecucaoItem.upsert({
        where: { tenantId_execucaoId_itemModeloId: { tenantId: ctx.tenantId, execucaoId: execucao.id, itemModeloId: itemModelo.id } },
        create: {
          tenantId: ctx.tenantId,
          execucaoId: execucao.id,
          itemModeloId: itemModelo.id,
          ...dataUpdate,
        },
        update: dataUpdate,
        select: { id: true, status: true, entregueEm: true, validadeAte: true, observacao: true },
      });

      return row;
    });

    if (!updated) return fail(reply, 404, 'Item de checklist não encontrado');

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'rh_checklist_execucao_itens',
      idRegistro: String((updated as any).id),
      acao: 'UPDATE',
      dadosNovos: updated as any,
    });

    return ok(reply, { ok: true }, { message: 'Checklist atualizado' });
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

  function normalizeConselho(value: any) {
    const s = String(value ?? '').trim().toUpperCase();
    return s || null;
  }

  function normalizeRegistro(value: any) {
    const s = String(value ?? '').trim();
    return s || null;
  }

  server.get('/engenharia/tecnicos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        q: z.string().optional().nullable(),
        apenasAtivos: z.string().optional().nullable(),
      })
      .parse(request.query || {});

    const term = String(q.q || '').trim();
    const where: any = { tenantId: ctx.tenantId };
    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { professionalTitle: { contains: term, mode: 'insensitive' } },
        { conselho: { contains: term, mode: 'insensitive' } },
        { numeroRegistro: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.responsavelTecnico.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 1000,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idTecnico: r.id,
        nome: r.name,
        tituloProfissional: r.professionalTitle ?? null,
        conselho: r.conselho ?? null,
        numeroRegistro: r.numeroRegistro ?? r.crea ?? null,
        cpf: null,
        email: r.email ?? null,
        telefone: r.phone ?? null,
        ativo: true,
      }))
    );
  });

  server.post('/engenharia/tecnicos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        nome: z.string().min(2),
        tituloProfissional: z.string().optional().nullable(),
        conselho: z.string().min(2),
        numeroRegistro: z.string().min(1),
        cpf: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        ativo: z.boolean().optional(),
      })
      .parse(request.body || {});

    const conselho = normalizeConselho(body.conselho);
    const numeroRegistro = normalizeRegistro(body.numeroRegistro);
    if (!conselho) return fail(reply, 400, 'Conselho é obrigatório');
    if (!numeroRegistro) return fail(reply, 400, 'Registro é obrigatório');

    const existing = await prisma.responsavelTecnico
      .findFirst({
        where: {
          tenantId: ctx.tenantId,
          conselho,
          numeroRegistro,
        },
        select: { id: true },
      })
      .catch(() => null);
    if (existing) return fail(reply, 409, 'Já existe um profissional com o mesmo conselho e registro');

    const email = body.email ? normalizeEmail(String(body.email)) : null;
    const phone = body.telefone ? String(body.telefone).trim() : null;
    const professionalTitle = body.tituloProfissional ? String(body.tituloProfissional).trim() : null;

    const created = await prisma.responsavelTecnico.create({
      data: {
        tenantId: ctx.tenantId,
        name: String(body.nome).trim(),
        professionalTitle: professionalTitle || null,
        conselho,
        numeroRegistro,
        crea: numeroRegistro,
        cpf: null,
        email: email || null,
        phone: phone || null,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_tecnicos', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
    return ok(reply, { idTecnico: created.id }, { message: 'Profissional cadastrado' });
  });

  server.get('/engenharia/tecnicos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const r = await prisma.responsavelTecnico.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!r) return fail(reply, 404, 'Profissional não encontrado');

    return ok(reply, {
      idTecnico: r.id,
      nome: r.name,
      tituloProfissional: r.professionalTitle ?? null,
      conselho: r.conselho ?? null,
      numeroRegistro: r.numeroRegistro ?? r.crea ?? null,
      cpf: null,
      email: r.email ?? null,
      telefone: r.phone ?? null,
      ativo: true,
    });
  });

  server.put('/engenharia/tecnicos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const body = z
      .object({
        nome: z.string().min(2),
        tituloProfissional: z.string().optional().nullable(),
        conselho: z.string().min(2),
        numeroRegistro: z.string().min(1),
        cpf: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        ativo: z.boolean().optional(),
      })
      .parse(request.body || {});

    const current = await prisma.responsavelTecnico.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Profissional não encontrado');

    const conselho = normalizeConselho(body.conselho);
    const numeroRegistro = normalizeRegistro(body.numeroRegistro);
    if (!conselho) return fail(reply, 400, 'Conselho é obrigatório');
    if (!numeroRegistro) return fail(reply, 400, 'Registro é obrigatório');

    const dupe = await prisma.responsavelTecnico
      .findFirst({
        where: {
          tenantId: ctx.tenantId,
          conselho,
          numeroRegistro,
          NOT: { id },
        },
        select: { id: true },
      })
      .catch(() => null);
    if (dupe) return fail(reply, 409, 'Já existe um profissional com o mesmo conselho e registro');

    const email = body.email ? normalizeEmail(String(body.email)) : null;
    const phone = body.telefone ? String(body.telefone).trim() : null;
    const professionalTitle = body.tituloProfissional ? String(body.tituloProfissional).trim() : null;

    const updated = await prisma.responsavelTecnico.update({
      where: { id },
      data: {
        name: String(body.nome).trim(),
        professionalTitle: professionalTitle || null,
        conselho,
        numeroRegistro,
        crea: numeroRegistro,
        cpf: null,
        email: email || null,
        phone: phone || null,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_tecnicos', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
    return ok(reply, {}, { message: 'Profissional atualizado' });
  });

  server.delete('/engenharia/tecnicos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const current = await prisma.responsavelTecnico.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Profissional não encontrado');

    const linkedObra = await prisma.responsavelObra.findFirst({ where: { responsavelId: id }, select: { id: true } }).catch(() => null);
    if (linkedObra) return fail(reply, 409, 'Não é possível excluir: profissional está vinculado a uma obra');

    const linkedProj = await prisma.engenhariaProjetoResponsavel.findFirst({ where: { responsavelId: id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (linkedProj) return fail(reply, 409, 'Não é possível excluir: profissional está vinculado a um projeto');

    await prisma.responsavelTecnico.delete({ where: { id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_tecnicos', idRegistro: String(id), acao: 'DELETE', dadosAnteriores: current as any });
    return ok(reply, {}, { message: 'Profissional removido' });
  });

  server.get('/engenharia/obras/responsabilidades', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ idObra: z.coerce.number().int().positive(), tipo: z.string().optional().nullable(), apenasAtivos: z.string().optional().nullable() }).parse(request.query || {});

    const obra = await prisma.obra.findUnique({ where: { id: q.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const tipo = String(q.tipo || '').trim().toUpperCase();
    const apenasAtivos = String(q.apenasAtivos || '').trim() === '1' || String(q.apenasAtivos || '').trim().toLowerCase() === 'true';

    const rows = await prisma.responsavelObra.findMany({
      where: {
        obraId: obra.id,
        ...(tipo === 'RESPONSAVEL_TECNICO' || tipo === 'FISCAL_OBRA' ? { role: tipo } : {}),
        ...(apenasAtivos ? { endDate: null } : {}),
      },
      include: { responsavel: true },
      orderBy: { id: 'desc' },
    });

    return ok(
      reply,
      rows.map((r) => ({
        ...(parseResponsavelObraNotes((r as any).notes || null) as any),
        idObraResponsabilidade: r.id,
        idObra: r.obraId,
        tipo: String(r.role || '').toUpperCase() === 'FISCAL_OBRA' ? 'FISCAL_OBRA' : 'RESPONSAVEL_TECNICO',
        nome: r.responsavel?.name || '',
        conselho: r.responsavel?.conselho ?? null,
        numeroRegistro: r.responsavel?.numeroRegistro ?? r.responsavel?.crea ?? null,
        email: r.responsavel?.email ?? null,
        telefone: r.responsavel?.phone ?? null,
        ativo: r.endDate == null,
        dataInicio: r.startDate ? r.startDate.toISOString() : null,
        dataBaixa: r.endDate ? r.endDate.toISOString() : null,
      }))
    );
  });

  server.post('/engenharia/obras/responsabilidades', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        idObra: z.number().int().positive(),
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        idTecnico: z.number().int().positive(),
        ativo: z.boolean().default(true),
        responsabilidade: z.string().optional().nullable(),
        docInclusaoTipo: z.enum(['ART', 'RRT', 'PORTARIA', 'CONTRATO']),
        docInclusaoNumero: z.string().min(1),
        docInclusaoDescricao: z.string().min(1),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        docBaixaTipo: z.enum(['ART', 'RRT', 'PORTARIA', 'CONTRATO']).optional().nullable(),
        docBaixaNumero: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const tecnico = await prisma.responsavelTecnico.findFirst({ where: { id: body.idTecnico, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!tecnico) return fail(reply, 404, 'Profissional não encontrado');

    const startDate = body.startDate ? new Date(String(body.startDate)) : new Date();
    if (body.startDate && Number.isNaN(startDate.getTime())) return fail(reply, 400, 'Data de início inválida');
    const endDate = body.ativo ? null : body.endDate ? new Date(String(body.endDate)) : new Date();
    if (!body.ativo && body.endDate && Number.isNaN(endDate?.getTime() || NaN)) return fail(reply, 400, 'Data de baixa inválida');

    const responsabilidadeNorm = body.responsabilidade ? String(body.responsabilidade).trim().toLowerCase() : '';
    const existingActive = await prisma.responsavelObra
      .findFirst({
        where: { obraId: obra.id, responsavelId: tecnico.id, role: body.tipo, endDate: null },
        select: { id: true, notes: true },
      })
      .catch(() => null);
    if (existingActive) {
      const parsed = parseResponsavelObraNotes((existingActive as any).notes || null);
      const existingResp = parsed.responsabilidade ? String(parsed.responsabilidade).trim().toLowerCase() : '';
      if (!responsabilidadeNorm || existingResp === responsabilidadeNorm) return fail(reply, 409, 'Já existe um vínculo ativo com a mesma responsabilidade');
    }

    if (!body.ativo) {
      const bxTipo = body.docBaixaTipo ? String(body.docBaixaTipo).trim().toUpperCase() : '';
      const bxNumero = body.docBaixaNumero ? String(body.docBaixaNumero).trim() : '';
      if (!bxTipo || !bxNumero) return fail(reply, 400, 'Documento de baixa é obrigatório para cadastrar como inativo');
    }

    const created = await prisma.responsavelObra.create({
      data: {
        obraId: obra.id,
        responsavelId: tecnico.id,
        role: body.tipo,
        startDate,
        endDate,
        notes: buildResponsavelObraNotes({
          responsabilidade: body.responsabilidade ? String(body.responsabilidade).trim() : null,
          docInclusaoTipo: body.docInclusaoTipo,
          docInclusaoNumero: String(body.docInclusaoNumero).trim(),
          docInclusaoDescricao: String(body.docInclusaoDescricao).trim(),
          docBaixaTipo: body.ativo ? null : (body.docBaixaTipo as any),
          docBaixaNumero: body.ativo ? null : (body.docBaixaNumero ? String(body.docBaixaNumero).trim() : null),
        }),
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsabilidades', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
    const tecnicoFull = await prisma.responsavelTecnico.findFirst({ where: { id: tecnico.id, tenantId: ctx.tenantId }, select: { name: true } }).catch(() => null);
    const tipoLabel = body.tipo === 'FISCAL_OBRA' ? 'FISCAL DA OBRA' : 'RESPONSÁVEL TÉCNICO';
    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${obra.id}`,
      message: `Obra #${obra.id}: vínculo criado (${tipoLabel}) — ${tecnicoFull?.name ? String(tecnicoFull.name) : `Técnico #${tecnico.id}`}. Documento: ${String(body.docInclusaoTipo)} ${String(body.docInclusaoNumero).trim()} — ${String(body.docInclusaoDescricao).trim()}.`,
    });
    return ok(reply, { idObraResponsabilidade: created.id }, { message: 'Vínculo cadastrado' });
  });

  server.put('/engenharia/obras/responsabilidades/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        ativo: z.boolean().default(true),
        responsabilidade: z.string().optional().nullable(),
        docInclusaoTipo: z.enum(['ART', 'RRT', 'PORTARIA', 'CONTRATO']).optional().nullable(),
        docInclusaoNumero: z.string().optional().nullable(),
        docInclusaoDescricao: z.string().optional().nullable(),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        docBaixaTipo: z.enum(['ART', 'RRT', 'PORTARIA', 'CONTRATO']).optional().nullable(),
        docBaixaNumero: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const current = await prisma.responsavelObra.findUnique({ where: { id }, include: { obra: { select: { tenantId: true } } } }).catch(() => null);
    if (!current || current.obra?.tenantId !== ctx.tenantId) return fail(reply, 404, 'Registro não encontrado');

    const prevNotes = parseResponsavelObraNotes((current as any).notes || null);
    const startDate = body.startDate ? new Date(String(body.startDate)) : current.startDate;
    if (body.startDate && Number.isNaN(startDate.getTime())) return fail(reply, 400, 'Data de início inválida');
    const endDate = body.ativo
      ? null
      : body.endDate
        ? new Date(String(body.endDate))
        : new Date();
    if (!body.ativo && body.endDate && Number.isNaN(endDate?.getTime() || NaN)) return fail(reply, 400, 'Data de baixa inválida');

    const responsabilidade = body.responsabilidade != null ? String(body.responsabilidade).trim() : prevNotes.responsabilidade;
    const docInclusaoTipo = body.docInclusaoTipo != null ? (String(body.docInclusaoTipo).trim().toUpperCase() as any) : prevNotes.docInclusaoTipo;
    const docInclusaoNumero = body.docInclusaoNumero != null ? String(body.docInclusaoNumero).trim() : prevNotes.docInclusaoNumero;
    const docInclusaoDescricao = body.docInclusaoDescricao != null ? String(body.docInclusaoDescricao).trim() : prevNotes.docInclusaoDescricao;
    if (!docInclusaoTipo || !docInclusaoNumero || !docInclusaoDescricao) return fail(reply, 400, 'Documento de inclusão e descrição são obrigatórios');

    const docBaixaTipo = body.ativo
      ? null
      : body.docBaixaTipo != null
        ? (String(body.docBaixaTipo).trim().toUpperCase() as any)
        : prevNotes.docBaixaTipo;
    const docBaixaNumero = body.ativo ? null : body.docBaixaNumero != null ? String(body.docBaixaNumero).trim() : prevNotes.docBaixaNumero;
    if (!body.ativo && (!docBaixaTipo || !docBaixaNumero)) return fail(reply, 400, 'Documento de baixa é obrigatório');

    const updated = await prisma.responsavelObra.update({
      where: { id },
      data: {
        role: body.tipo,
        startDate,
        endDate,
        notes: buildResponsavelObraNotes({
          responsabilidade,
          docInclusaoTipo,
          docInclusaoNumero,
          docInclusaoDescricao,
          docBaixaTipo,
          docBaixaNumero,
        }),
      },
    });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsabilidades', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
    const prevAtivo = current.endDate == null;
    const newAtivo = updated.endDate == null;
    const tipoLabel = body.tipo === 'FISCAL_OBRA' ? 'FISCAL DA OBRA' : 'RESPONSÁVEL TÉCNICO';
    const msg = !prevAtivo && newAtivo
      ? `Obra #${(current as any).obraId}: vínculo reativado (${tipoLabel}) (id ${id}).`
      : prevAtivo && !newAtivo
        ? `Obra #${(current as any).obraId}: vínculo baixado (${tipoLabel}) (id ${id}). Documento baixa: ${docBaixaTipo} ${docBaixaNumero}${endDate ? ` • ${endDate.toISOString().slice(0, 10)}` : ''}.`
        : `Obra #${(current as any).obraId}: vínculo atualizado (${tipoLabel}) (id ${id}).`;
    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${(current as any).obraId}`,
      message: msg,
    });
    return ok(reply, {}, { message: 'Vínculo atualizado' });
  });

  server.delete('/engenharia/obras/responsabilidades/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const current = await prisma.responsavelObra.findUnique({ where: { id }, include: { obra: { select: { tenantId: true } } } }).catch(() => null);
    if (!current || current.obra?.tenantId !== ctx.tenantId) return fail(reply, 404, 'Registro não encontrado');
    await prisma.responsavelObra.delete({ where: { id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_responsabilidades', idRegistro: String(id), acao: 'DELETE', dadosAnteriores: current as any });
    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${(current as any).obraId}`,
      message: `Obra #${(current as any).obraId}: vínculo removido (id ${id}).`,
    });
    return ok(reply, {}, { message: 'Vínculo removido' });
  });

  server.post('/engenharia/obras/responsabilidades/importar', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const body = z
      .object({
        idObra: z.number().int().positive(),
        idProjeto: z.number().int().positive(),
      })
      .parse(request.body || {});

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id: body.idProjeto, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const pr = await prisma.engenhariaProjetoResponsavel.findMany({
      where: { tenantId: ctx.tenantId, projetoId: projeto.id },
      select: { responsavelId: true, tipo: true, abrangencia: true, numeroDocumento: true },
      take: 500,
    });

    const existing = await prisma.responsavelObra.findMany({
      where: {
        obraId: obra.id,
        responsavelId: { in: pr.map((x) => x.responsavelId) },
      },
      select: { id: true, responsavelId: true, role: true, endDate: true, notes: true },
    });

    const existingKey = new Set(
      existing.map((e) => {
        const role = String(e.role || '').toUpperCase();
        const parsed = parseResponsavelObraNotes((e as any).notes || null);
        const resp = parsed.responsabilidade ? String(parsed.responsabilidade).trim().toLowerCase() : '';
        return `${e.responsavelId}::${role}::${resp}`;
      })
    );

    let inseridos = 0;
    let reativados = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of pr) {
        const role = String(row.tipo || '').toUpperCase() === 'FISCAL_OBRA' ? 'FISCAL_OBRA' : 'RESPONSAVEL_TECNICO';
        const responsabilidade = row.abrangencia ? String(row.abrangencia).trim() : '';
        const respKey = responsabilidade ? responsabilidade.toLowerCase() : '';
        const key = `${row.responsavelId}::${role}::${respKey}`;
        if (existingKey.has(key)) {
          const current = await tx.responsavelObra
            .findFirst({
              where: { obraId: obra.id, responsavelId: row.responsavelId, role },
              select: { id: true, endDate: true, notes: true },
              orderBy: { id: 'desc' },
            })
            .catch(() => null);
          const parsed = parseResponsavelObraNotes((current as any)?.notes || null);
          const currentResp = parsed.responsabilidade ? String(parsed.responsabilidade).trim().toLowerCase() : '';
          if (current && current.endDate != null && currentResp === respKey) {
            await tx.responsavelObra.update({ where: { id: current.id }, data: { endDate: null } });
            reativados++;
          }
          continue;
        }
        const numeroDoc = row.numeroDocumento ? String(row.numeroDocumento).trim() : '';
        const docInclusaoNumero = numeroDoc || `Vínculo via projeto #${projeto.id}`;
        const docInclusaoTipo = inferDocTipoFromNumero(numeroDoc);
        await tx.responsavelObra.create({
          data: {
            obraId: obra.id,
            responsavelId: row.responsavelId,
            role,
            endDate: null,
            notes: buildResponsavelObraNotes({
              responsabilidade: responsabilidade || null,
              docInclusaoTipo,
              docInclusaoNumero,
              docBaixaTipo: null,
              docBaixaNumero: null,
            }),
          },
        });
        inseridos++;
      }
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_obras_responsabilidades_importar',
      idRegistro: `${body.idObra}:${body.idProjeto}`,
      acao: 'CREATE',
      dadosNovos: { inseridos, reativados } as any,
    });

    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${obra.id}`,
      message: `Obra #${obra.id}: importação de responsáveis do projeto #${projeto.id}. Inseridos: ${inseridos}. Reativados: ${reativados}.`,
    });

    return ok(reply, { inseridos, reativados }, { message: 'Importação concluída' });
  });

  server.get('/engenharia/obras/historico', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        idObra: z.coerce.number().int().positive(),
        texto: z.string().optional().nullable(),
        origem: z.string().optional().nullable(),
        desde: z.string().optional().nullable(),
        ate: z.string().optional().nullable(),
        limit: z.coerce.number().int().positive().optional().nullable(),
      })
      .parse(request.query || {});

    const obra = await prisma.obra.findUnique({ where: { id: q.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const texto = String(q.texto || '').trim();
    const origem = String(q.origem || '').trim();

    function parseDateBound(value: string, endOfDay: boolean) {
      const v = String(value || '').trim();
      if (!v) return null;
      const hasTime = v.includes('T') || v.includes(':');
      if (hasTime) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(`${v}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return null;
      if (endOfDay) d.setUTCHours(23, 59, 59, 999);
      return d;
    }

    const desde = q.desde != null ? parseDateBound(String(q.desde), false) : null;
    const ate = q.ate != null ? parseDateBound(String(q.ate), true) : null;

    const where: any = { tenantId: ctx.tenantId, action: `OBRA:${obra.id}` };
    if (texto) where.message = { contains: texto, mode: 'insensitive' };
    if (origem) where.source = { contains: origem, mode: 'insensitive' };
    if (desde || ate) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = desde;
      if (ate) where.createdAt.lte = ate;
    }

    const limit = Math.min(500, Math.max(1, Number(q.limit || 500)));
    const items = await prisma.tenantHistoryEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { actorUser: { select: { id: true, name: true, email: true } }, attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } } },
      take: limit,
    });

    return ok(
      reply,
      items.map((i) => ({
        idHistorico: i.id,
        idObra: obra.id,
        dataHora: i.createdAt.toISOString(),
        usuario: i.actorUser ? { id: i.actorUser.id, nome: i.actorUser.name ?? null, email: i.actorUser.email ?? null } : null,
        origem: i.source,
        mensagem: i.message,
        anexos: (i as any).attachments || [],
      }))
    );
  });

  server.post('/engenharia/obras/historico', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        idObra: z.coerce.number().int().positive(),
        mensagem: z.string().min(1),
      })
      .parse((request.body as any) || {});

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${obra.id}`,
      message: String(body.mensagem || '').trim(),
    });

    return ok(reply, { ok: true }, { message: 'Histórico registrado' });
  });

  server.get(
    '/engenharia/obras/:id/planilha',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        querystring: z
          .object({
            view: z.string().optional().nullable(),
            planilhaId: z.coerce.number().int().positive().optional().nullable(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const params = request.params as any;
      const q = (request.query || {}) as any;
      const idObra = Number(params.id);
      const view = String(q.view || '').trim().toLowerCase();
      const planilhaIdParam = q.planilhaId != null ? Number(q.planilhaId) : null;

      const scope = (request.user as any)?.abrangencia as any;
      if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

      const obra = await prisma.obra.findFirst({ where: { tenantId: ctx.tenantId, id: idObra }, select: { id: true, status: true } }).catch(() => null);
      if (!obra) return fail(reply, 404, 'Obra não encontrada');

      await ensurePlanilhaOrcamentariaTables(prisma);

      const obraStatus = obra.status ? String(obra.status) : null;

      if (view === 'versoes') {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `
          SELECT
            v.id_planilha AS "idPlanilha",
            v.numero_versao AS "numeroVersao",
            v.nome AS "nome",
            v.atual AS "atual",
            v.origem AS "origem",
            v.criado_em AS "criadoEm",
            COALESCE(SUM(CASE WHEN l.tipo_linha = 'SERVICO' THEN COALESCE(l.valor_parcial, 0) ELSE 0 END), 0) AS "valorTotal",
            SUM(CASE WHEN l.tipo_linha = 'SERVICO' THEN 1 ELSE 0 END) AS "totalServicos"
          FROM obras_planilhas_versoes v
          LEFT JOIN obras_planilhas_linhas l
            ON l.tenant_id = v.tenant_id AND l.id_planilha = v.id_planilha
          WHERE v.tenant_id = $1 AND v.id_obra = $2
          GROUP BY v.id_planilha, v.numero_versao, v.nome, v.atual, v.origem, v.criado_em
          ORDER BY v.numero_versao DESC, v.id_planilha DESC
          `,
          ctx.tenantId,
          idObra
        );

        return ok(reply, {
          idObra,
          obraStatus,
          versoes: (rows || []).map((r: any) => ({
            idPlanilha: Number(r.idPlanilha),
            numeroVersao: Number(r.numeroVersao),
            nome: String(r.nome || ''),
            atual: Boolean(r.atual),
            origem: String(r.origem || 'MANUAL'),
            criadoEm: r.criadoEm ? new Date(r.criadoEm).toISOString() : '',
            valorTotal: r.valorTotal == null ? 0 : Number(r.valorTotal),
            totalServicos: Number(r.totalServicos || 0),
          })),
        });
      }

      const idPlanilhaFromQuery = planilhaIdParam && Number.isFinite(planilhaIdParam) && planilhaIdParam > 0 ? planilhaIdParam : null;
      let idPlanilha: number | null = idPlanilhaFromQuery;
      if (!idPlanilha) {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `
          SELECT id_planilha AS "idPlanilha"
          FROM obras_planilhas_versoes
          WHERE tenant_id = $1 AND id_obra = $2 AND atual = TRUE
          ORDER BY numero_versao DESC, id_planilha DESC
          LIMIT 1
          `,
          ctx.tenantId,
          idObra
        );
        idPlanilha = rows?.[0]?.idPlanilha ? Number(rows[0].idPlanilha) : null;
      }

      if (!idPlanilha) return ok(reply, { idObra, obraStatus, planilha: null });

      const versoes = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          id_planilha AS "idPlanilha",
          numero_versao AS "numeroVersao",
          nome,
          atual,
          origem,
          data_base_sbc AS "dataBaseSbc",
          data_base_sinapi AS "dataBaseSinapi",
          bdi_servicos_sbc AS "bdiServicosSbc",
          bdi_servicos_sinapi AS "bdiServicosSinapi",
          bdi_diferenciado_sbc AS "bdiDiferenciadoSbc",
          bdi_diferenciado_sinapi AS "bdiDiferenciadoSinapi",
          enc_sociais_sem_des_sbc AS "encSociaisSemDesSbc",
          enc_sociais_sem_des_sinapi AS "encSociaisSemDesSinapi",
          desconto_sbc AS "descontoSbc",
          desconto_sinapi AS "descontoSinapi",
          criado_em AS "criadoEm"
        FROM obras_planilhas_versoes
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
        LIMIT 1
        `,
        ctx.tenantId,
        idObra,
        idPlanilha
      );
      const v = versoes?.[0] || null;
      if (!v) return ok(reply, { idObra, obraStatus, planilha: null });

      const linhas = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          id_linha AS "idLinha",
          ordem,
          item,
          codigo,
          fonte,
          servico,
          und,
          quantidade,
          valor_unitario AS "valorUnitario",
          valor_parcial AS "valorParcial",
          nivel,
          tipo_linha AS "tipoLinha"
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1 AND id_planilha = $2
        ORDER BY ordem ASC, id_linha ASC
        `,
        ctx.tenantId,
        idPlanilha
      );

      return ok(reply, {
        idObra,
        obraStatus,
        planilha: {
          idPlanilha: Number(v.idPlanilha),
          numeroVersao: Number(v.numeroVersao),
          nome: String(v.nome || ''),
          atual: Boolean(v.atual),
          origem: String(v.origem || 'MANUAL'),
          criadoEm: v.criadoEm ? new Date(v.criadoEm).toISOString() : '',
          parametros: {
            dataBaseSbc: v.dataBaseSbc ? String(v.dataBaseSbc) : null,
            dataBaseSinapi: v.dataBaseSinapi ? String(v.dataBaseSinapi) : null,
            bdiServicosSbc: v.bdiServicosSbc == null ? null : Number(v.bdiServicosSbc),
            bdiServicosSinapi: v.bdiServicosSinapi == null ? null : Number(v.bdiServicosSinapi),
            bdiDiferenciadoSbc: v.bdiDiferenciadoSbc == null ? null : Number(v.bdiDiferenciadoSbc),
            bdiDiferenciadoSinapi: v.bdiDiferenciadoSinapi == null ? null : Number(v.bdiDiferenciadoSinapi),
            encSociaisSemDesSbc: v.encSociaisSemDesSbc == null ? null : Number(v.encSociaisSemDesSbc),
            encSociaisSemDesSinapi: v.encSociaisSemDesSinapi == null ? null : Number(v.encSociaisSemDesSinapi),
            descontoSbc: v.descontoSbc == null ? null : Number(v.descontoSbc),
            descontoSinapi: v.descontoSinapi == null ? null : Number(v.descontoSinapi),
          },
          linhas: (linhas || []).map((r: any) => ({
            idLinha: Number(r.idLinha),
            ordem: Number(r.ordem || 0),
            item: r.item ? String(r.item) : '',
            codigo: r.codigo ? String(r.codigo) : '',
            fonte: r.fonte ? String(r.fonte) : '',
            servicos: r.servico ? String(r.servico) : '',
            und: r.und ? String(r.und) : '',
            quant: r.quantidade == null ? '' : String(r.quantidade),
            valorUnitario: r.valorUnitario == null ? '' : String(r.valorUnitario),
            valorParcial: r.valorParcial == null ? '' : String(r.valorParcial),
            nivel: Number(r.nivel || 0),
            tipoLinha: String(r.tipoLinha || 'ITEM'),
          })),
        },
      });
    }
  );

  server.post(
    '/engenharia/obras/:id/planilha',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const params = request.params as any;
      const idObra = Number(params.id);

      const scope = (request.user as any)?.abrangencia as any;
      if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

      const obra = await prisma.obra.findFirst({ where: { tenantId: ctx.tenantId, id: idObra }, select: { id: true, status: true } }).catch(() => null);
      if (!obra) return fail(reply, 404, 'Obra não encontrada');

      await ensurePlanilhaOrcamentariaTables(prisma);

      const obraStatus = obra.status ? String(obra.status) : null;
      const isObraNaoIniciada = String(obraStatus || '').toUpperCase() === 'NAO_INICIADA';

      const isMultipart = typeof (request as any).isMultipart === 'function' ? (request as any).isMultipart() : false;

      if (isMultipart) {
        if (!isObraNaoIniciada) return fail(reply, 422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');

        const parts = (request as any).parts();
        let action = '';
        let nome = '';
        let fileBuffer: Buffer | null = null;
        for await (const part of parts) {
          if (part.type === 'file') {
            if (String(part.fieldname) === 'file') fileBuffer = await part.toBuffer();
            continue;
          }
          const field = String(part.fieldname || '');
          if (field === 'action') action = String(part.value || '').trim().toUpperCase();
          if (field === 'nome') nome = String(part.value || '').trim();
        }

        if (action !== 'IMPORTAR_CSV') return fail(reply, 422, 'Ação inválida');
        if (!fileBuffer) return fail(reply, 422, 'Arquivo CSV é obrigatório (campo "file")');

        const csvText = fileBuffer.toString('utf8');
        const { headers, rows } = parseCsvTextAuto(csvText);
        if (!headers.length || !rows.length) return fail(reply, 422, 'CSV vazio ou inválido');

        const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
        const get = (r: string[], key: string) => String(r[idx[key]] ?? '').trim();

        const required = ['item', 'codigo', 'fonte', 'servicos', 'und', 'quant', 'valor_unitario', 'valor_parcial'];
        const missing = required.filter((k) => idx[k] == null);
        if (missing.length) return fail(reply, 422, `Colunas obrigatórias ausentes no CSV: ${missing.join(', ')}`);

        const created = await prisma.$transaction(async (tx: any) => {
          const maxRows = await tx.$queryRawUnsafe<any[]>(
            `SELECT COALESCE(MAX(numero_versao),0) AS "maxVersao" FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2`,
            ctx.tenantId,
            idObra
          );
          const nextVersao = Number(maxRows?.[0]?.maxVersao || 0) + 1;
          const nomeFinal = String(nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;

          const ins = await tx.$queryRawUnsafe<any[]>(
            `
            INSERT INTO obras_planilhas_versoes
              (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador)
            VALUES
              ($1,$2,$3,$4,TRUE,'CSV',$5)
            RETURNING id_planilha AS "idPlanilha"
            `,
            ctx.tenantId,
            idObra,
            nextVersao,
            nomeFinal,
            ctx.userId
          );
          const idPlanilha = Number(ins?.[0]?.idPlanilha || 0);
          await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
          await tx.$executeRawUnsafe(
            `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );

          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const item = get(r, 'item');
            const codigo = get(r, 'codigo');
            const fonte = get(r, 'fonte');
            const servicos = get(r, 'servicos');
            const und = get(r, 'und');
            const quant = get(r, 'quant');
            const valorUnit = get(r, 'valor_unitario');
            const valorParcial = get(r, 'valor_parcial');
            const det = detectTipoLinha(item, und, quant, valorUnit);
            const quantidade = toDec(quant);
            const vUnit = toDec(valorUnit);
            const parcialCalc = quantidade != null && vUnit != null ? Number((quantidade * vUnit).toFixed(6)) : null;
            const vParc = toDec(valorParcial) ?? parcialCalc;

            await tx.$executeRawUnsafe(
              `
              INSERT INTO obras_planilhas_linhas
                (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
              VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              `,
              ctx.tenantId,
              idPlanilha,
              i + 1,
              item || null,
              codigo || null,
              fonte || null,
              servicos || null,
              und || null,
              quantidade == null ? null : quantidade,
              vUnit == null ? null : vUnit,
              vParc == null ? null : vParc,
              det.nivel,
              det.tipo
            );
          }

          return { idPlanilha, numeroVersao: nextVersao };
        });

        return ok(reply, { idObra, idPlanilha: created.idPlanilha, numeroVersao: created.numeroVersao }, { message: 'CSV importado' });
      }

      const body = (request.body || {}) as any;
      const action = String(body.action || '').trim().toUpperCase();

      if (action === 'NOVA_VERSAO') {
        if (!isObraNaoIniciada) return fail(reply, 422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
        const created = await prisma.$transaction(async (tx: any) => {
          const maxRows = await tx.$queryRawUnsafe<any[]>(
            `SELECT COALESCE(MAX(numero_versao),0) AS "maxVersao" FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2`,
            ctx.tenantId,
            idObra
          );
          const nextVersao = Number(maxRows?.[0]?.maxVersao || 0) + 1;
          const nome = String(body.nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;
          const copyFrom = body.copyFromPlanilhaId != null ? Number(body.copyFromPlanilhaId) : null;

          const ins = await tx.$queryRawUnsafe<any[]>(
            `
            INSERT INTO obras_planilhas_versoes
              (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador)
            VALUES
              ($1,$2,$3,$4,TRUE,'MANUAL',$5)
            RETURNING id_planilha AS "idPlanilha"
            `,
            ctx.tenantId,
            idObra,
            nextVersao,
            nome,
            ctx.userId
          );
          const idPlanilha = Number(ins?.[0]?.idPlanilha || 0);
          await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
          await tx.$executeRawUnsafe(
            `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );

          if (copyFrom && Number.isFinite(copyFrom) && copyFrom > 0) {
            await tx.$executeRawUnsafe(
              `
              INSERT INTO obras_planilhas_linhas
                (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
              SELECT
                $1 AS tenant_id,
                $2 AS id_planilha,
                ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha
              FROM obras_planilhas_linhas
              WHERE tenant_id = $1 AND id_planilha = $3
              ORDER BY ordem ASC, id_linha ASC
              `,
              ctx.tenantId,
              idPlanilha,
              copyFrom
            );
          }

          return { idPlanilha, numeroVersao: nextVersao };
        });

        return ok(reply, { idObra, idPlanilha: created.idPlanilha, numeroVersao: created.numeroVersao }, { message: 'Nova versão criada' });
      }

      return fail(reply, 422, 'Ação inválida');
    }
  );

  server.get('/engenharia/projetos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        q: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
      })
      .parse(request.query || {});

    const term = String(q.q || '').trim();
    const status = String(q.status || '').trim().toUpperCase();
    const where: any = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (term) {
      where.OR = [
        { titulo: { contains: term, mode: 'insensitive' } },
        { numeroProjeto: { contains: term, mode: 'insensitive' } },
        { tipo: { contains: term, mode: 'insensitive' } },
        { endereco: { contains: term, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.engenhariaProjeto.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idProjeto: r.id,
        titulo: r.titulo,
        endereco: r.endereco ?? null,
        descricao: r.descricao ?? null,
        tipo: r.tipo ?? null,
        numeroProjeto: r.numeroProjeto ?? null,
        revisao: r.revisao ?? null,
        status: r.status ?? null,
        dataProjeto: dateOnlyToIso(r.dataProjeto),
        dataAprovacao: dateOnlyToIso(r.dataAprovacao),
        atualizadoEm: r.updatedAt.toISOString(),
      }))
    );
  });

  server.post('/engenharia/projetos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        titulo: z.string().min(2),
        endereco: z.string().optional().nullable(),
        descricao: z.string().optional().nullable(),
        tipo: z.string().optional().nullable(),
        numeroProjeto: z.string().optional().nullable(),
        revisao: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        dataProjeto: z.string().optional().nullable(),
        dataAprovacao: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const created = await prisma.engenhariaProjeto.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: String(body.titulo).trim(),
        endereco: body.endereco ? String(body.endereco).trim() : null,
        descricao: body.descricao ? String(body.descricao).trim() : null,
        tipo: body.tipo ? String(body.tipo).trim() : null,
        numeroProjeto: body.numeroProjeto ? String(body.numeroProjeto).trim() : null,
        revisao: body.revisao ? String(body.revisao).trim() : null,
        status: body.status ? String(body.status).trim().toUpperCase() : null,
        dataProjeto: body.dataProjeto ? parseDateOnly(body.dataProjeto) : null,
        dataAprovacao: body.dataAprovacao ? parseDateOnly(body.dataAprovacao) : null,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
    return ok(reply, { idProjeto: created.id }, { message: 'Projeto cadastrado' });
  });

  server.get('/engenharia/projetos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const r = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!r) return fail(reply, 404, 'Projeto não encontrado');
    return ok(reply, {
      idProjeto: r.id,
      titulo: r.titulo,
      endereco: r.endereco ?? null,
      descricao: r.descricao ?? null,
      tipo: r.tipo ?? null,
      numeroProjeto: r.numeroProjeto ?? null,
      revisao: r.revisao ?? null,
      status: r.status ?? null,
      dataProjeto: dateOnlyToIso(r.dataProjeto),
      dataAprovacao: dateOnlyToIso(r.dataAprovacao),
    });
  });

  server.put('/engenharia/projetos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        titulo: z.string().min(2),
        endereco: z.string().optional().nullable(),
        descricao: z.string().optional().nullable(),
        tipo: z.string().optional().nullable(),
        numeroProjeto: z.string().optional().nullable(),
        revisao: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        dataProjeto: z.string().optional().nullable(),
        dataAprovacao: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const current = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Projeto não encontrado');

    const updated = await prisma.engenhariaProjeto.update({
      where: { id },
      data: {
        titulo: String(body.titulo).trim(),
        endereco: body.endereco ? String(body.endereco).trim() : null,
        descricao: body.descricao ? String(body.descricao).trim() : null,
        tipo: body.tipo ? String(body.tipo).trim() : null,
        numeroProjeto: body.numeroProjeto ? String(body.numeroProjeto).trim() : null,
        revisao: body.revisao ? String(body.revisao).trim() : null,
        status: body.status ? String(body.status).trim().toUpperCase() : null,
        dataProjeto: body.dataProjeto ? parseDateOnly(body.dataProjeto) : null,
        dataAprovacao: body.dataAprovacao ? parseDateOnly(body.dataAprovacao) : null,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
    return ok(reply, {}, { message: 'Projeto atualizado' });
  });

  server.delete('/engenharia/projetos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const current = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Projeto não encontrado');
    await prisma.engenhariaProjeto.delete({ where: { id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos', idRegistro: String(id), acao: 'DELETE', dadosAnteriores: current as any });
    return ok(reply, {}, { message: 'Projeto removido' });
  });

  server.get('/engenharia/projetos/:id/anexos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const rows = await prisma.engenhariaProjetoAnexo.findMany({
      where: { tenantId: ctx.tenantId, projetoId: projeto.id },
      orderBy: { id: 'desc' },
      take: 200,
      select: {
        id: true,
        nomeArquivo: true,
        mimeType: true,
        tamanhoBytes: true,
        createdAt: true,
        updatedAt: true,
        anotacoesJson: true,
      },
    });

    return ok(
      reply,
      rows.map((r) => ({
        idAnexo: r.id,
        nomeArquivo: r.nomeArquivo,
        mimeType: r.mimeType,
        tamanhoBytes: r.tamanhoBytes,
        criadoEm: r.createdAt.toISOString(),
        atualizadoEm: r.updatedAt.toISOString(),
        possuiAnotacoes: r.anotacoesJson != null,
      }))
    );
  });

  server.post('/engenharia/projetos/:id/anexos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const file = await (request as any).file?.();
    if (!file) return fail(reply, 400, 'Arquivo é obrigatório');

    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    const nomeArquivo = String(file.filename || '').trim() || 'arquivo';

    const allowed = mimeType === 'application/pdf' || mimeType.startsWith('image/');
    if (!allowed) return fail(reply, 400, 'Tipo de arquivo inválido. Envie PDF ou imagem.');

    const buffer: Buffer = await file.toBuffer();
    if (!buffer?.length) return fail(reply, 400, 'Arquivo vazio');
    if (buffer.length > 10 * 1024 * 1024) return fail(reply, 413, 'Arquivo excede 10MB');

    const hashSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    const bytes = new Uint8Array(ab);

    const created = await prisma.engenhariaProjetoAnexo.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: projeto.id,
        nomeArquivo,
        mimeType,
        tamanhoBytes: buffer.length,
        hashSha256,
        data: bytes,
      },
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_anexos',
      idRegistro: String(created.id),
      acao: 'CREATE',
      dadosNovos: { id: created.id, projetoId: projeto.id, nomeArquivo, mimeType, tamanhoBytes: buffer.length, hashSha256 } as any,
    });

    return ok(reply, { idAnexo: created.id }, { message: 'Anexo enviado' });
  });

  server.get('/engenharia/projetos/anexos/:id/download', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const anexo = await prisma.engenhariaProjetoAnexo
      .findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, nomeArquivo: true, mimeType: true, data: true },
      })
      .catch(() => null);
    if (!anexo) return fail(reply, 404, 'Anexo não encontrado');

    reply.header('Content-Type', anexo.mimeType || 'application/octet-stream');
    reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.nomeArquivo)}"`);
    return reply.send(Buffer.from(anexo.data as any));
  });

  server.get('/engenharia/projetos/anexos/:id/anotacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const anexo = await prisma.engenhariaProjetoAnexo
      .findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, anotacoesJson: true },
      })
      .catch(() => null);
    if (!anexo) return fail(reply, 404, 'Anexo não encontrado');
    return ok(reply, { anotacoes: (anexo.anotacoesJson as any) ?? null });
  });

  server.put('/engenharia/projetos/anexos/:id/anotacoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z.object({ anotacoes: z.any().optional().nullable() }).parse(request.body || {});

    const current = await prisma.engenhariaProjetoAnexo
      .findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, anotacoesJson: true },
      })
      .catch(() => null);
    if (!current) return fail(reply, 404, 'Anexo não encontrado');

    const updated = await prisma.engenhariaProjetoAnexo.update({
      where: { id },
      data: { anotacoesJson: body.anotacoes == null ? undefined : (body.anotacoes as any) },
      select: { id: true },
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_anexos_anotacoes',
      idRegistro: String(updated.id),
      acao: 'UPDATE',
      dadosAnteriores: { anotacoes: current.anotacoesJson ? true : false } as any,
      dadosNovos: { anotacoes: body.anotacoes ? true : false } as any,
    });

    return ok(reply, {}, { message: 'Anotações salvas' });
  });

  server.get('/engenharia/projetos/:id/rascunhos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const rows = await prisma.engenhariaProjetoRascunho.findMany({
      where: {
        tenantId: ctx.tenantId,
        projetoId: projeto.id,
        OR: [{ ownerUserId: ctx.userId }, { shares: { some: { tenantId: ctx.tenantId, userId: ctx.userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        ownerUser: { select: { id: true, email: true, name: true } },
        shares: { where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { permissao: true } },
      },
    });

    return ok(
      reply,
      rows.map((r) => {
        const sharedPerm = r.shares?.[0]?.permissao ? String(r.shares[0].permissao).toUpperCase() : null;
        const permissao = r.ownerUserId === ctx.userId ? 'OWNER' : sharedPerm === 'EDIT' ? 'EDIT' : 'VIEW';
        return {
          idRascunho: r.id,
          idProjeto: r.projetoId,
          idUsuarioOwner: r.ownerUserId,
          titulo: r.titulo,
          permissao,
          ownerNome: r.ownerUser?.name ?? null,
          ownerEmail: r.ownerUser?.email ?? null,
          criadoEm: r.createdAt.toISOString(),
          atualizadoEm: r.updatedAt.toISOString(),
        };
      })
    );
  });

  server.post('/engenharia/projetos/:id/rascunhos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        titulo: z.string().optional().nullable(),
        payload: z.any(),
      })
      .parse(request.body || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const titulo = String(body.titulo || '').trim() || 'Rascunho';
    const created = await prisma.engenhariaProjetoRascunho.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: projeto.id,
        ownerUserId: ctx.userId,
        titulo,
        payload: body.payload as any,
      },
      select: { id: true },
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_rascunhos',
      idRegistro: String(created.id),
      acao: 'CREATE',
      dadosNovos: { id: created.id, projetoId: projeto.id, ownerUserId: ctx.userId, titulo } as any,
    });

    return ok(reply, { idRascunho: created.id }, { message: 'Rascunho criado' });
  });

  server.get('/engenharia/projetos/rascunhos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const rascunho = await prisma.engenhariaProjetoRascunho
      .findFirst({
        where: {
          id,
          tenantId: ctx.tenantId,
          OR: [{ ownerUserId: ctx.userId }, { shares: { some: { tenantId: ctx.tenantId, userId: ctx.userId } } }],
        },
        include: {
          ownerUser: { select: { id: true, email: true, name: true } },
          shares: { where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { permissao: true } },
        },
      })
      .catch(() => null);
    if (!rascunho) return fail(reply, 404, 'Rascunho não encontrado');

    const sharedPerm = rascunho.shares?.[0]?.permissao ? String(rascunho.shares[0].permissao).toUpperCase() : null;
    const permissao = rascunho.ownerUserId === ctx.userId ? 'OWNER' : sharedPerm === 'EDIT' ? 'EDIT' : 'VIEW';

    return ok(reply, {
      idRascunho: rascunho.id,
      idProjeto: rascunho.projetoId,
      idUsuarioOwner: rascunho.ownerUserId,
      titulo: rascunho.titulo,
      permissao,
      ownerNome: rascunho.ownerUser?.name ?? null,
      ownerEmail: rascunho.ownerUser?.email ?? null,
      criadoEm: rascunho.createdAt.toISOString(),
      atualizadoEm: rascunho.updatedAt.toISOString(),
      payload: (rascunho.payload as any) ?? null,
    });
  });

  server.put('/engenharia/projetos/rascunhos/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        titulo: z.string().optional().nullable(),
        payload: z.any().optional(),
      })
      .parse(request.body || {});

    const current = await prisma.engenhariaProjetoRascunho
      .findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { shares: { where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { permissao: true } } },
      })
      .catch(() => null);
    if (!current) return fail(reply, 404, 'Rascunho não encontrado');

    const sharedPerm = current.shares?.[0]?.permissao ? String(current.shares[0].permissao).toUpperCase() : null;
    const canEdit = current.ownerUserId === ctx.userId || sharedPerm === 'EDIT';
    if (!canEdit) return fail(reply, 403, 'Sem permissão para editar este rascunho');

    const titulo = body.titulo == null ? undefined : String(body.titulo).trim();
    const updated = await prisma.engenhariaProjetoRascunho.update({
      where: { id },
      data: {
        titulo: titulo && titulo.length ? titulo : undefined,
        payload: body.payload === undefined ? undefined : (body.payload as any),
      },
      select: { id: true, titulo: true },
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_rascunhos',
      idRegistro: String(updated.id),
      acao: 'UPDATE',
      dadosAnteriores: { id: current.id, titulo: current.titulo } as any,
      dadosNovos: { id: updated.id, titulo: updated.titulo } as any,
    });

    return ok(reply, {}, { message: 'Rascunho atualizado' });
  });

  server.post('/engenharia/projetos/rascunhos/:id/compartilhar', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        email: z.string().email().optional().nullable(),
        userId: z.number().int().positive().optional().nullable(),
        permissao: z.enum(['VIEW', 'EDIT']).optional().nullable(),
      })
      .parse(request.body || {});

    const rascunho = await prisma.engenhariaProjetoRascunho.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, ownerUserId: true } }).catch(() => null);
    if (!rascunho) return fail(reply, 404, 'Rascunho não encontrado');
    if (rascunho.ownerUserId !== ctx.userId) return fail(reply, 403, 'Apenas o dono pode compartilhar este rascunho');

    let targetUserId: number | null = null;
    if (body.userId) targetUserId = Number(body.userId);
    else if (body.email) {
      const u = await prisma.user.findFirst({ where: { email: String(body.email).trim().toLowerCase() }, select: { id: true } }).catch(() => null);
      if (!u) return fail(reply, 404, 'Usuário não encontrado');
      targetUserId = u.id;
    }
    if (!targetUserId) return fail(reply, 400, 'Informe userId ou email');
    if (targetUserId === ctx.userId) return fail(reply, 400, 'Você já é o dono do rascunho');

    const membership = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantId, userId: targetUserId, ativo: true }, select: { id: true } }).catch(() => null);
    if (!membership) return fail(reply, 400, 'Usuário não pertence a este tenant (ou está inativo)');

    const permissao = String(body.permissao || 'VIEW').toUpperCase() === 'EDIT' ? 'EDIT' : 'VIEW';
    const up = await prisma.engenhariaProjetoRascunhoShare.upsert({
      where: { tenantId_rascunhoId_userId: { tenantId: ctx.tenantId, rascunhoId: rascunho.id, userId: targetUserId } },
      create: { tenantId: ctx.tenantId, rascunhoId: rascunho.id, userId: targetUserId, permissao },
      update: { permissao },
      select: { id: true },
    });

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_rascunhos_compartilhar',
      idRegistro: String(rascunho.id),
      acao: 'UPDATE',
      dadosNovos: { rascunhoId: rascunho.id, userId: targetUserId, permissao, shareId: up.id } as any,
    });

    return ok(reply, {}, { message: 'Compartilhamento atualizado' });
  });

  server.delete('/engenharia/projetos/rascunhos/:id/compartilhar/:userId', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, userId } = z.object({ id: z.coerce.number().int().positive(), userId: z.coerce.number().int().positive() }).parse(request.params || {});

    const rascunho = await prisma.engenhariaProjetoRascunho.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, ownerUserId: true } }).catch(() => null);
    if (!rascunho) return fail(reply, 404, 'Rascunho não encontrado');
    if (rascunho.ownerUserId !== ctx.userId) return fail(reply, 403, 'Apenas o dono pode remover compartilhamentos');

    await prisma.engenhariaProjetoRascunhoShare
      .delete({
        where: { tenantId_rascunhoId_userId: { tenantId: ctx.tenantId, rascunhoId: rascunho.id, userId } },
      })
      .catch(() => null);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      entidade: 'engenharia_projetos_rascunhos_compartilhar',
      idRegistro: String(rascunho.id),
      acao: 'UPDATE',
      dadosNovos: { rascunhoId: rascunho.id, userId, removido: true } as any,
    });

    return ok(reply, {}, { message: 'Compartilhamento removido' });
  });

  server.get('/engenharia/projetos/responsaveis', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ idProjeto: z.coerce.number().int().positive() }).parse(request.query || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id: q.idProjeto, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const rows = await prisma.engenhariaProjetoResponsavel.findMany({
      where: { tenantId: ctx.tenantId, projetoId: projeto.id },
      include: { responsavel: true },
      orderBy: { id: 'desc' },
      take: 500,
    });

    return ok(
      reply,
      rows.map((r) => ({
        idProjetoResponsavel: r.id,
        idProjeto: r.projetoId,
        idTecnico: r.responsavelId,
        nome: r.responsavel?.name || '',
        conselho: r.responsavel?.conselho ?? null,
        numeroRegistro: r.responsavel?.numeroRegistro ?? r.responsavel?.crea ?? null,
        tipo: String(r.tipo || '').toUpperCase() === 'FISCAL_OBRA' ? 'FISCAL_OBRA' : 'RESPONSAVEL_TECNICO',
        abrangencia: r.abrangencia ?? null,
        numeroDocumento: r.numeroDocumento ?? null,
        observacao: r.observacao ?? null,
      }))
    );
  });

  server.post('/engenharia/projetos/responsaveis', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z
      .object({
        idProjeto: z.number().int().positive(),
        idTecnico: z.number().int().positive(),
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        abrangencia: z.string().optional().nullable(),
        numeroDocumento: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id: body.idProjeto, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const tecnico = await prisma.responsavelTecnico.findFirst({ where: { id: body.idTecnico, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!tecnico) return fail(reply, 404, 'Profissional não encontrado');

    const created = await prisma.engenhariaProjetoResponsavel
      .create({
        data: {
          tenantId: ctx.tenantId,
          projetoId: projeto.id,
          responsavelId: tecnico.id,
          tipo: body.tipo,
          abrangencia: body.abrangencia ? String(body.abrangencia).trim() : null,
          numeroDocumento: body.numeroDocumento ? String(body.numeroDocumento).trim() : null,
          observacao: body.observacao ? String(body.observacao).trim() : null,
        },
      })
      .catch((e: any) => {
        if (String(e?.code || '') === 'P2002') return null;
        throw e;
      });
    if (!created) return fail(reply, 409, 'Responsável já vinculado ao projeto');

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos_responsaveis', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });

    const links = await prisma.engenhariaObraProjeto.findMany({
      where: { tenantId: ctx.tenantId, projetoId: projeto.id },
      select: { obraId: true },
      take: 1000,
    });
    const obraIds = Array.from(new Set(links.map((l) => l.obraId))).filter((x) => Number.isInteger(x) && x > 0);
    if (obraIds.length) {
      const responsabilidade = body.abrangencia ? String(body.abrangencia).trim() : '';
      const respKey = responsabilidade ? responsabilidade.toLowerCase() : '';
      const numeroDoc = body.numeroDocumento ? String(body.numeroDocumento).trim() : '';
      const docInclusaoNumero = numeroDoc || `Vínculo via projeto #${projeto.id}`;
      const docInclusaoTipo = inferDocTipoFromNumero(numeroDoc);

      await prisma.$transaction(async (tx) => {
        const existing = await tx.responsavelObra.findMany({
          where: { obraId: { in: obraIds }, responsavelId: tecnico.id, role: body.tipo, endDate: null },
          select: { id: true, obraId: true, notes: true },
        });
        const existingKey = new Set(
          existing.map((e) => {
            const parsed = parseResponsavelObraNotes((e as any).notes || null);
            const resp = parsed.responsabilidade ? String(parsed.responsabilidade).trim().toLowerCase() : '';
            return `${e.obraId}::${resp}`;
          })
        );

        for (const obraId of obraIds) {
          const key = `${obraId}::${respKey}`;
          if (existingKey.has(key)) continue;
          await tx.responsavelObra.create({
            data: {
              obraId,
              responsavelId: tecnico.id,
              role: body.tipo,
              startDate: new Date(),
              endDate: null,
              notes: buildResponsavelObraNotes({
                responsabilidade: responsabilidade || null,
                docInclusaoTipo,
                docInclusaoNumero,
                docBaixaTipo: null,
                docBaixaNumero: null,
              }),
            },
          });
          await addTenantHistoryEntry(tx, {
            tenantId: ctx.tenantId,
            source: 'SYSTEM',
            actorUserId: ctx.userId,
            action: `OBRA:${obraId}`,
            message: `Obra #${obraId}: responsável incluído automaticamente via projeto #${projeto.id} (${body.tipo}).`,
          });
        }
      });
    }

    return ok(reply, { idProjetoResponsavel: created.id }, { message: 'Responsável vinculado' });
  });

  server.put('/engenharia/projetos/responsaveis/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const body = z
      .object({
        tipo: z.enum(['RESPONSAVEL_TECNICO', 'FISCAL_OBRA']),
        abrangencia: z.string().optional().nullable(),
        numeroDocumento: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      })
      .parse(request.body || {});

    const current = await prisma.engenhariaProjetoResponsavel.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Registro não encontrado');

    const updated = await prisma.engenhariaProjetoResponsavel.update({
      where: { id },
      data: {
        tipo: body.tipo,
        abrangencia: body.abrangencia ? String(body.abrangencia).trim() : null,
        numeroDocumento: body.numeroDocumento ? String(body.numeroDocumento).trim() : null,
        observacao: body.observacao ? String(body.observacao).trim() : null,
      },
    });

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos_responsaveis', idRegistro: String(id), acao: 'UPDATE', dadosAnteriores: current as any, dadosNovos: updated as any });
    return ok(reply, {}, { message: 'Responsável atualizado' });
  });

  server.delete('/engenharia/projetos/responsaveis/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});

    const current = await prisma.engenhariaProjetoResponsavel.findFirst({ where: { id, tenantId: ctx.tenantId } }).catch(() => null);
    if (!current) return fail(reply, 404, 'Registro não encontrado');

    await prisma.engenhariaProjetoResponsavel.delete({ where: { id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_projetos_responsaveis', idRegistro: String(id), acao: 'DELETE', dadosAnteriores: current as any });
    return ok(reply, {}, { message: 'Responsável removido' });
  });

  server.get('/engenharia/obras/projetos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ idObra: z.coerce.number().int().positive() }).parse(request.query || {});

    const obra = await prisma.obra.findUnique({ where: { id: q.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const links = await prisma.engenhariaObraProjeto.findMany({
      where: { tenantId: ctx.tenantId, obraId: obra.id },
      include: {
        projeto: {
          include: {
            _count: { select: { anexos: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 500,
    });

    return ok(
      reply,
      links.map((l) => ({
        idObraProjeto: l.id,
        idObra: l.obraId,
        idProjeto: l.projetoId,
        titulo: l.projeto?.titulo || '',
        endereco: l.projeto?.endereco ?? null,
        descricao: l.projeto?.descricao ?? null,
        tipo: l.projeto?.tipo ?? null,
        numeroProjeto: l.projeto?.numeroProjeto ?? null,
        revisao: l.projeto?.revisao ?? null,
        status: l.projeto?.status ?? null,
        dataProjeto: dateOnlyToIso(l.projeto?.dataProjeto ?? null),
        dataAprovacao: dateOnlyToIso(l.projeto?.dataAprovacao ?? null),
        qtdAnexos: (l.projeto as any)?._count?.anexos ? Number((l.projeto as any)._count.anexos) : 0,
        vinculadoEm: l.createdAt.toISOString(),
      }))
    );
  });

  server.post('/engenharia/obras/projetos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const body = z.object({ idObra: z.number().int().positive(), idProjeto: z.number().int().positive() }).parse(request.body || {});

    const obra = await prisma.obra.findUnique({ where: { id: body.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const projeto = await prisma.engenhariaProjeto.findFirst({ where: { id: body.idProjeto, tenantId: ctx.tenantId }, select: { id: true } }).catch(() => null);
    if (!projeto) return fail(reply, 404, 'Projeto não encontrado');

    const created = await prisma.engenhariaObraProjeto
      .create({
        data: { tenantId: ctx.tenantId, obraId: obra.id, projetoId: projeto.id },
      })
      .catch((e: any) => {
        if (String(e?.code || '') === 'P2002') return null;
        throw e;
      });
    if (!created) return fail(reply, 409, 'Projeto já vinculado à obra');

    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_projetos', idRegistro: String(created.id), acao: 'CREATE', dadosNovos: created as any });
    await addTenantHistoryEntry(prisma, {
      tenantId: ctx.tenantId,
      source: 'SYSTEM',
      actorUserId: ctx.userId,
      action: `OBRA:${obra.id}`,
      message: `Obra #${obra.id}: projeto #${projeto.id} vinculado.`,
    });
    return ok(reply, { idObraProjeto: created.id }, { message: 'Projeto vinculado' });
  });

  server.delete('/engenharia/obras/projetos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ idObra: z.coerce.number().int().positive(), idProjeto: z.coerce.number().int().positive() }).parse(request.query || {});

    const obra = await prisma.obra.findUnique({ where: { id: q.idObra }, select: { id: true, tenantId: true } }).catch(() => null);
    if (!obra || obra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Obra não encontrada');

    const link = await prisma.engenhariaObraProjeto.findFirst({ where: { tenantId: ctx.tenantId, obraId: obra.id, projetoId: q.idProjeto }, select: { id: true } }).catch(() => null);
    if (!link) return fail(reply, 404, 'Vínculo não encontrado');

    await prisma.engenhariaObraProjeto.delete({ where: { id: link.id } });
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, entidade: 'engenharia_obras_projetos', idRegistro: String(link.id), acao: 'DELETE', dadosAnteriores: link as any });
    return ok(reply, {}, { message: 'Projeto desvinculado' });
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

    const bytes = new Uint8Array(buf);
    const created = await prisma.engenhariaContraparteDocumento.create({
      data: {
        tenantId: ctx.tenantId,
        contraparteId: params.id,
        nomeArquivo: String(body.nomeArquivo).trim(),
        mimeType: String(body.mimeType).trim(),
        tamanhoBytes: buf.length,
        conteudo: bytes,
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
