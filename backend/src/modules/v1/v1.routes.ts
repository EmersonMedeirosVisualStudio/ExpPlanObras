import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
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

function normalizeClassificacaoSinapiToTipoExpert(classificacao: unknown): string | null {
  const raw = String(classificacao || '').trim();
  const key = normalizeHeader(raw);
  if (!key) return null;
  if (key === 'material') return 'MATERIAL';
  if (key === 'mao_de_obra') return 'MAO DE OBRA';
  if (key.includes('equipamento') && key.includes('aquisicao')) return 'EQUIPAMENTO (AQUISIÇÃO)';
  if (key.includes('equipamento') && key.includes('locacao')) return 'EQUIPAMENTO (LOCAÇÃO)';
  if (key === 'equipamento') return 'EQUIPAMENTO (AQUISIÇÃO)';
  if (key === 'servicos') return 'SERVIÇOS';
  if (key === 'especiais') return 'ESPECIAIS';
  return raw.toUpperCase();
}

function computeTipoExpert(args: { tipoItemSinapi: unknown; classificacaoSinapi: unknown }): string {
  const tipoKey = normalizeHeader(String(args.tipoItemSinapi || ''));
  if (tipoKey.includes('composicao')) return 'COMPOSICAO';
  const cls = normalizeClassificacaoSinapiToTipoExpert(args.classificacaoSinapi);
  if (tipoKey.includes('insumo')) return cls || 'INSUMO';
  return cls || String(args.tipoItemSinapi || '').trim().toUpperCase() || 'INSUMO';
}

function parseCsvTextAuto(text: string) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  const sep = tab > semi && tab > comma ? '\t' : semi > comma ? ';' : ',';
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

function decodeCsvBuffer(buf: Buffer) {
  const utf8 = buf.toString('utf8');
  const latin1 = buf.toString('latin1');
  const score = (t: string) => {
    const replacement = (t.match(/\uFFFD/g) || []).length;
    const mojibake = (t.match(/[ÃÂ]/g) || []).length;
    return replacement * 10 + mojibake;
  };
  return score(utf8) <= score(latin1) ? utf8 : latin1;
}

function toDec(v: unknown) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let norm = cleaned;
  if (hasDot && hasComma) {
    norm = norm.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma) {
    norm = norm.replace(/,/g, '.');
  } else {
    const parts = norm.split('.');
    if (parts.length > 2) norm = norm.replace(/\./g, '');
  }
  norm = norm.replace(/[^\d.\-]/g, '');
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
      uf_sinapi VARCHAR(2) NULL,
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
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_versoes ADD COLUMN IF NOT EXISTS uf_sinapi VARCHAR(2) NULL`).catch(() => null);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_planilhas_linhas (
      id_linha BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_planilha BIGINT NOT NULL,
      ordem INT NOT NULL DEFAULT 0,
      item VARCHAR(80) NULL,
      codigo VARCHAR(80) NULL,
      fonte VARCHAR(80) NULL,
      servico VARCHAR(800) NULL,
      und VARCHAR(40) NULL,
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

  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_linhas ALTER COLUMN item TYPE VARCHAR(80)`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_linhas ALTER COLUMN codigo TYPE VARCHAR(80)`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_linhas ALTER COLUMN fonte TYPE VARCHAR(80)`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_linhas ALTER COLUMN servico TYPE VARCHAR(800)`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_linhas ALTER COLUMN und TYPE VARCHAR(40)`).catch(() => null);
}

async function resolvePlanilhaIdForObra(tx: any, tenantId: number, idObra: number, requestedPlanilhaId?: number | null) {
  const req = requestedPlanilhaId != null ? Number(requestedPlanilhaId) : 0;
  if (Number.isFinite(req) && req > 0) {
    const ok = (await tx.$queryRawUnsafe(
      `
      SELECT 1 AS ok
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      tenantId,
      idObra,
      req
    )) as any[];
    if (!ok?.[0]?.ok) throw new Error(`Planilha inválida para a obra: #${req}`);
    return req;
  }

  const rows = (await tx.$queryRawUnsafe(
    `
    SELECT id_planilha AS "idPlanilha"
    FROM obras_planilhas_versoes
    WHERE tenant_id = $1 AND id_obra = $2
    ORDER BY atual DESC, numero_versao DESC, id_planilha DESC
    LIMIT 1
    `,
    tenantId,
    idObra
  )) as any[];
  const idPlanilha = rows?.[0]?.idPlanilha != null ? Number(rows[0].idPlanilha) : 0;
  if (!idPlanilha) throw new Error('Não há planilha cadastrada para a obra.');
  return idPlanilha;
}

async function ensurePlanilhaComposicaoTables(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_planilhas_composicoes_itens (
      id_item BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_obra BIGINT NOT NULL,
      id_planilha BIGINT NOT NULL DEFAULT 0,
      codigo_servico VARCHAR(80) NOT NULL,
      etapa VARCHAR(120) NULL,
      tipo_item VARCHAR(16) NOT NULL DEFAULT 'INSUMO',
      codigo_item VARCHAR(80) NOT NULL,
      banco VARCHAR(60) NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      quantidade NUMERIC(14,6) NOT NULL DEFAULT 0,
      valor_unitario NUMERIC(14,6) NULL,
      perda_percentual NUMERIC(10,4) NOT NULL DEFAULT 0,
      codigo_centro_custo VARCHAR(40) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_composicoes_itens ADD COLUMN IF NOT EXISTS id_planilha BIGINT NOT NULL DEFAULT 0`).catch(() => null);
  await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS obras_planilhas_composicoes_itens_uk`).catch(() => null);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS obras_planilhas_composicoes_itens_uk ON obras_planilhas_composicoes_itens (tenant_id, id_obra, id_planilha, codigo_servico, COALESCE(etapa,''), tipo_item, codigo_item)`
  );
  await tx.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS obras_planilhas_composicoes_itens_idx_servico ON obras_planilhas_composicoes_itens (tenant_id, id_obra, id_planilha, codigo_servico)`
  );
  await tx.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS obras_planilhas_composicoes_itens_idx_item ON obras_planilhas_composicoes_itens (tenant_id, id_obra, id_planilha, codigo_item)`
  );
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_composicoes_itens ALTER COLUMN tipo_item TYPE VARCHAR(32)`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_composicoes_itens ADD COLUMN IF NOT EXISTS banco VARCHAR(60) NULL`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_composicoes_itens ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(14,6) NULL`).catch(() => null);

  await tx
    .$executeRawUnsafe(
      `
      UPDATE obras_planilhas_composicoes_itens t
      SET id_planilha = v.id_planilha
      FROM (
        SELECT tenant_id, id_obra, id_planilha
        FROM obras_planilhas_versoes
        WHERE atual = TRUE
      ) v
      WHERE t.tenant_id = v.tenant_id
        AND t.id_obra = v.id_obra
        AND COALESCE(t.id_planilha,0) = 0
      `
    )
    .catch(() => null);
}

async function ensurePlanilhaComposicaoPrimitivaTables(tx: any) {
  await tx
    .$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        INNER JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'obras_planilhas_composicoes_primitivas'
          AND n.nspname = current_schema()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'obras_planilhas_composicoes_primitivas'
          AND c.relkind = 'r'
          AND n.nspname = current_schema()
      )
      THEN
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(current_schema()) || '.obras_planilhas_composicoes_primitivas CASCADE';
      END IF;
    END $$;
  `)
    .catch(() => null);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_planilhas_composicoes_primitivas (
      id_primitiva BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_obra BIGINT NOT NULL,
      id_planilha BIGINT NOT NULL DEFAULT 0,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(800) NULL,
      und_servico VARCHAR(40) NULL,
      itens_json JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_planilhas_composicoes_primitivas ADD COLUMN IF NOT EXISTS id_planilha BIGINT NOT NULL DEFAULT 0`).catch(() => null);
  await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS obras_planilhas_composicoes_primitivas_uk`).catch(() => null);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS obras_planilhas_composicoes_primitivas_uk ON obras_planilhas_composicoes_primitivas (tenant_id, id_obra, id_planilha, codigo_servico)`
  );
  await tx
    .$executeRawUnsafe(
      `
      UPDATE obras_planilhas_composicoes_primitivas t
      SET id_planilha = v.id_planilha
      FROM (
        SELECT tenant_id, id_obra, id_planilha
        FROM obras_planilhas_versoes
        WHERE atual = TRUE
      ) v
      WHERE t.tenant_id = v.tenant_id
        AND t.id_obra = v.id_obra
        AND COALESCE(t.id_planilha,0) = 0
      `
    )
    .catch(() => null);
}

async function ensureInsumosPrecosTables(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS obras_insumos_precos (
      id_preco BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_obra BIGINT NOT NULL,
      id_planilha BIGINT NOT NULL DEFAULT 0,
      codigo_item VARCHAR(80) NOT NULL,
      valor_unitario NUMERIC(14,6) NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`ALTER TABLE obras_insumos_precos ADD COLUMN IF NOT EXISTS id_planilha BIGINT NOT NULL DEFAULT 0`).catch(() => null);
  await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS obras_insumos_precos_uk`).catch(() => null);
  await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS obras_insumos_precos_uk ON obras_insumos_precos (tenant_id, id_obra, id_planilha, codigo_item)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS obras_insumos_precos_idx_obra ON obras_insumos_precos (tenant_id, id_obra, id_planilha)`);
  await tx
    .$executeRawUnsafe(
      `
      UPDATE obras_insumos_precos t
      SET id_planilha = v.id_planilha
      FROM (
        SELECT tenant_id, id_obra, id_planilha
        FROM obras_planilhas_versoes
        WHERE atual = TRUE
      ) v
      WHERE t.tenant_id = v.tenant_id
        AND t.id_obra = v.id_obra
        AND COALESCE(t.id_planilha,0) = 0
      `
    )
    .catch(() => null);
}

async function ensureEmpresaDocumentosLayoutTables(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS empresa_documentos_layout (
      tenant_id BIGINT PRIMARY KEY,
      logo_data_url TEXT NULL,
      cabecalho_texto TEXT NULL,
      rodape_texto TEXT NULL,
      cabecalho_html TEXT NULL,
      rodape_html TEXT NULL,
      cabecalho_altura_mm NUMERIC(8,2) NULL,
      rodape_altura_mm NUMERIC(8,2) NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`ALTER TABLE empresa_documentos_layout ADD COLUMN IF NOT EXISTS cabecalho_html TEXT NULL`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE empresa_documentos_layout ADD COLUMN IF NOT EXISTS rodape_html TEXT NULL`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE empresa_documentos_layout ADD COLUMN IF NOT EXISTS cabecalho_altura_mm NUMERIC(8,2) NULL`).catch(() => null);
  await tx.$executeRawUnsafe(`ALTER TABLE empresa_documentos_layout ADD COLUMN IF NOT EXISTS rodape_altura_mm NUMERIC(8,2) NULL`).catch(() => null);
}

async function ensureSinapiBaseTables(tx: any) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_insumos (
      id_insumo BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      uf VARCHAR(2) NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      tipo_preco VARCHAR(3) NOT NULL,
      codigo_item VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      preco_unitario NUMERIC(14,6) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS sinapi_insumos_uk ON sinapi_insumos (tenant_id, uf, data_base, tipo_preco, codigo_item)`
  );
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_insumos_idx ON sinapi_insumos (tenant_id, uf, data_base, tipo_preco)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_composicoes (
      id_composicao BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      uf VARCHAR(2) NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      codigo_composicao VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS sinapi_composicoes_uk ON sinapi_composicoes (tenant_id, uf, data_base, codigo_composicao)`
  );
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_composicoes_idx ON sinapi_composicoes (tenant_id, uf, data_base)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_composicoes_itens (
      id_item BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      uf VARCHAR(2) NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      codigo_composicao VARCHAR(80) NOT NULL,
      tipo_item VARCHAR(32) NOT NULL DEFAULT 'INSUMO',
      codigo_item VARCHAR(80) NOT NULL,
      coeficiente NUMERIC(14,6) NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS sinapi_composicoes_itens_uk ON sinapi_composicoes_itens (tenant_id, uf, data_base, codigo_composicao, tipo_item, codigo_item)`
  );
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_composicoes_itens_idx ON sinapi_composicoes_itens (tenant_id, uf, data_base, codigo_composicao)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_servicos_base (
      id_serv_sinapi BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      codigo_servico VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS sinapi_servicos_base_uk ON sinapi_servicos_base (tenant_id, data_base, codigo_servico)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_servicos_base_idx ON sinapi_servicos_base (tenant_id, data_base)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_insumos_base (
      id_insumo_sinapi BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      tipo_preco VARCHAR(3) NOT NULL,
      classificacao VARCHAR(80) NULL,
      codigo_insumo VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS sinapi_insumos_base_uk ON sinapi_insumos_base (tenant_id, data_base, tipo_preco, codigo_insumo)`
  );
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_insumos_base_idx ON sinapi_insumos_base (tenant_id, data_base, tipo_preco)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_insumos_pu (
      id_pu BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      id_insumo_sinapi BIGINT NOT NULL REFERENCES sinapi_insumos_base(id_insumo_sinapi) ON DELETE CASCADE,
      uf VARCHAR(2) NOT NULL,
      pu NUMERIC(14,6) NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS sinapi_insumos_pu_uk ON sinapi_insumos_pu (tenant_id, id_insumo_sinapi, uf)`);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_insumos_pu_idx ON sinapi_insumos_pu (tenant_id, uf)`);

  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sinapi_composicoes_base (
      id_compo_sinapi BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      uf VARCHAR(2) NOT NULL,
      data_base VARCHAR(16) NOT NULL DEFAULT '',
      tipo_preco VARCHAR(3) NOT NULL,
      id_serv_sinapi BIGINT NOT NULL REFERENCES sinapi_servicos_base(id_serv_sinapi) ON DELETE CASCADE,
      id_insumo_sinapi BIGINT NULL REFERENCES sinapi_insumos_base(id_insumo_sinapi) ON DELETE SET NULL,
      id_pu BIGINT NULL REFERENCES sinapi_insumos_pu(id_pu) ON DELETE SET NULL,
      tipo_item VARCHAR(32) NOT NULL,
      codigo_item VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NULL,
      und VARCHAR(40) NULL,
      coeficiente NUMERIC(14,6) NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tx.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS sinapi_composicoes_base_uk ON sinapi_composicoes_base (tenant_id, uf, data_base, tipo_preco, id_serv_sinapi, tipo_item, codigo_item)`
  );
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sinapi_composicoes_base_idx ON sinapi_composicoes_base (tenant_id, uf, data_base, tipo_preco, id_serv_sinapi)`);
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

    await ensureEmpresaDocumentosLayoutTables(prisma);
    const layoutRows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        logo_data_url AS "logoDataUrl",
        COALESCE(cabecalho_html, cabecalho_texto) AS "cabecalhoHtml",
        COALESCE(rodape_html, rodape_texto) AS "rodapeHtml",
        cabecalho_altura_mm AS "cabecalhoAlturaMm",
        rodape_altura_mm AS "rodapeAlturaMm",
        atualizado_em AS "atualizadoEm"
      FROM empresa_documentos_layout
      WHERE tenant_id = $1
      LIMIT 1
      `,
      ctx.tenantId
    )) as any[];
    const layout = layoutRows && layoutRows.length
      ? {
          logoDataUrl: layoutRows[0].logoDataUrl ? String(layoutRows[0].logoDataUrl) : null,
          cabecalhoHtml: layoutRows[0].cabecalhoHtml ? String(layoutRows[0].cabecalhoHtml) : null,
          rodapeHtml: layoutRows[0].rodapeHtml ? String(layoutRows[0].rodapeHtml) : null,
          cabecalhoAlturaMm: layoutRows[0].cabecalhoAlturaMm == null ? null : Number(layoutRows[0].cabecalhoAlturaMm),
          rodapeAlturaMm: layoutRows[0].rodapeAlturaMm == null ? null : Number(layoutRows[0].rodapeAlturaMm),
          atualizadoEm: layoutRows[0].atualizadoEm ? new Date(layoutRows[0].atualizadoEm).toISOString() : null,
        }
      : { logoDataUrl: null, cabecalhoHtml: null, rodapeHtml: null, cabecalhoAlturaMm: null, rodapeAlturaMm: null, atualizadoEm: null };

    return ok(reply, {
      representante: safeRepresentative,
      encarregadoSistema: encarregadoData,
      ceo: ceoTitular ? { roleCode: 'CEO', idFuncionario: ceoTitular.funcionarioId, nome: ceoTitular.funcionario.nomeCompleto } : null,
      gerenteRh: rhTitular ? { roleCode: 'GERENTE_RH', idFuncionario: rhTitular.funcionarioId, nome: rhTitular.funcionario.nomeCompleto } : null,
      documentosLayout: layout,
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
    '/empresa/documentos-layout',
    {
      schema: {
        body: z.object({
          logoDataUrl: z.string().optional().nullable(),
          cabecalhoHtml: z.string().optional().nullable(),
          rodapeHtml: z.string().optional().nullable(),
          cabecalhoAlturaMm: z.coerce.number().optional().nullable(),
          rodapeAlturaMm: z.coerce.number().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRepresentative(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const body = request.body as any;
      const logoDataUrl = body.logoDataUrl == null ? null : String(body.logoDataUrl || '').trim();
      const cabecalhoHtml = body.cabecalhoHtml == null ? null : String(body.cabecalhoHtml || '');
      const rodapeHtml = body.rodapeHtml == null ? null : String(body.rodapeHtml || '');
      const cabecalhoAlturaMm = body.cabecalhoAlturaMm == null ? null : Number(body.cabecalhoAlturaMm);
      const rodapeAlturaMm = body.rodapeAlturaMm == null ? null : Number(body.rodapeAlturaMm);

      if (logoDataUrl) {
        if (!logoDataUrl.startsWith('data:image/')) return fail(reply, 422, 'Logo inválida. Envie uma imagem (data:image/...).');
        if (logoDataUrl.length > 800_000) return fail(reply, 422, 'Logo muito grande. Use uma imagem menor.');
      }
      if (cabecalhoHtml && cabecalhoHtml.length > 20000) return fail(reply, 422, 'Cabeçalho muito grande.');
      if (rodapeHtml && rodapeHtml.length > 20000) return fail(reply, 422, 'Rodapé muito grande.');
      if (cabecalhoAlturaMm != null && (!Number.isFinite(cabecalhoAlturaMm) || cabecalhoAlturaMm < 0 || cabecalhoAlturaMm > 80)) return fail(reply, 422, 'Altura do cabeçalho inválida.');
      if (rodapeAlturaMm != null && (!Number.isFinite(rodapeAlturaMm) || rodapeAlturaMm < 0 || rodapeAlturaMm > 80)) return fail(reply, 422, 'Altura do rodapé inválida.');

      await ensureEmpresaDocumentosLayoutTables(prisma);
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO empresa_documentos_layout (tenant_id, logo_data_url, cabecalho_html, rodape_html, cabecalho_altura_mm, rodape_altura_mm, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (tenant_id)
        DO UPDATE SET
          logo_data_url = EXCLUDED.logo_data_url,
          cabecalho_html = EXCLUDED.cabecalho_html,
          rodape_html = EXCLUDED.rodape_html,
          cabecalho_altura_mm = EXCLUDED.cabecalho_altura_mm,
          rodape_altura_mm = EXCLUDED.rodape_altura_mm,
          atualizado_em = NOW()
        `,
        ctx.tenantId,
        logoDataUrl,
        cabecalhoHtml,
        rodapeHtml,
        cabecalhoAlturaMm,
        rodapeAlturaMm
      );

      await audit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        entidade: 'empresa_documentos_layout',
        idRegistro: String(ctx.tenantId),
        acao: 'UPDATE',
        dadosNovos: { logo: Boolean(logoDataUrl), cabecalho: Boolean(cabecalhoHtml), rodape: Boolean(rodapeHtml) } as any,
      });

      return ok(reply, { ok: true }, { message: 'Layout de documentos atualizado' });
    }
  );

  server.get('/empresa/documentos-layout', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    await ensureEmpresaDocumentosLayoutTables(prisma);
    const layoutRows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        logo_data_url AS "logoDataUrl",
        COALESCE(cabecalho_html, cabecalho_texto) AS "cabecalhoHtml",
        COALESCE(rodape_html, rodape_texto) AS "rodapeHtml",
        cabecalho_altura_mm AS "cabecalhoAlturaMm",
        rodape_altura_mm AS "rodapeAlturaMm",
        atualizado_em AS "atualizadoEm"
      FROM empresa_documentos_layout
      WHERE tenant_id = $1
      LIMIT 1
      `,
      ctx.tenantId
    )) as any[];

    const layout = layoutRows && layoutRows.length
      ? {
          logoDataUrl: layoutRows[0].logoDataUrl ? String(layoutRows[0].logoDataUrl) : null,
          cabecalhoHtml: layoutRows[0].cabecalhoHtml ? String(layoutRows[0].cabecalhoHtml) : null,
          rodapeHtml: layoutRows[0].rodapeHtml ? String(layoutRows[0].rodapeHtml) : null,
          cabecalhoAlturaMm: layoutRows[0].cabecalhoAlturaMm == null ? null : Number(layoutRows[0].cabecalhoAlturaMm),
          rodapeAlturaMm: layoutRows[0].rodapeAlturaMm == null ? null : Number(layoutRows[0].rodapeAlturaMm),
          atualizadoEm: layoutRows[0].atualizadoEm ? new Date(layoutRows[0].atualizadoEm).toISOString() : null,
        }
      : { logoDataUrl: null, cabecalhoHtml: null, rodapeHtml: null, cabecalhoAlturaMm: null, rodapeAlturaMm: null, atualizadoEm: null };

    return ok(reply, { documentosLayout: layout });
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

  server.get('/engenharia/obras/lista', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const scope = (request.user as any)?.abrangencia as any;
    const obraIds = !scope || scope.empresa ? null : Array.isArray(scope.obras) ? scope.obras.filter((x: any) => Number.isFinite(Number(x))) : [];

    const where: any = { tenantId: ctx.tenantId };
    if (obraIds && obraIds.length > 0) where.id = { in: obraIds.map((x: any) => Number(x)) };
    if (obraIds && obraIds.length === 0) where.id = { in: [-1] };

    const rows = await prisma.obra.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, name: true, contrato: { select: { numeroContrato: true } } },
      take: 500,
    });

    return ok(
      reply,
      {
        rows: (rows || []).map((r: any) => ({
          idObra: r?.id == null ? 0 : Number(r.id),
          nomeObra: String(r?.name || '') || `Obra #${r?.id == null ? '' : String(r.id)}`,
          numeroContrato: r?.contrato?.numeroContrato == null ? null : String(r.contrato.numeroContrato || ''),
        })),
      },
      { message: 'Obras' }
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

      const obra = await prisma.obra
        .findFirst({
          where: { tenantId: ctx.tenantId, id: idObra },
          select: { id: true, status: true, name: true, type: true, valorPrevisto: true, contratoId: true, contrato: { select: { id: true, numeroContrato: true } } },
        })
        .catch(() => null);
      if (!obra) return fail(reply, 404, 'Obra não encontrada');

      await ensurePlanilhaOrcamentariaTables(prisma);

      const obraStatus = obra.status ? String(obra.status) : null;
      const obraResumo = {
        idObra: obra.id,
        nome: obra.name ?? null,
        status: obraStatus,
        tipo: obra.type ? String(obra.type) : null,
        contratoId: obra.contratoId ?? (obra.contrato?.id ?? null),
        contratoNumero: obra.contrato?.numeroContrato ? String(obra.contrato.numeroContrato) : null,
        valorPrevisto: obra.valorPrevisto == null ? null : Number(obra.valorPrevisto),
      };

      if (view === 'versoes') {
        const rows = (await prisma.$queryRawUnsafe(
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
        )) as any[];

        return ok(reply, {
          idObra,
          obraStatus,
          obra: obraResumo,
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
        const rows = (await prisma.$queryRawUnsafe(
          `
          SELECT id_planilha AS "idPlanilha"
          FROM obras_planilhas_versoes
          WHERE tenant_id = $1 AND id_obra = $2 AND atual = TRUE
          ORDER BY numero_versao DESC, id_planilha DESC
          LIMIT 1
          `,
          ctx.tenantId,
          idObra
        )) as any[];
        idPlanilha = rows?.[0]?.idPlanilha ? Number(rows[0].idPlanilha) : null;
      }

      if (!idPlanilha) return ok(reply, { idObra, obraStatus, obra: obraResumo, planilha: null });

      const versoes = (await prisma.$queryRawUnsafe(
        `
        SELECT
          id_planilha AS "idPlanilha",
          numero_versao AS "numeroVersao",
          nome,
          atual,
          origem,
          data_base_sbc AS "dataBaseSbc",
          data_base_sinapi AS "dataBaseSinapi",
          uf_sinapi AS "ufSinapi",
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
      )) as any[];
      const v = versoes?.[0] || null;
      if (!v) return ok(reply, { idObra, obraStatus, obra: obraResumo, planilha: null });

      const linhas = (await prisma.$queryRawUnsafe(
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
      )) as any[];

      return ok(reply, {
        idObra,
        obraStatus,
        obra: obraResumo,
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
            ufSinapi: v.ufSinapi ? String(v.ufSinapi) : null,
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

      const obra = await prisma.obra
        .findFirst({
          where: { tenantId: ctx.tenantId, id: idObra },
          select: { id: true, status: true, name: true, type: true, valorPrevisto: true, contratoId: true, contrato: { select: { id: true, numeroContrato: true } } },
        })
        .catch(() => null);
      if (!obra) return fail(reply, 404, 'Obra não encontrada');

      await ensurePlanilhaOrcamentariaTables(prisma);

      const obraStatus = obra.status ? String(obra.status) : null;
      const obraResumo = {
        idObra: obra.id,
        nome: obra.name ?? null,
        status: obraStatus,
        tipo: obra.type ? String(obra.type) : null,
        contratoId: obra.contratoId ?? (obra.contrato?.id ?? null),
        contratoNumero: obra.contrato?.numeroContrato ? String(obra.contrato.numeroContrato) : null,
        valorPrevisto: obra.valorPrevisto == null ? null : Number(obra.valorPrevisto),
      };

      const isMultipart = typeof (request as any).isMultipart === 'function' ? (request as any).isMultipart() : false;

      if (isMultipart) {
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

        let csvText = decodeCsvBuffer(fileBuffer);
        csvText = csvText.replace(/^\uFEFF/, '');
        const { headers, rows } = parseCsvTextAuto(csvText);
        if (!headers.length || !rows.length) return fail(reply, 422, 'CSV vazio ou inválido');

        const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
        const get = (r: string[], key: string) => String(r[idx[key]] ?? '').trim();

        const required = ['item', 'codigo', 'fonte', 'servicos', 'und', 'quant', 'valor_unitario'];
        const missing = required.filter((k) => idx[k] == null);
        if (missing.length) return fail(reply, 422, `Colunas obrigatórias ausentes no CSV: ${missing.join(', ')}`);

        const prepared = rows.map((r, i) => {
          const item = get(r, 'item');
          const codigo = get(r, 'codigo');
          const fonte = get(r, 'fonte');
          const servicos = get(r, 'servicos');
          const und = get(r, 'und');
          const quant = get(r, 'quant');
          const valorUnit = get(r, 'valor_unitario');
          const det = detectTipoLinha(item, und, quant, valorUnit);
          const quantidade = toDec(quant);
          const vUnit = toDec(valorUnit);
          const valorParcialCalc = quantidade != null && vUnit != null ? Number((quantidade * vUnit).toFixed(6)) : null;

          if (!item.trim()) return { ok: false as const, rowIndex: i, message: 'Campo "item" é obrigatório', field: 'item' as const };
          if (!servicos.trim()) return { ok: false as const, rowIndex: i, message: 'Campo "servicos" é obrigatório', field: 'servicos' as const };

          if (det.tipo === 'SERVICO') {
            if (!codigo.trim()) return { ok: false as const, rowIndex: i, message: 'Campo "codigo" é obrigatório para serviço', field: 'codigo' as const };
            if (!und.trim()) return { ok: false as const, rowIndex: i, message: 'Campo "und" é obrigatório para serviço', field: 'und' as const };
            if (quantidade == null || !(quantidade > 0)) return { ok: false as const, rowIndex: i, message: 'Campo "quant" inválido para serviço', field: 'quant' as const };
            if (vUnit == null || !(vUnit >= 0)) return { ok: false as const, rowIndex: i, message: 'Campo "valor_unitario" inválido para serviço', field: 'valor_unitario' as const };
          }

          return {
            ok: true as const,
            ordem: i + 1,
            item: item ? String(item).slice(0, 80) : null,
            codigo: codigo ? String(codigo).slice(0, 80) : null,
            fonte: fonte ? String(fonte).slice(0, 80) : null,
            servico: servicos ? String(servicos).slice(0, 800) : null,
            und: und ? String(und).slice(0, 40) : null,
            quantidade: quantidade == null ? null : quantidade,
            valorUnitario: vUnit == null ? null : vUnit,
            valorParcial: valorParcialCalc,
            nivel: det.nivel,
            tipoLinha: det.tipo,
          };
        });

        const invalid = prepared.find((p) => !p.ok);
        if (invalid && !invalid.ok) {
          return fail(reply, 422, `Erro no CSV (linha ${invalid.rowIndex + 2}): ${invalid.message}`);
        }

        const preparedOk = prepared.filter((p): p is Extract<(typeof prepared)[number], { ok: true }> => p.ok);

        const created = await prisma.$transaction(async (tx: any) => {
          const maxRows = (await tx.$queryRawUnsafe(
            `SELECT COALESCE(MAX(numero_versao),0) AS "maxVersao" FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2`,
            ctx.tenantId,
            idObra
          )) as any[];
          const nextVersao = Number(maxRows?.[0]?.maxVersao || 0) + 1;
          const nomeFinal = String(nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;

          const ins = (await tx.$queryRawUnsafe(
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
          )) as any[];
          const idPlanilha = Number(ins?.[0]?.idPlanilha || 0);
          await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
          await tx.$executeRawUnsafe(
            `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );

          const chunkSize = 600;
          for (let start = 0; start < preparedOk.length; start += chunkSize) {
            const chunk = preparedOk.slice(start, start + chunkSize);
            const params: any[] = [];
            let p = 1;
            const values = chunk
              .map((r) => {
                const base = [
                  ctx.tenantId,
                  idPlanilha,
                  r.ordem,
                  r.item,
                  r.codigo,
                  r.fonte,
                  r.servico,
                  r.und,
                  r.quantidade,
                  r.valorUnitario,
                  r.valorParcial,
                  r.nivel,
                  r.tipoLinha,
                ];
                for (const v of base) params.push(v);
                const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
                return `(${placeholders})`;
              })
              .join(',');

            await tx.$executeRawUnsafe(
              `
              INSERT INTO obras_planilhas_linhas
                (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
              VALUES
                ${values}
              `,
              ...params
            );
          }

          return { idPlanilha, numeroVersao: nextVersao };
        }, { timeout: 120000, maxWait: 20000 });

        return ok(reply, { idObra, idPlanilha: created.idPlanilha, numeroVersao: created.numeroVersao }, { message: 'CSV importado' });
      }

      const body = (request.body || {}) as any;
      const action = String(body.action || '').trim().toUpperCase();

      if (action === 'DUPLICAR_VERSAO') {
        const created = await prisma.$transaction(async (tx: any) => {
          const sourcePlanilhaId = body.sourcePlanilhaId != null ? Number(body.sourcePlanilhaId) : NaN;
          if (!Number.isFinite(sourcePlanilhaId) || sourcePlanilhaId <= 0) throw new Error('sourcePlanilhaId inválido');

          const src = (await tx.$queryRawUnsafe(
            `
            SELECT
              id_planilha AS "idPlanilha",
              numero_versao AS "numeroVersao",
              nome AS "nome",
              origem AS "origem",
              data_base_sbc AS "dataBaseSbc",
              data_base_sinapi AS "dataBaseSinapi",
              uf_sinapi AS "ufSinapi",
              bdi_servicos_sbc AS "bdiServicosSbc",
              bdi_servicos_sinapi AS "bdiServicosSinapi",
              bdi_diferenciado_sbc AS "bdiDiferenciadoSbc",
              bdi_diferenciado_sinapi AS "bdiDiferenciadoSinapi",
              enc_sociais_sem_des_sbc AS "encSociaisSemDesSbc",
              enc_sociais_sem_des_sinapi AS "encSociaisSemDesSinapi",
              desconto_sbc AS "descontoSbc",
              desconto_sinapi AS "descontoSinapi"
            FROM obras_planilhas_versoes
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
            LIMIT 1
            `,
            ctx.tenantId,
            idObra,
            sourcePlanilhaId
          )) as any[];
          const srcRow = src?.[0] || null;
          if (!srcRow) throw new Error('Planilha origem não encontrada');

          await ensurePlanilhaComposicaoTables(tx);
          await ensureInsumosPrecosTables(tx);

          const maxRows = (await tx.$queryRawUnsafe(
            `SELECT COALESCE(MAX(numero_versao),0) AS "maxVersao" FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2`,
            ctx.tenantId,
            idObra
          )) as any[];
          const nextVersao = Number(maxRows?.[0]?.maxVersao || 0) + 1;
          const nome = String(body.nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;

          const ins = (await tx.$queryRawUnsafe(
            `
            INSERT INTO obras_planilhas_versoes
              (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador,
               data_base_sbc, data_base_sinapi, uf_sinapi,
               bdi_servicos_sbc, bdi_servicos_sinapi, bdi_diferenciado_sbc, bdi_diferenciado_sinapi,
               enc_sociais_sem_des_sbc, enc_sociais_sem_des_sinapi, desconto_sbc, desconto_sinapi)
            VALUES
              ($1,$2,$3,$4,TRUE,'DUPLICADA',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING id_planilha AS "idPlanilha"
            `,
            ctx.tenantId,
            idObra,
            nextVersao,
            nome,
            ctx.userId,
            srcRow.dataBaseSbc,
            srcRow.dataBaseSinapi,
            srcRow.ufSinapi,
            srcRow.bdiServicosSbc,
            srcRow.bdiServicosSinapi,
            srcRow.bdiDiferenciadoSbc,
            srcRow.bdiDiferenciadoSinapi,
            srcRow.encSociaisSemDesSbc,
            srcRow.encSociaisSemDesSinapi,
            srcRow.descontoSbc,
            srcRow.descontoSinapi
          )) as any[];
          const idPlanilha = Number(ins?.[0]?.idPlanilha || 0);

          await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
          await tx.$executeRawUnsafe(
            `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );

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
            sourcePlanilhaId
          );

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_composicoes_itens
              (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
            SELECT
              tenant_id, id_obra, $3 AS id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo
            FROM obras_planilhas_composicoes_itens
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $4
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            sourcePlanilhaId
          );

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_insumos_precos
              (tenant_id, id_obra, id_planilha, codigo_item, valor_unitario)
            SELECT
              tenant_id, id_obra, $3 AS id_planilha, codigo_item, valor_unitario
            FROM obras_insumos_precos
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $4
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            sourcePlanilhaId
          );

          const primitivaExists = (await tx.$queryRawUnsafe(`SELECT to_regclass(current_schema() || '.obras_planilhas_composicoes_primitivas') AS "t"`)) as any[];
          const hasPrimitivaTable = Boolean(primitivaExists?.[0]?.t);
          if (hasPrimitivaTable) {
            await tx.$executeRawUnsafe(
              `
              INSERT INTO obras_planilhas_composicoes_primitivas
                (tenant_id, id_obra, id_planilha, codigo_servico, descricao_servico, und_servico, itens_json, atualizado_em)
              SELECT
                tenant_id, id_obra, $3 AS id_planilha, codigo_servico, descricao_servico, und_servico, itens_json, atualizado_em
              FROM obras_planilhas_composicoes_primitivas
              WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $4
              `,
              ctx.tenantId,
              idObra,
              idPlanilha,
              sourcePlanilhaId
            );
          }

          return { idPlanilha, numeroVersao: nextVersao };
        });

        return ok(reply, { idObra, idPlanilha: created.idPlanilha, numeroVersao: created.numeroVersao }, { message: 'Planilha duplicada' });
      }

      if (action === 'NOVA_VERSAO') {
        const created = await prisma.$transaction(async (tx: any) => {
          const maxRows = (await tx.$queryRawUnsafe(
            `SELECT COALESCE(MAX(numero_versao),0) AS "maxVersao" FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2`,
            ctx.tenantId,
            idObra
          )) as any[];
          const nextVersao = Number(maxRows?.[0]?.maxVersao || 0) + 1;
          const nome = String(body.nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;
          const copyFrom = body.copyFromPlanilhaId != null ? Number(body.copyFromPlanilhaId) : null;

          const ins = (await tx.$queryRawUnsafe(
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
          )) as any[];
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

      if (action === 'EDITAR_VERSAO') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');
        const numeroVersao = body.numeroVersao != null && String(body.numeroVersao).trim() !== '' ? Number(body.numeroVersao) : null;
        const nome = body.nome != null ? String(body.nome).trim().slice(0, 120) : null;
        const origem = body.origem != null ? String(body.origem).trim().toUpperCase() : null;
        const allowedOrigem = new Set(['MANUAL', 'CSV', 'MIGRACAO', 'DUPLICADA']);
        if (origem != null && !allowedOrigem.has(origem)) return fail(reply, 422, 'origem inválida');
        if (numeroVersao != null && (!Number.isFinite(numeroVersao) || numeroVersao <= 0 || Math.floor(numeroVersao) !== numeroVersao)) {
          return fail(reply, 422, 'numeroVersao inválido');
        }
        if (nome != null && !nome) return fail(reply, 422, 'nome inválido');
        if (numeroVersao == null && nome == null && origem == null) return ok(reply, { ok: true }, { message: 'Nada para alterar' });

        const updated = await prisma.$transaction(async (tx: any) => {
          const exists = (await tx.$queryRawUnsafe(
            `
            SELECT id_planilha AS "idPlanilha"
            FROM obras_planilhas_versoes
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
            LIMIT 1
            `,
            ctx.tenantId,
            idObra,
            idPlanilha
          )) as any[];
          if (!exists?.[0]) throw new Error('Planilha não encontrada');

          if (numeroVersao != null) {
            const dup = (await tx.$queryRawUnsafe(
              `
              SELECT 1
              FROM obras_planilhas_versoes
              WHERE tenant_id = $1 AND id_obra = $2 AND numero_versao = $3 AND id_planilha <> $4
              LIMIT 1
              `,
              ctx.tenantId,
              idObra,
              numeroVersao,
              idPlanilha
            )) as any[];
            if (dup?.[0]) throw new Error('Já existe uma versão com esse número');
          }

          await tx.$executeRawUnsafe(
            `
            UPDATE obras_planilhas_versoes
            SET
              numero_versao = COALESCE($4, numero_versao),
              nome = COALESCE($5, nome),
              origem = COALESCE($6, origem),
              atualizado_em = NOW()
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            numeroVersao,
            nome,
            origem
          );
          return { ok: true };
        });

        return ok(reply, updated, { message: 'Versão atualizada' });
      }

      if (action === 'DEFINIR_ATUAL') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');

        const res = await prisma.$transaction(async (tx: any) => {
          const exists = (await tx.$queryRawUnsafe(
            `
            SELECT id_planilha AS "idPlanilha"
            FROM obras_planilhas_versoes
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
            LIMIT 1
            `,
            ctx.tenantId,
            idObra,
            idPlanilha
          )) as any[];
          if (!exists?.[0]) throw new Error('Planilha não encontrada');

          await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
          await tx.$executeRawUnsafe(
            `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );
          return { idPlanilhaAtual: idPlanilha };
        });

        return ok(reply, res, { message: 'Planilha definida como atual' });
      }

      if (action === 'EXCLUIR_PLANILHA') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');

        const res = await prisma.$transaction(async (tx: any) => {
          await ensurePlanilhaComposicaoTables(tx);
          await ensureInsumosPrecosTables(tx);

          const exists = (await tx.$queryRawUnsafe(
            `
            SELECT atual
            FROM obras_planilhas_versoes
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
            LIMIT 1
            `,
            ctx.tenantId,
            idObra,
            idPlanilha
          )) as any[];
          const row = exists?.[0] || null;
          if (!row) throw new Error('Planilha não encontrada');

          await tx.$executeRawUnsafe(`DELETE FROM obras_planilhas_linhas WHERE tenant_id = $1 AND id_planilha = $2`, ctx.tenantId, idPlanilha);
          await tx.$executeRawUnsafe(
            `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );
          await tx.$executeRawUnsafe(`DELETE FROM obras_insumos_precos WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`, ctx.tenantId, idObra, idPlanilha);

          const primitivaExists = (await tx.$queryRawUnsafe(`SELECT to_regclass(current_schema() || '.obras_planilhas_composicoes_primitivas') AS "t"`)) as any[];
          const hasPrimitivaTable = Boolean(primitivaExists?.[0]?.t);
          if (hasPrimitivaTable) {
            await tx.$executeRawUnsafe(
              `DELETE FROM obras_planilhas_composicoes_primitivas WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
              ctx.tenantId,
              idObra,
              idPlanilha
            );
          }

          await tx.$executeRawUnsafe(
            `DELETE FROM obras_planilhas_versoes WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
            ctx.tenantId,
            idObra,
            idPlanilha
          );

          const remaining = (await tx.$queryRawUnsafe(
            `
            SELECT id_planilha AS "idPlanilha"
            FROM obras_planilhas_versoes
            WHERE tenant_id = $1 AND id_obra = $2
            ORDER BY atual DESC, numero_versao DESC, id_planilha DESC
            LIMIT 1
            `,
            ctx.tenantId,
            idObra
          )) as any[];
          const nextId = remaining?.[0]?.idPlanilha ? Number(remaining[0].idPlanilha) : null;
          if (nextId) {
            await tx.$executeRawUnsafe(`UPDATE obras_planilhas_versoes SET atual = FALSE WHERE tenant_id = $1 AND id_obra = $2`, ctx.tenantId, idObra);
            await tx.$executeRawUnsafe(
              `UPDATE obras_planilhas_versoes SET atual = TRUE WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3`,
              ctx.tenantId,
              idObra,
              nextId
            );
          }

          return { ok: true, idPlanilhaAtual: nextId };
        });

        return ok(reply, res, { message: 'Planilha excluída' });
      }

      if (action === 'ATUALIZAR_PARAMETROS') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');
        const p = (body.parametros || {}) as any;
        const dataBaseSbc = p.dataBaseSbc ? String(p.dataBaseSbc).trim().slice(0, 16) : null;
        const dataBaseSinapi = p.dataBaseSinapi ? String(p.dataBaseSinapi).trim().slice(0, 16) : null;
        const ufSinapi = p.ufSinapi ? String(p.ufSinapi).trim().toUpperCase().slice(0, 2) : null;

        await prisma.$executeRawUnsafe(
          `
          UPDATE obras_planilhas_versoes
          SET
            data_base_sbc = $4,
            data_base_sinapi = $5,
            uf_sinapi = $6,
            bdi_servicos_sbc = $7,
            bdi_servicos_sinapi = $8,
            bdi_diferenciado_sbc = $9,
            bdi_diferenciado_sinapi = $10,
            enc_sociais_sem_des_sbc = $11,
            enc_sociais_sem_des_sinapi = $12,
            desconto_sbc = $13,
            desconto_sinapi = $14,
            atualizado_em = NOW()
          WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
          `,
          ctx.tenantId,
          idObra,
          idPlanilha,
          dataBaseSbc,
          dataBaseSinapi,
          ufSinapi,
          p.bdiServicosSbc == null || p.bdiServicosSbc === '' ? null : toDec(p.bdiServicosSbc),
          p.bdiServicosSinapi == null || p.bdiServicosSinapi === '' ? null : toDec(p.bdiServicosSinapi),
          p.bdiDiferenciadoSbc == null || p.bdiDiferenciadoSbc === '' ? null : toDec(p.bdiDiferenciadoSbc),
          p.bdiDiferenciadoSinapi == null || p.bdiDiferenciadoSinapi === '' ? null : toDec(p.bdiDiferenciadoSinapi),
          p.encSociaisSemDesSbc == null || p.encSociaisSemDesSbc === '' ? null : toDec(p.encSociaisSemDesSbc),
          p.encSociaisSemDesSinapi == null || p.encSociaisSemDesSinapi === '' ? null : toDec(p.encSociaisSemDesSinapi),
          p.descontoSbc == null || p.descontoSbc === '' ? null : toDec(p.descontoSbc),
          p.descontoSinapi == null || p.descontoSinapi === '' ? null : toDec(p.descontoSinapi)
        );

        return ok(reply, { idObra, obraStatus, obra: obraResumo }, { message: 'Parâmetros atualizados' });
      }

      if (action === 'UPSERT_LINHA') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');
        const linha = (body.linha || {}) as any;
        const idLinha = linha.idLinha != null && String(linha.idLinha) !== '' ? Number(linha.idLinha) : null;
        const ordem = linha.ordem != null ? Number(linha.ordem) : 0;
        const item = linha.item ? String(linha.item).trim().slice(0, 80) : null;
        const codigo = linha.codigo ? String(linha.codigo).trim().slice(0, 80) : null;
        const fonte = linha.fonte ? String(linha.fonte).trim().slice(0, 80) : null;
        const servico = linha.servicos ? String(linha.servicos).trim().slice(0, 800) : null;
        const und = linha.und ? String(linha.und).trim().slice(0, 40) : null;
        const quantidade = linha.quant == null || linha.quant === '' ? null : toDec(linha.quant);
        const tipoLinha = String(linha.tipoLinha || '').trim().toUpperCase() || 'ITEM';
        const nivel = item ? item.split('.').filter(Boolean).length : 0;

        let valorUnitario = linha.valorUnitario == null || linha.valorUnitario === '' ? null : toDec(linha.valorUnitario);
        let valorParcialBody = linha.valorParcial == null || linha.valorParcial === '' ? null : toDec(linha.valorParcial);
        let valorParcial =
          valorParcialBody != null ? valorParcialBody : quantidade != null && valorUnitario != null ? Number((quantidade * valorUnitario).toFixed(6)) : null;

        if (tipoLinha === 'SERVICO' && codigo) {
          await ensurePlanilhaComposicaoTables(prisma);
          const rows = (await prisma.$queryRawUnsafe(
            `
            WITH planilha_params AS (
              SELECT
                COALESCE(bdi_servicos_sinapi, bdi_servicos_sbc, 0) AS bdi,
                COALESCE(enc_sociais_sem_des_sinapi, enc_sociais_sem_des_sbc, 0) AS ls
              FROM obras_planilhas_versoes
              WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
              LIMIT 1
            ),
            comp AS (
              SELECT
                COUNT(*) AS qtd,
                SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')) AS total_base,
                SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') = 'MAO_DE_OBRA') AS total_mao_base
              FROM obras_planilhas_composicoes_itens
              WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(COALESCE(codigo_servico,'')) = $4
            )
            SELECT
              (SELECT bdi FROM planilha_params) AS bdi,
              (SELECT ls FROM planilha_params) AS ls,
              (SELECT qtd FROM comp) AS qtd,
              (SELECT total_base FROM comp) AS total_base,
              (SELECT total_mao_base FROM comp) AS total_mao_base
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            String(codigo || '').trim().toUpperCase()
          )) as any[];

          const row = rows?.[0] || null;
          const hasComposicao = Number(row?.qtd || 0) > 0;
          if (!hasComposicao) {
            valorUnitario = toDec(0);
          } else {
            const totalBase = row?.total_base == null ? 0 : Number(row.total_base);
            const totalMaoBase = row?.total_mao_base == null ? 0 : Number(row.total_mao_base);
            const lsPercent = row?.ls == null ? 0 : Number(row.ls);
            const bdiPercent = row?.bdi == null ? 0 : Number(row.bdi);
            const totalComLS = (totalBase - totalMaoBase) + totalMaoBase * (1 + (lsPercent || 0) / 100);
            const totalComLSComBDI = totalComLS * (1 + (bdiPercent || 0) / 100);
            valorUnitario = toDec(Number(totalComLSComBDI.toFixed(6)));
          }
          valorParcial = quantidade != null && valorUnitario != null ? Number((Number(quantidade) * Number(valorUnitario)).toFixed(6)) : null;
          valorParcialBody = null;
        }

        if (idLinha && Number.isFinite(idLinha) && idLinha > 0) {
          await prisma.$executeRawUnsafe(
            `
            UPDATE obras_planilhas_linhas
            SET
              ordem = $4,
              item = $5,
              codigo = $6,
              fonte = $7,
              servico = $8,
              und = $9,
              quantidade = $10,
              valor_unitario = $11,
              valor_parcial = $12,
              nivel = $13,
              tipo_linha = $14,
              atualizado_em = NOW()
            WHERE tenant_id = $1 AND id_planilha = $2 AND id_linha = $3
            `,
            ctx.tenantId,
            idPlanilha,
            idLinha,
            ordem,
            item,
            codigo,
            fonte,
            servico,
            und,
            quantidade,
            valorUnitario,
            valorParcial,
            nivel,
            tipoLinha
          );
        } else {
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_linhas
              (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
            VALUES
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            `,
            ctx.tenantId,
            idPlanilha,
            ordem,
            item,
            codigo,
            fonte,
            servico,
            und,
            quantidade,
            valorUnitario,
            valorParcial,
            nivel,
            tipoLinha
          );
        }

        return ok(reply, { ok: true }, { message: 'Linha salva' });
      }

      if (action === 'EXCLUIR_LINHA') {
        const idPlanilha = body.idPlanilha != null ? Number(body.idPlanilha) : NaN;
        const idLinha = body.idLinha != null ? Number(body.idLinha) : NaN;
        if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return fail(reply, 422, 'idPlanilha inválido');
        if (!Number.isFinite(idLinha) || idLinha <= 0) return fail(reply, 422, 'idLinha inválido');

        await prisma.$executeRawUnsafe(`DELETE FROM obras_planilhas_linhas WHERE tenant_id = $1 AND id_planilha = $2 AND id_linha = $3`, ctx.tenantId, idPlanilha, idLinha);
        return ok(reply, { ok: true }, { message: 'Linha excluída' });
      }

      return fail(reply, 422, 'Ação inválida');
    }
  );

  server.get('/engenharia/obras/:id/planilha/servicos/:codigo/preco-unitario', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z
      .object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) })
      .parse(request.params || {});
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});
    const idObra = Number(id);
    const codigoServico = String(codigo || '').trim().toUpperCase();

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);

    const rows = (await prisma.$queryRawUnsafe(
      `
      WITH planilha_params AS (
        SELECT
          COALESCE(bdi_servicos_sinapi, bdi_servicos_sbc, 0) AS bdi,
          COALESCE(enc_sociais_sem_des_sinapi, enc_sociais_sem_des_sbc, 0) AS ls
        FROM obras_planilhas_versoes
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
        LIMIT 1
      ),
      comp AS (
        SELECT
          COUNT(*) AS qtd,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')) AS total_base,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') = 'MAO_DE_OBRA') AS total_mao_base
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(COALESCE(codigo_servico,'')) = $4
      )
      SELECT
        (SELECT bdi FROM planilha_params) AS bdi,
        (SELECT ls FROM planilha_params) AS ls,
        (SELECT qtd FROM comp) AS qtd,
        (SELECT total_base FROM comp) AS total_base,
        (SELECT total_mao_base FROM comp) AS total_mao_base
      `,
      ctx.tenantId,
      idObra,
      idPlanilha,
      codigoServico
    )) as any[];

    const row = rows?.[0] || null;
    const hasComposicao = Number(row?.qtd || 0) > 0;
    if (!hasComposicao) return ok(reply, { codigoServico, hasComposicao: false, valorUnitario: 0 });

    const totalBase = row?.total_base == null ? 0 : Number(row.total_base);
    const totalMaoBase = row?.total_mao_base == null ? 0 : Number(row.total_mao_base);
    const lsPercent = row?.ls == null ? 0 : Number(row.ls);
    const bdiPercent = row?.bdi == null ? 0 : Number(row.bdi);
    const totalComLS = (totalBase - totalMaoBase) + totalMaoBase * (1 + (lsPercent || 0) / 100);
    const totalComLSComBDI = totalComLS * (1 + (bdiPercent || 0) / 100);
    const valorUnitario = Number(totalComLSComBDI.toFixed(6));

    return ok(reply, { codigoServico, hasComposicao: true, valorUnitario });
  });

  server.get('/engenharia/obras/:id/planilha/sinapi/servicos/:codigo/meta', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z
      .object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) })
      .parse(request.params || {});
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});
    const idObra = Number(id);
    const codigoServico = String(codigo || '').trim().toUpperCase();

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensureSinapiBaseTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);

    const vers = (await prisma.$queryRawUnsafe(
      `
      SELECT data_base_sinapi AS "dataBaseSinapi"
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];
    const dataBaseSinapi = vers?.[0]?.dataBaseSinapi == null ? '' : String(vers[0].dataBaseSinapi || '').trim();

    let descricao: string | null = null;
    let und: string | null = null;
    let fonte: string | null = null;

    if (dataBaseSinapi) {
      const s = (await prisma.$queryRawUnsafe(
        `
        SELECT descricao, und
        FROM sinapi_servicos_base
        WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_servico) = $3
        ORDER BY id_serv_sinapi DESC
        LIMIT 1
        `,
        ctx.tenantId,
        dataBaseSinapi,
        codigoServico
      )) as any[];
      if (s?.[0]) {
        descricao = s[0].descricao == null ? null : String(s[0].descricao || '').trim();
        und = s[0].und == null ? null : String(s[0].und || '').trim();
        fonte = 'SINAPI';
      }
    }

    if (!descricao || !und) {
      const l = (await prisma.$queryRawUnsafe(
        `
        SELECT servico AS "servico", und AS "und"
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1 AND id_planilha = $2 AND tipo_linha = 'SERVICO' AND UPPER(COALESCE(codigo,'')) = $3
        ORDER BY id_linha DESC
        LIMIT 1
        `,
        ctx.tenantId,
        idPlanilha,
        codigoServico
      )) as any[];
      if (l?.[0]) {
        if (!descricao) descricao = l[0].servico == null ? null : String(l[0].servico || '').trim();
        if (!und) und = l[0].und == null ? null : String(l[0].und || '').trim();
        if (!fonte) fonte = 'PLANILHA';
      }
    }

    return ok(reply, { codigoServico, descricao, und, fonte, dataBaseSinapi: dataBaseSinapi || null });
  });

  server.get('/engenharia/obras/:id/planilha/sinapi/insumos/:codigo/meta', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z
      .object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) })
      .parse(request.params || {});
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});
    const idObra = Number(id);
    const codigoInsumo = String(codigo || '').trim().toUpperCase();

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensureSinapiBaseTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);

    const vers = (await prisma.$queryRawUnsafe(
      `
      SELECT data_base_sinapi AS "dataBaseSinapi"
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];
    const dataBaseSinapi = vers?.[0]?.dataBaseSinapi == null ? '' : String(vers[0].dataBaseSinapi || '').trim();

    let classificacao: string | null = null;
    let descricao: string | null = null;
    let und: string | null = null;
    let tipoPreco: string | null = null;
    let fonte: string | null = null;

    if (dataBaseSinapi) {
      const rows = (await prisma.$queryRawUnsafe(
        `
        SELECT classificacao, descricao, und, tipo_preco AS "tipoPreco"
        FROM sinapi_insumos_base
        WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_insumo) = $3 AND tipo_preco IN ('ISD','ICD','ISE')
        ORDER BY CASE tipo_preco WHEN 'ISD' THEN 1 WHEN 'ICD' THEN 2 ELSE 3 END, id_insumo_sinapi DESC
        LIMIT 1
        `,
        ctx.tenantId,
        dataBaseSinapi,
        codigoInsumo
      )) as any[];
      if (rows?.[0]) {
        classificacao = rows[0].classificacao == null ? null : String(rows[0].classificacao || '').trim();
        descricao = rows[0].descricao == null ? null : String(rows[0].descricao || '').trim();
        und = rows[0].und == null ? null : String(rows[0].und || '').trim();
        tipoPreco = rows[0].tipoPreco == null ? null : String(rows[0].tipoPreco || '').trim();
        fonte = 'SINAPI';
      }
    }

    if (!descricao || !und) {
      const rows = (await prisma.$queryRawUnsafe(
        `
        SELECT banco, descricao, und
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
          AND UPPER(COALESCE(codigo_item,'')) = $4
          AND UPPER(COALESCE(tipo_item,'')) NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
        ORDER BY id_item DESC
        LIMIT 1
        `,
        ctx.tenantId,
        idObra,
        idPlanilha,
        codigoInsumo
      )) as any[];
      if (rows?.[0]) {
        if (!descricao) descricao = rows[0].descricao == null ? null : String(rows[0].descricao || '').trim();
        if (!und) und = rows[0].und == null ? null : String(rows[0].und || '').trim();
        if (!fonte) fonte = rows[0].banco == null ? null : String(rows[0].banco || '').trim();
      }
    }

    return ok(reply, { codigoInsumo, classificacao, descricao, und, tipoPreco, fonte, dataBaseSinapi: dataBaseSinapi || null });
  });

  server.get('/engenharia/obras/:id/planilha/composicoes/status', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});
    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT UPPER(codigo_servico) AS "codigoServico"
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];
    return ok(reply, { codes: (rows || []).map((r: any) => String(r.codigoServico || '').trim()).filter(Boolean) });
  });

  server.get('/engenharia/obras/:id/planilha/composicoes/referencias', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});
    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    const rows = (await prisma.$queryRawUnsafe(
      `
      WITH refs AS (
        SELECT
          UPPER(COALESCE(codigo_item,'')) AS codigo,
          MAX(tipo_item) AS tipo
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1
          AND id_obra = $2
          AND id_planilha = $3
          AND COALESCE(tipo_item,'') IN ('COMPOSICAO', 'COMPOSICAO_AUXILIAR')
          AND COALESCE(codigo_item,'') <> ''
        GROUP BY UPPER(COALESCE(codigo_item,''))
      ),
      defs AS (
        SELECT DISTINCT UPPER(COALESCE(codigo_servico,'')) AS codigo
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND COALESCE(codigo_servico,'') <> ''
      )
      SELECT
        r.codigo AS "codigo",
        r.tipo AS "tipo",
        (d.codigo IS NOT NULL) AS "definida"
      FROM refs r
      LEFT JOIN defs d ON d.codigo = r.codigo
      ORDER BY r.codigo
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];

    return ok(reply, {
      referencias: (rows || []).map((r: any) => ({
        codigo: String(r.codigo || '').trim(),
        tipo: String(r.tipo || '').trim(),
        definida: Boolean(r.definida),
      })),
    });
  });

  server.get('/engenharia/obras/:id/planilha/composicoes/validacao', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional() }).parse(request.query || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);

    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    if (!idPlanilha) return ok(reply, { planilhaId: null, bdiPercent: 0, lsPercent: 0, rows: [] });

    const rows = (await prisma.$queryRawUnsafe(
      `
      WITH planilha_params AS (
        SELECT
          COALESCE(bdi_servicos_sinapi, bdi_servicos_sbc, 0) AS bdi,
          COALESCE(enc_sociais_sem_des_sinapi, enc_sociais_sem_des_sbc, 0) AS ls
        FROM obras_planilhas_versoes
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
        LIMIT 1
      ),
      planilha_servicos AS (
        SELECT
          UPPER(COALESCE(codigo,'')) AS codigo_servico,
          COALESCE(MIN(item) FILTER (WHERE COALESCE(item,'') <> ''), '') AS item,
          COALESCE(MAX(servico), '') AS servico,
          SUM(COALESCE(valor_parcial, 0)) AS total_planilha
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1
          AND id_planilha = $3
          AND tipo_linha = 'SERVICO'
          AND COALESCE(codigo,'') <> ''
        GROUP BY UPPER(COALESCE(codigo,''))
      ),
      comps AS (
        SELECT
          UPPER(COALESCE(codigo_servico,'')) AS codigo_servico,
          COUNT(*) AS qtd_itens,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')) AS total_base,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') = 'MAO_DE_OBRA') AS total_mao_base
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
        GROUP BY UPPER(COALESCE(codigo_servico,''))
      )
      SELECT
        s.codigo_servico AS "codigoServico",
        s.item AS "item",
        s.servico AS "servico",
        s.total_planilha AS "totalPlanilha",
        COALESCE(c.qtd_itens, 0) AS "qtdItens",
        COALESCE(c.total_base, 0) AS "totalBase",
        COALESCE(c.total_mao_base, 0) AS "totalMaoBase",
        (SELECT bdi FROM planilha_params) AS "bdiPercent",
        (SELECT ls FROM planilha_params) AS "lsPercent"
      FROM planilha_servicos s
      LEFT JOIN comps c ON c.codigo_servico = s.codigo_servico
      ORDER BY s.codigo_servico
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];

    const bdiPercent = rows?.[0]?.bdiPercent == null ? 0 : Number(rows[0].bdiPercent);
    const lsPercent = rows?.[0]?.lsPercent == null ? 0 : Number(rows[0].lsPercent);

    const out = (rows || []).map((r: any) => {
      const totalPlanilha = r.totalPlanilha == null ? 0 : Number(r.totalPlanilha);
      const totalBase = r.totalBase == null ? 0 : Number(r.totalBase);
      const totalMaoBase = r.totalMaoBase == null ? 0 : Number(r.totalMaoBase);
      const totalComLS = (totalBase - totalMaoBase) + totalMaoBase * (1 + (lsPercent || 0) / 100);
      const totalComLSComBDI = totalComLS * (1 + (bdiPercent || 0) / 100);
      const diff = totalPlanilha - totalComLSComBDI;
      const hasComposicao = Number(r.qtdItens || 0) > 0;
      const status = !hasComposicao ? 'SEM_COMPOSICAO' : Math.abs(diff) > 0.01 ? 'DIVERGENTE' : 'OK';
      return {
        codigoServico: String(r.codigoServico || '').trim(),
        item: String(r.item || '').trim(),
        servico: String(r.servico || ''),
        totalPlanilha,
        totalComposicao: Number(totalComLSComBDI.toFixed(6)),
        diff: Number(diff.toFixed(6)),
        status,
        qtdItens: Number(r.qtdItens || 0),
      };
    });

    return ok(reply, { planilhaId: idPlanilha, bdiPercent, lsPercent, rows: out });
  });

  server.post('/engenharia/obras/:id/planilha/composicoes/importar-csv', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    const isMultipart = typeof (request as any).isMultipart === 'function' ? (request as any).isMultipart() : false;
    if (!isMultipart) return fail(reply, 422, 'Envie multipart/form-data com arquivo no campo "file"');

    const parts = (request as any).parts();
    let fileBuffer: Buffer | null = null;
    for await (const part of parts) {
      if (part.type === 'file' && String(part.fieldname) === 'file') fileBuffer = await part.toBuffer();
    }
    if (!fileBuffer) return fail(reply, 422, 'Arquivo CSV é obrigatório (campo "file")');

    let csvText = decodeCsvBuffer(fileBuffer);
    csvText = csvText.replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvTextAuto(csvText);
    if (!headers.length || !rows.length) return fail(reply, 422, 'CSV vazio ou inválido');

    const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
    const get = (r: string[], key: string) => String(r[idx[key]] ?? '').trim();

    const hasOld = idx['codigo_servico'] != null || idx['codigo_item'] != null;
    const hasNew = idx['servico'] != null || idx['tipo'] != null || idx['codigo'] != null;
    if (!hasOld && !hasNew) return fail(reply, 422, 'Cabeçalho do CSV inválido');

    const requiredOld = ['codigo_servico', 'codigo_item', 'quantidade'];
    const requiredNew = ['servico', 'tipo', 'codigo', 'banco', 'descricao', 'und', 'quantidade', 'valor_unit'];
    const required = hasOld ? requiredOld : requiredNew;
    const missing = required.filter((k) => idx[k] == null);
    if (missing.length) return fail(reply, 422, `Colunas obrigatórias ausentes no CSV: ${missing.join(', ')}`);

    const mapTipo = (raw: string) => {
      const v = String(raw || '').trim().toUpperCase();
      if (!v) return 'INSUMO';
      if (v.includes('AUXILIAR')) return 'COMPOSICAO_AUXILIAR';
      if (v.includes('COMPOSICAO')) return 'COMPOSICAO';
      if (v.includes('INSUMO')) return 'INSUMO';
      if (v.includes('MAO')) return 'MAO_DE_OBRA';
      if (v.includes('EQUIP')) return 'EQUIPAMENTO';
      return null;
    };

    const prepared = rows.map((r, i) => {
      const codigoServico = hasOld ? get(r, 'codigo_servico') : get(r, 'servico');
      const etapa = idx['etapa'] != null ? get(r, 'etapa') : '';
      const tipoRaw = hasOld ? (idx['tipo_item'] != null ? get(r, 'tipo_item') : 'INSUMO') : get(r, 'tipo');
      const tipoItem = mapTipo(tipoRaw);
      const codigoItem = hasOld ? get(r, 'codigo_item') : get(r, 'codigo');
      const banco = hasOld ? (idx['banco'] != null ? get(r, 'banco') : '') : get(r, 'banco');
      const descricao = hasOld ? (idx['descricao'] != null ? get(r, 'descricao') : '') : get(r, 'descricao');
      const und = hasOld ? (idx['und'] != null ? get(r, 'und') : '') : get(r, 'und');
      const quantidade = toDec(get(r, 'quantidade'));
      const valorUnit = idx['valor_unit'] != null ? toDec(get(r, 'valor_unit')) : idx['valor_unitario'] != null ? toDec(get(r, 'valor_unitario')) : null;
      const perda = idx['perda_percentual'] != null ? toDec(get(r, 'perda_percentual')) : 0;
      const cc = idx['codigo_centro_custo'] != null ? get(r, 'codigo_centro_custo') : '';

      if (!codigoServico) return { ok: false as const, rowIndex: i, message: 'serviço é obrigatório' };
      if (!codigoItem) return { ok: false as const, rowIndex: i, message: 'codigo é obrigatório' };
      if (!tipoItem) return { ok: false as const, rowIndex: i, message: 'tipo inválido' };
      if (quantidade == null) return { ok: false as const, rowIndex: i, message: 'quantidade inválida' };

      return {
        ok: true as const,
        codigoServico: String(codigoServico).trim().slice(0, 80),
        etapa: etapa ? String(etapa).trim().slice(0, 120) : null,
        tipoItem: String(tipoItem).trim().toUpperCase().slice(0, 32) || 'INSUMO',
        codigoItem: String(codigoItem).trim().slice(0, 80),
        banco: banco ? String(banco).trim().slice(0, 60) : null,
        descricao: descricao ? String(descricao).trim().slice(0, 255) : null,
        und: und ? String(und).trim().slice(0, 40) : null,
        quantidade,
        valorUnitario: valorUnit == null ? null : Number(valorUnit),
        perda: perda == null ? 0 : Number(perda),
        codigoCentroCusto: cc ? String(cc).trim().slice(0, 40) : null,
      };
    });

    const invalid = prepared.find((p) => !p.ok);
    if (invalid && !invalid.ok) return fail(reply, 422, `Erro no CSV (linha ${invalid.rowIndex + 2}): ${invalid.message}`);
    const preparedOk = prepared.filter((p): p is Extract<(typeof prepared)[number], { ok: true }> => p.ok);

    const chunkSize = 500;
    let upserted = 0;
    await prisma.$transaction(async (tx: any) => {
      for (let start = 0; start < preparedOk.length; start += chunkSize) {
        const chunk = preparedOk.slice(start, start + chunkSize);
        const params: any[] = [];
        let p = 1;
        const values = chunk
          .map((r) => {
            const base = [
              ctx.tenantId,
              idObra,
              idPlanilha,
              r.codigoServico,
              r.etapa ?? '',
              r.tipoItem,
              r.codigoItem,
              r.banco,
              r.descricao,
              r.und,
              r.quantidade,
              r.valorUnitario,
              r.perda,
              r.codigoCentroCusto,
            ];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');

        await tx.$executeRawUnsafe(
          `
          INSERT INTO obras_planilhas_composicoes_itens
            (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
          VALUES
            ${values}
          ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_servico, (COALESCE(etapa,'')), tipo_item, codigo_item)
          DO UPDATE SET
            banco = EXCLUDED.banco,
            descricao = EXCLUDED.descricao,
            und = EXCLUDED.und,
            quantidade = EXCLUDED.quantidade,
            valor_unitario = EXCLUDED.valor_unitario,
            perda_percentual = EXCLUDED.perda_percentual,
            codigo_centro_custo = EXCLUDED.codigo_centro_custo,
            atualizado_em = NOW()
          `,
          ...params
        );
        upserted += chunk.length;
      }
    }, { timeout: 120000, maxWait: 20000 });

    return ok(reply, { upserted }, { message: 'Composições importadas' });
  });

  async function carregarItensComposicaoObra(tx: any, tenantId: number, idObra: number, idPlanilha: number, codigoServico: string) {
    return (await tx.$queryRawUnsafe(
      `
      SELECT
        id_item AS "idItemBase",
        COALESCE(etapa,'') AS "etapa",
        UPPER(COALESCE(tipo_item,'')) AS "tipoItem",
        UPPER(COALESCE(codigo_item,'')) AS "codigoItem",
        quantidade AS "quantidade",
        valor_unitario AS "valorUnitario"
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4
      ORDER BY COALESCE(etapa,''), tipo_item, codigo_item, id_item
      `,
      tenantId,
      idObra,
      idPlanilha,
      codigoServico
    )) as any[];
  }

  async function calcularTotalComposicaoFixa(
    tx: any,
    tenantId: number,
    idObra: number,
    idPlanilha: number,
    codigoServico: string,
    cache: Map<string, number | null>,
    stack: Set<string>
  ): Promise<number | null> {
    const codigo = String(codigoServico || '').trim().toUpperCase();
    if (!codigo) return null;
    if (cache.has(codigo)) return cache.get(codigo) ?? null;
    if (stack.has(codigo)) return null;

    stack.add(codigo);
    const itens = await carregarItensComposicaoObra(tx, tenantId, idObra, idPlanilha, codigo);
    if (!itens.length) {
      stack.delete(codigo);
      cache.set(codigo, null);
      return null;
    }

    let total = 0;
    for (const it of itens) {
      const quantidade = it?.quantidade == null ? null : Number(it.quantidade);
      if (!Number.isFinite(quantidade as number)) continue;
      const tipo = String(it?.tipoItem || '').trim().toUpperCase();
      if (tipo === 'COMPOSICAO' || tipo === 'COMPOSICAO_AUXILIAR') {
        const codigoRef = String(it?.codigoItem || '').trim().toUpperCase();
        if (!codigoRef) continue;
        const valorRef = await calcularTotalComposicaoFixa(tx, tenantId, idObra, idPlanilha, codigoRef, cache, stack);
        if (valorRef == null) continue;
        total += Number(quantidade) * Number(valorRef);
      } else {
        const valorUnitario = it?.valorUnitario == null ? null : Number(it.valorUnitario);
        if (!Number.isFinite(valorUnitario as number)) continue;
        total += Number(quantidade) * Number(valorUnitario);
      }
    }

    stack.delete(codigo);
    const fixo = Number(total.toFixed(6));
    cache.set(codigo, fixo);
    return fixo;
  }

  async function fixarValoresReferenciasComposicao(
    tx: any,
    tenantId: number,
    idObra: number,
    idPlanilha: number,
    codigoServico: string,
    cache?: Map<string, number | null>
  ) {
    const codigo = String(codigoServico || '').trim().toUpperCase();
    if (!codigo) return { atualizados: 0 };
    const mapa = cache || new Map<string, number | null>();
    const itens = await carregarItensComposicaoObra(tx, tenantId, idObra, idPlanilha, codigo);
    const itensComposicoes = (itens || []).filter((r: any) => {
      const tipo = String(r?.tipoItem || '').trim().toUpperCase();
      return tipo === 'COMPOSICAO' || tipo === 'COMPOSICAO_AUXILIAR';
    });
    let atualizados = 0;
    for (const it of itensComposicoes) {
      const codigoRef = String(it?.codigoItem || '').trim().toUpperCase();
      if (!codigoRef) continue;
      const valorRef = await calcularTotalComposicaoFixa(tx, tenantId, idObra, idPlanilha, codigoRef, mapa, new Set<string>([codigo]));
      if (valorRef == null) continue;
      const atual = it?.valorUnitario == null ? null : Number(it.valorUnitario);
      if (Number.isFinite(atual as number) && Math.abs(Number(atual) - Number(valorRef)) <= 0.000001) continue;
      await tx.$executeRawUnsafe(
        `
        UPDATE obras_planilhas_composicoes_itens
        SET valor_unitario = $5, atualizado_em = NOW()
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND id_item = $4
        `,
        tenantId,
        idObra,
        idPlanilha,
        Number(it.idItemBase),
        toDec(valorRef)
      );
      atualizados++;
    }
    if (mapa.has(codigo)) mapa.delete(codigo);
    return { atualizados };
  }

  async function listarComposicoesPai(tx: any, tenantId: number, idObra: number, idPlanilha: number, codigoReferencia: string) {
    const codigo = String(codigoReferencia || '').trim().toUpperCase();
    if (!codigo) return [] as string[];
    const rows = (await tx.$queryRawUnsafe(
      `
      SELECT DISTINCT UPPER(COALESCE(codigo_servico,'')) AS "codigoServico"
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1
        AND id_obra = $2
        AND id_planilha = $3
        AND UPPER(COALESCE(codigo_item,'')) = $4
        AND UPPER(COALESCE(tipo_item,'')) IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
      `,
      tenantId,
      idObra,
      idPlanilha,
      codigo
    )) as any[];
    return (rows || []).map((r: any) => String(r.codigoServico || '').trim().toUpperCase()).filter(Boolean);
  }

  async function recalcularFixacaoCascata(tx: any, tenantId: number, idObra: number, idPlanilha: number, codigosIniciais: string[]) {
    const queue = Array.from(new Set((codigosIniciais || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)));
    const vistos = new Set<string>();
    const cache = new Map<string, number | null>();
    let atualizados = 0;
    while (queue.length) {
      const atual = String(queue.shift() || '').trim().toUpperCase();
      if (!atual || vistos.has(atual)) continue;
      vistos.add(atual);
      const res = await fixarValoresReferenciasComposicao(tx, tenantId, idObra, idPlanilha, atual, cache);
      atualizados += Number(res.atualizados || 0);
      const pais = await listarComposicoesPai(tx, tenantId, idObra, idPlanilha, atual);
      for (const p of pais) {
        if (!vistos.has(p)) queue.push(p);
      }
      if (vistos.size > 300) break;
    }
    return { atualizados };
  }

  async function atualizarServicosPlanilhaPorCodigos(tx: any, tenantId: number, idObra: number, idPlanilha: number, codigos: string[]) {
    const list = Array.from(new Set((codigos || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)));
    if (!list.length) return { atualizados: 0 };

    const res = await tx.$executeRawUnsafe(
      `
      WITH params AS (
        SELECT
          COALESCE(bdi_servicos_sinapi, bdi_servicos_sbc, 0) AS bdi,
          COALESCE(enc_sociais_sem_des_sinapi, enc_sociais_sem_des_sbc, 0) AS ls
        FROM obras_planilhas_versoes
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
        LIMIT 1
      ),
      codes AS (
        SELECT DISTINCT UPPER(x) AS codigo
        FROM unnest($4::text[]) AS x
      ),
      comp AS (
        SELECT
          UPPER(COALESCE(codigo_servico,'')) AS codigo,
          COUNT(*) AS qtd,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')) AS total_base,
          SUM(COALESCE(quantidade,0) * COALESCE(valor_unitario,0)) FILTER (WHERE COALESCE(tipo_item,'') = 'MAO_DE_OBRA') AS total_mao_base
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(COALESCE(codigo_servico,'')) = ANY($4::text[])
        GROUP BY UPPER(COALESCE(codigo_servico,''))
      ),
      calc AS (
        SELECT
          c.codigo,
          COALESCE(comp.qtd, 0) AS qtd,
          COALESCE(comp.total_base, 0) AS total_base,
          COALESCE(comp.total_mao_base, 0) AS total_mao_base
        FROM codes c
        LEFT JOIN comp ON comp.codigo = c.codigo
      )
      UPDATE obras_planilhas_linhas l
      SET
        valor_unitario = CASE
          WHEN calc.qtd > 0 THEN
            ROUND(
              (
                ((calc.total_base - calc.total_mao_base) + calc.total_mao_base * (1 + (SELECT ls FROM params) / 100.0))
                * (1 + (SELECT bdi FROM params) / 100.0)
              )::numeric,
              6
            )
          ELSE 0
        END,
        valor_parcial = CASE
          WHEN l.quantidade IS NULL THEN l.valor_parcial
          ELSE ROUND((COALESCE(l.quantidade,0) * CASE
            WHEN calc.qtd > 0 THEN
              (
                ((calc.total_base - calc.total_mao_base) + calc.total_mao_base * (1 + (SELECT ls FROM params) / 100.0))
                * (1 + (SELECT bdi FROM params) / 100.0)
              )
            ELSE 0
          END)::numeric, 6)
        END,
        atualizado_em = NOW()
      FROM calc
      WHERE l.tenant_id = $1
        AND l.id_planilha = $3
        AND l.tipo_linha = 'SERVICO'
        AND UPPER(COALESCE(l.codigo,'')) = calc.codigo
      `,
      tenantId,
      idObra,
      idPlanilha,
      list
    );

    return { atualizados: Number(res || 0) };
  }

  server.get('/engenharia/obras/:id/planilha/servicos/:codigo/composicao-itens', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z.object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) }).parse(request.params || {});
    const idObra = Number(id);
    const codigoServico = String(codigo).trim().toUpperCase();
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    await prisma.$transaction(async (tx: any) => {
      await recalcularFixacaoCascata(tx, ctx.tenantId, idObra, idPlanilha, [codigoServico]);
    });
    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        id_item AS "idItemBase",
        COALESCE(etapa,'') AS "etapa",
        tipo_item AS "tipoItem",
        codigo_item AS "codigoItem",
        COALESCE(banco,'') AS "banco",
        descricao AS "descricao",
        und AS "und",
        quantidade AS "quantidade",
        valor_unitario AS "valorUnitario",
        perda_percentual AS "perdaPercentual",
        codigo_centro_custo AS "codigoCentroCusto"
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4
      ORDER BY COALESCE(etapa,''), tipo_item, codigo_item, id_item
      `,
      ctx.tenantId,
      idObra,
      idPlanilha,
      codigoServico
    )) as any[];

    return ok(reply, {
      codigoComposicao: codigoServico,
      itens: (rows || []).map((r: any) => ({
        ...r,
        idItemBase: typeof r.idItemBase === 'bigint' ? Number(r.idItemBase) : Number(r.idItemBase || 0),
        codigoCentroCustoBase: null,
      })),
    });
  });

  server.put('/engenharia/obras/:id/planilha/servicos/:codigo/composicao-itens', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z.object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) }).parse(request.params || {});
    const idObra = Number(id);
    const codigoServico = String(codigo).trim().toUpperCase();
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    const body = (request.body || {}) as any;

    if (Array.isArray(body.itens)) {
      const itens = body.itens as any[];
      await prisma.$transaction(async (tx: any) => {
        await ensureInsumosPrecosTables(tx);
        const vers = (await tx.$queryRawUnsafe(
          `
          SELECT data_base_sinapi AS "dataBaseSinapi"
          FROM obras_planilhas_versoes
          WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
          LIMIT 1
          `,
          ctx.tenantId,
          idObra,
          idPlanilha
        )) as any[];
        const dataBaseSinapi = vers?.[0]?.dataBaseSinapi == null ? '' : String(vers[0].dataBaseSinapi || '').trim();

        await tx.$executeRawUnsafe(
          `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4`,
          ctx.tenantId,
          idObra,
          idPlanilha,
          codigoServico
        );

        const normalized = itens
          .map((i) => ({
            etapa: i.etapa ? String(i.etapa).trim().slice(0, 120) : '',
            tipoItem: String(i.tipoItem || 'INSUMO').trim().toUpperCase().slice(0, 32) || 'INSUMO',
            codigoItem: String(i.codigoItem || '').trim().slice(0, 80),
            banco: i.banco ? String(i.banco).trim().slice(0, 60) : null,
            descricao: i.descricao ? String(i.descricao).trim().slice(0, 255) : null,
            und: i.und ? String(i.und).trim().slice(0, 40) : null,
            quantidade: i.quantidade == null || i.quantidade === '' ? null : toDec(i.quantidade),
            valorUnitario: i.valorUnitario == null || i.valorUnitario === '' ? null : toDec(i.valorUnitario),
            perda: i.perdaPercentual == null || i.perdaPercentual === '' ? 0 : toDec(i.perdaPercentual),
            codigoCentroCusto: i.codigoCentroCusto ? String(i.codigoCentroCusto).trim().slice(0, 40) : null,
          }))
          .filter((i) => i.codigoItem && i.quantidade != null);

        const compCodes = new Set<string>();
        const insumoCodes = new Set<string>();
        for (const r of normalized) {
          const tipoKey = normalizeHeader(String(r.tipoItem || ''));
          const code = String(r.codigoItem || '').trim().toUpperCase();
          if (!code) continue;
          if (tipoKey === 'composicao' || tipoKey === 'composicao_auxiliar') compCodes.add(code);
          else insumoCodes.add(code);
        }

        if (dataBaseSinapi && (compCodes.size || insumoCodes.size)) {
          await ensureSinapiBaseTables(tx);
          const servMeta = new Map<string, { descricao: string; und: string }>();
          const insMeta = new Map<string, { descricao: string; und: string; classificacao: string | null }>();

          if (compCodes.size) {
            const rows = (await tx.$queryRawUnsafe(
              `
              SELECT UPPER(codigo_servico) AS "codigo", COALESCE(descricao,'') AS "descricao", COALESCE(und,'') AS "und"
              FROM sinapi_servicos_base
              WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_servico) = ANY($3::text[])
              `,
              ctx.tenantId,
              dataBaseSinapi,
              Array.from(compCodes)
            )) as any[];
            for (const r of rows || []) {
              const codigo = String(r?.codigo || '').trim().toUpperCase();
              if (!codigo) continue;
              servMeta.set(codigo, { descricao: String(r?.descricao || '').trim(), und: String(r?.und || '').trim() });
            }
          }

          if (insumoCodes.size) {
            const rows = (await tx.$queryRawUnsafe(
              `
              SELECT UPPER(codigo_insumo) AS "codigo", COALESCE(descricao,'') AS "descricao", COALESCE(und,'') AS "und", classificacao AS "classificacao"
              FROM sinapi_insumos_base
              WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_insumo) = ANY($3::text[])
              `,
              ctx.tenantId,
              dataBaseSinapi,
              Array.from(insumoCodes)
            )) as any[];
            for (const r of rows || []) {
              const codigo = String(r?.codigo || '').trim().toUpperCase();
              if (!codigo) continue;
              insMeta.set(codigo, {
                descricao: String(r?.descricao || '').trim(),
                und: String(r?.und || '').trim(),
                classificacao: r?.classificacao == null ? null : String(r.classificacao || '').trim() || null,
              });
            }
          }

          for (const r of normalized) {
            const tipoKey = normalizeHeader(String(r.tipoItem || ''));
            const code = String(r.codigoItem || '').trim().toUpperCase();
            if (!code) continue;
            if (tipoKey === 'composicao' || tipoKey === 'composicao_auxiliar') {
              const meta = servMeta.get(code);
              if (meta) {
                if (meta.descricao) r.descricao = meta.descricao;
                if (meta.und) r.und = meta.und;
                r.banco = r.banco || 'SINAPI';
              }
              r.valorUnitario = null;
            } else {
              const meta = insMeta.get(code);
              if (meta) {
                if (meta.descricao) r.descricao = meta.descricao;
                if (meta.und) r.und = meta.und;
                r.banco = r.banco || 'SINAPI';
              }
            }
          }
        } else {
          for (const r of normalized) {
            const tipoKey = normalizeHeader(String(r.tipoItem || ''));
            if (tipoKey === 'composicao' || tipoKey === 'composicao_auxiliar') r.valorUnitario = null;
          }
        }

        const desiredInsumoPrices = new Map<string, number>();
        for (const r of normalized) {
          const tipo = String(r.tipoItem || '').trim().toUpperCase();
          if (tipo === 'COMPOSICAO') continue;
          if (r.valorUnitario == null) continue;
          const code = String(r.codigoItem || '').trim().toUpperCase();
          const vu = Number(r.valorUnitario);
          if (!code || !Number.isFinite(vu)) continue;
          desiredInsumoPrices.set(code, vu);
        }

        if (desiredInsumoPrices.size) {
          const chunkSize = 500;
          const list = Array.from(desiredInsumoPrices.entries());
          for (let start = 0; start < list.length; start += chunkSize) {
            const chunk = list.slice(start, start + chunkSize);
            const params: any[] = [];
            let p = 1;
            const values = chunk
              .map(([codigoItem, valorUnitario]) => {
                const base = [ctx.tenantId, idObra, idPlanilha, codigoItem, toDec(valorUnitario)];
                for (const v of base) params.push(v);
                const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
                return `(${placeholders})`;
              })
              .join(',');

            await tx.$executeRawUnsafe(
              `
              INSERT INTO obras_insumos_precos
                (tenant_id, id_obra, id_planilha, codigo_item, valor_unitario)
              VALUES
                ${values}
              ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_item)
              DO UPDATE SET
                valor_unitario = EXCLUDED.valor_unitario,
                atualizado_em = NOW()
              `,
              ...params
            );
          }

          const list2 = Array.from(desiredInsumoPrices.entries());
          const updChunk = 400;
          for (let start = 0; start < list2.length; start += updChunk) {
            const chunk = list2.slice(start, start + updChunk);
            const params: any[] = [ctx.tenantId, idObra, idPlanilha];
            let p = 4;
            const values = chunk
              .map(([codigoItem, valorUnitario]) => {
                params.push(codigoItem);
                params.push(toDec(valorUnitario));
                const a = `$${p++}`;
                const b = `$${p++}`;
                return `(${a}, ${b})`;
              })
              .join(',');

            await tx.$executeRawUnsafe(
              `
              UPDATE obras_planilhas_composicoes_itens i
              SET valor_unitario = v.valor_unitario, atualizado_em = NOW()
              FROM (VALUES ${values}) AS v(codigo_item, valor_unitario)
              WHERE i.tenant_id = $1
                AND i.id_obra = $2
                AND i.id_planilha = $3
                AND UPPER(COALESCE(i.codigo_item,'')) = v.codigo_item
                AND UPPER(COALESCE(i.tipo_item,'')) NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
              `,
              ...params
            );
          }

          for (const r of normalized) {
            const tipo = String(r.tipoItem || '').trim().toUpperCase();
            if (tipo === 'COMPOSICAO') continue;
            const code = String(r.codigoItem || '').trim().toUpperCase();
            const vu = desiredInsumoPrices.get(code);
            if (vu == null || !Number.isFinite(vu)) continue;
            r.valorUnitario = toDec(vu);
          }
        }

        const chunkSize = 500;
        for (let start = 0; start < normalized.length; start += chunkSize) {
          const chunk = normalized.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const base = [
                ctx.tenantId,
                idObra,
                idPlanilha,
                codigoServico,
                r.etapa,
                r.tipoItem,
                r.codigoItem,
                r.banco,
                r.descricao,
                r.und,
                r.quantidade,
                r.valorUnitario,
                r.perda == null ? 0 : Number(r.perda),
                r.codigoCentroCusto,
              ];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_composicoes_itens
              (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
            VALUES
              ${values}
            `,
            ...params
          );
        }

        let afetados = [codigoServico];
        if (desiredInsumoPrices.size) {
          const rows = (await tx.$queryRawUnsafe(
            `
            SELECT DISTINCT UPPER(COALESCE(codigo_servico,'')) AS "codigoServico"
            FROM obras_planilhas_composicoes_itens
            WHERE tenant_id = $1
              AND id_obra = $2
              AND id_planilha = $3
              AND UPPER(COALESCE(codigo_item,'')) = ANY($4::text[])
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            Array.from(desiredInsumoPrices.keys())
          )) as any[];
          afetados = Array.from(
            new Set(
              (rows || [])
                .map((r: any) => String(r?.codigoServico || '').trim().toUpperCase())
                .filter(Boolean)
                .concat([codigoServico])
            )
          );
        }
        await recalcularFixacaoCascata(tx, ctx.tenantId, idObra, idPlanilha, afetados);

        await atualizarServicosPlanilhaPorCodigos(tx, ctx.tenantId, idObra, idPlanilha, afetados);

        const primitivaExists = (await tx.$queryRawUnsafe(`SELECT to_regclass(current_schema() || '.obras_planilhas_composicoes_primitivas') AS "t"`)) as any[];
        const hasPrimitivaTable = Boolean(primitivaExists?.[0]?.t);
        if (hasPrimitivaTable) {
          await tx.$executeRawUnsafe(
            `
            DELETE FROM obras_planilhas_composicoes_primitivas
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = ANY($4::text[])
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            afetados
          );
        }
      }, { timeout: 120000, maxWait: 20000 });

      return ok(reply, { ok: true }, { message: 'Composição atualizada' });
    }

    if (Array.isArray(body.updates)) {
      const updates = body.updates as any[];
      await prisma.$transaction(async (tx: any) => {
        for (const u of updates) {
          const idItemBase = u.idItemBase != null ? Number(u.idItemBase) : NaN;
          const codigoCentroCusto = u.codigoCentroCusto ? String(u.codigoCentroCusto).trim().slice(0, 40) : null;
          if (!Number.isFinite(idItemBase) || idItemBase <= 0) continue;
          await tx.$executeRawUnsafe(
            `
            UPDATE obras_planilhas_composicoes_itens
            SET codigo_centro_custo = $5, atualizado_em = NOW()
            WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND id_item = $4
            `,
            ctx.tenantId,
            idObra,
            idPlanilha,
            idItemBase,
            codigoCentroCusto
          );
        }
      });

      return ok(reply, { ok: true }, { message: 'Composição salva' });
    }

    return fail(reply, 422, 'Payload inválido');
  });

  server.get('/engenharia/obras/:id/planilha/servicos/:codigo/composicao-primitiva', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z.object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) }).parse(request.params || {});
    const idObra = Number(id);
    const codigoServico = String(codigo).trim().toUpperCase();

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    await ensurePlanilhaComposicaoPrimitivaTables(prisma);

    const q = z
      .object({
        refresh: z.string().optional().nullable(),
        planilhaId: z.coerce.number().int().positive().optional().nullable(),
      })
      .parse(request.query || {});
    const refresh = ['1', 'true', 'yes', 'sim'].includes(String(q.refresh || '').trim().toLowerCase());
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);

    const loadMetaFromPlanilha = async (tx: any) => {
      const row = (await tx.$queryRawUnsafe(
        `
        SELECT COALESCE(servico,'') AS "servico", COALESCE(und,'') AS "und"
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1
          AND id_planilha = $2
          AND tipo_linha = 'SERVICO'
          AND UPPER(COALESCE(codigo,'')) = $3
        ORDER BY id_linha DESC
        LIMIT 1
        `,
        ctx.tenantId,
        idPlanilha,
        codigoServico
      )) as any[];
      const serv = row?.[0]?.servico != null ? String(row[0].servico || '').trim() : '';
      const und = row?.[0]?.und != null ? String(row[0].und || '').trim() : '';
      return { descricaoServico: serv || null, undServico: und || null };
    };

    const readCached = async (tx: any) => {
      const rows = (await tx.$queryRawUnsafe(
        `
        SELECT descricao_servico AS "descricaoServico", und_servico AS "undServico", itens_json AS "itensJson", atualizado_em AS "updatedAt"
        FROM obras_planilhas_composicoes_primitivas
        WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4
        ORDER BY id_primitiva DESC
        LIMIT 1
        `,
        ctx.tenantId,
        idObra,
        idPlanilha,
        codigoServico
      )) as any[];
      const r = rows?.[0] || null;
      if (!r) return null;
      const itens = Array.isArray(r.itensJson) ? r.itensJson : Array.isArray(r.itens_json) ? r.itens_json : r.itensJson || r.itens_json;
      return {
        meta: {
          descricaoServico: r.descricaoServico == null ? null : String(r.descricaoServico || '').trim() || null,
          undServico: r.undServico == null ? null : String(r.undServico || '').trim() || null,
          updatedAt: r.updatedAt == null ? null : new Date(r.updatedAt).toISOString(),
        },
        rows: Array.isArray(itens) ? itens : [],
      };
    };

    const computeAndSave = async (tx: any) => {
      const meta = await loadMetaFromPlanilha(tx);
      const stack = new Set<string>();
      const out = new Map<string, { tipoItem: string; codigoItem: string; banco: string; descricao: string; und: string; quantidade: number; valorUnitario: number }>();

      const loadItens = async (code: string) => {
        const rows = (await tx.$queryRawUnsafe(
          `
          SELECT
            tipo_item AS "tipoItem",
            codigo_item AS "codigoItem",
            COALESCE(banco,'') AS "banco",
            COALESCE(descricao,'') AS "descricao",
            COALESCE(und,'') AS "und",
            quantidade AS "quantidade",
            valor_unitario AS "valorUnitario"
          FROM obras_planilhas_composicoes_itens
          WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4
          ORDER BY COALESCE(etapa,''), tipo_item, codigo_item, id_item
          `,
          ctx.tenantId,
          idObra,
          idPlanilha,
          String(code || '').trim().toUpperCase()
        )) as any[];
        return (rows || []).map((r: any) => ({
          tipoItem: String(r.tipoItem || '').trim(),
          codigoItem: String(r.codigoItem || '').trim().toUpperCase(),
          banco: String(r.banco || '').trim(),
          descricao: String(r.descricao || '').trim(),
          und: String(r.und || '').trim(),
          quantidade: r.quantidade == null ? 0 : Number(r.quantidade),
          valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario),
        }));
      };

      const expand = async (code: string, mult: number) => {
        const k = String(code || '').trim().toUpperCase();
        if (!k) return;
        if (stack.has(k)) return;
        stack.add(k);
        const itens = await loadItens(k);
        for (const it of itens) {
          const tipoRaw = String(it.tipoItem || '').trim();
          const tipoKey = normalizeHeader(tipoRaw);
          const childCode = String(it.codigoItem || '').trim().toUpperCase();
          const q = Number(it.quantidade || 0);
          const qty = (Number.isFinite(q) ? q : 0) * mult;
          const vu = Number.isFinite(Number(it.valorUnitario || 0)) ? Number(it.valorUnitario || 0) : 0;
          if (tipoKey.includes('composicao')) {
            if (childCode && qty > 0) await expand(childCode, qty);
            continue;
          }
          const key = [tipoRaw, childCode, String(it.und || '').trim().toUpperCase(), String(it.banco || '').trim().toUpperCase(), String(vu)].join('|');
          const cur = out.get(key);
          if (!cur) {
            out.set(key, {
              tipoItem: tipoRaw,
              codigoItem: childCode,
              banco: it.banco,
              descricao: it.descricao,
              und: it.und,
              quantidade: qty,
              valorUnitario: vu,
            });
          } else {
            out.set(key, { ...cur, quantidade: Number(cur.quantidade || 0) + qty });
          }
        }
        stack.delete(k);
      };

      await expand(codigoServico, 1);
      const rows = Array.from(out.values())
        .map((r) => ({
          ...r,
          quantidade: Number((Number(r.quantidade || 0)).toFixed(6)),
          valorUnitario: Number((Number(r.valorUnitario || 0)).toFixed(6)),
          total: Number(((Number(r.quantidade || 0)) * (Number(r.valorUnitario || 0))).toFixed(2)),
        }))
        .sort((a, b) => String(a.tipoItem).localeCompare(String(b.tipoItem)) || String(a.codigoItem).localeCompare(String(b.codigoItem)));

      await tx.$executeRawUnsafe(
        `
        INSERT INTO obras_planilhas_composicoes_primitivas (tenant_id, id_obra, id_planilha, codigo_servico, descricao_servico, und_servico, itens_json, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
        ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_servico)
        DO UPDATE SET descricao_servico = EXCLUDED.descricao_servico, und_servico = EXCLUDED.und_servico, itens_json = EXCLUDED.itens_json, atualizado_em = NOW()
        `,
        ctx.tenantId,
        idObra,
        idPlanilha,
        codigoServico,
        meta.descricaoServico,
        meta.undServico,
        JSON.stringify(rows)
      );

      const cached = await readCached(tx);
      if (cached) return cached;
      return { meta: { ...meta, updatedAt: new Date().toISOString() }, rows };
    };

    const data = await prisma.$transaction(async (tx: any) => {
      if (!refresh) {
        const cached = await readCached(tx);
        if (cached) return cached;
      }
      return computeAndSave(tx);
    }, { timeout: 120000, maxWait: 20000 });

    return ok(reply, data, { message: refresh ? 'Composição primitiva atualizada' : 'Composição primitiva carregada' });
  });

  server.post('/engenharia/obras/:id/planilha/servicos/:codigo/composicao-importar-csv', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id, codigo } = z.object({ id: z.coerce.number().int().positive(), codigo: z.string().min(1) }).parse(request.params || {});
    const idObra = Number(id);
    const codigoServico = String(codigo).trim().toUpperCase();

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    const q = z
      .object({
        planilhaId: z.coerce.number().int().positive().optional().nullable(),
      })
      .parse(request.query || {});
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);
    const isMultipart = typeof (request as any).isMultipart === 'function' ? (request as any).isMultipart() : false;
    if (!isMultipart) return fail(reply, 422, 'Envie multipart/form-data com arquivo no campo "file"');

    const parts = (request as any).parts();
    let fileBuffer: Buffer | null = null;
    for await (const part of parts) {
      if (part.type === 'file' && String(part.fieldname) === 'file') fileBuffer = await part.toBuffer();
    }
    if (!fileBuffer) return fail(reply, 422, 'Arquivo CSV é obrigatório (campo "file")');

    let csvText = decodeCsvBuffer(fileBuffer);
    csvText = csvText.replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvTextAuto(csvText);
    if (!headers.length || !rows.length) return fail(reply, 422, 'CSV vazio ou inválido');

    const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
    const get = (r: string[], key: string) => String(r[idx[key]] ?? '').trim();

    const hasOld = idx['codigo_item'] != null || idx['tipo_item'] != null;
    const hasNew = idx['codigo'] != null || idx['tipo'] != null || idx['servico'] != null;
    if (!hasOld && !hasNew) return fail(reply, 422, 'Cabeçalho do CSV inválido');

    const requiredOld = ['codigo_item', 'quantidade'];
    const requiredNew = ['tipo', 'codigo', 'banco', 'descricao', 'und', 'quantidade', 'valor_unit'];
    const required = hasOld ? requiredOld : requiredNew;
    const missing = required.filter((k) => idx[k] == null);
    if (missing.length) return fail(reply, 422, `Colunas obrigatórias ausentes no CSV: ${missing.join(', ')}`);

    const mapTipo = (raw: string) => {
      const v = String(raw || '').trim().toUpperCase();
      if (!v) return 'INSUMO';
      if (v.includes('AUXILIAR')) return 'COMPOSICAO_AUXILIAR';
      if (v.includes('COMPOSICAO')) return 'COMPOSICAO';
      if (v.includes('INSUMO')) return 'INSUMO';
      if (v.includes('MAO')) return 'MAO_DE_OBRA';
      if (v.includes('EQUIP')) return 'EQUIPAMENTO';
      return null;
    };

    const prepared = rows.map((r, i) => {
      const etapa = idx['etapa'] != null ? get(r, 'etapa') : '';
      const tipoRaw = hasOld ? (idx['tipo_item'] != null ? get(r, 'tipo_item') : 'INSUMO') : get(r, 'tipo');
      const tipoItem = mapTipo(tipoRaw);
      const codigoItem = hasOld ? get(r, 'codigo_item') : get(r, 'codigo');
      const banco = idx['banco'] != null ? get(r, 'banco') : '';
      const descricao = idx['descricao'] != null ? get(r, 'descricao') : '';
      const und = idx['und'] != null ? get(r, 'und') : '';
      const quantidade = toDec(get(r, 'quantidade'));
      const valorUnit = idx['valor_unit'] != null ? toDec(get(r, 'valor_unit')) : idx['valor_unitario'] != null ? toDec(get(r, 'valor_unitario')) : null;
      const perda = idx['perda_percentual'] != null ? toDec(get(r, 'perda_percentual')) : 0;
      const cc = idx['codigo_centro_custo'] != null ? get(r, 'codigo_centro_custo') : '';

      if (!codigoItem) return { ok: false as const, rowIndex: i, message: 'codigo é obrigatório' };
      if (!tipoItem) return { ok: false as const, rowIndex: i, message: 'tipo inválido' };
      if (quantidade == null) return { ok: false as const, rowIndex: i, message: 'quantidade inválida' };

      return {
        ok: true as const,
        etapa: etapa ? String(etapa).trim().slice(0, 120) : null,
        tipoItem: String(tipoItem).trim().toUpperCase().slice(0, 32) || 'INSUMO',
        codigoItem: String(codigoItem).trim().slice(0, 80),
        banco: banco ? String(banco).trim().slice(0, 60) : null,
        descricao: descricao ? String(descricao).trim().slice(0, 255) : null,
        und: und ? String(und).trim().slice(0, 40) : null,
        quantidade,
        valorUnitario: valorUnit == null ? null : Number(valorUnit),
        perda: perda == null ? 0 : Number(perda),
        codigoCentroCusto: cc ? String(cc).trim().slice(0, 40) : null,
      };
    });

    const invalid = prepared.find((p) => !p.ok);
    if (invalid && !invalid.ok) return fail(reply, 422, `Erro no CSV (linha ${invalid.rowIndex + 2}): ${invalid.message}`);
    const preparedOk = prepared.filter((p): p is Extract<(typeof prepared)[number], { ok: true }> => p.ok);

    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4`,
        ctx.tenantId,
        idObra,
        idPlanilha,
        codigoServico
      );

      const chunkSize = 500;
      for (let start = 0; start < preparedOk.length; start += chunkSize) {
        const chunk = preparedOk.slice(start, start + chunkSize);
        const params: any[] = [];
        let p = 1;
        const values = chunk
          .map((r) => {
            const base = [
              ctx.tenantId,
              idObra,
              idPlanilha,
              codigoServico,
              r.etapa ?? '',
              r.tipoItem,
              r.codigoItem,
              r.banco,
              r.descricao,
              r.und,
              r.quantidade,
              r.valorUnitario,
              r.perda,
              r.codigoCentroCusto,
            ];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');

        await tx.$executeRawUnsafe(
          `
          INSERT INTO obras_planilhas_composicoes_itens
            (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
          VALUES
            ${values}
          `,
          ...params
        );
      }
    }, { timeout: 120000, maxWait: 20000 });

    return ok(reply, { ok: true }, { message: 'Composição importada' });
  });

  server.post('/engenharia/obras/:id/planilha/sinapi/import-analitico', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    await ensureSinapiBaseTables(prisma);

    const parseNumber = (v: any) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const s = String(v || '').trim();
      if (!s) return null;
      const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const mapTipo = (raw: string) => {
      const v = String(raw || '').trim().toUpperCase();
      if (!v) return null;
      if (v.includes('AUX')) return 'COMPOSICAO_AUXILIAR';
      if (v.includes('COMPOS')) return 'COMPOSICAO';
      if (v.includes('EQUIP')) return 'EQUIPAMENTO';
      if (v.includes('MAO') || v.includes('MÃO')) return 'MAO_DE_OBRA';
      if (v.includes('INSUM')) return 'INSUMO';
      return null;
    };

    const isMultipart = typeof (request as any).isMultipart === 'function' ? (request as any).isMultipart() : false;
    const fields: Record<string, any> = {};
    let fileBuffer: Buffer | null = null;

    if (isMultipart) {
      const parts = (request as any).parts();
      for await (const part of parts) {
        if (part.type === 'file' && String(part.fieldname) === 'file') fileBuffer = await part.toBuffer();
        if (part.type === 'field') fields[String(part.fieldname)] = part.value;
      }
    } else {
      const body = (request.body || {}) as any;
      for (const k of Object.keys(body || {})) fields[k] = (body as any)[k];
    }

    const sheetName = String(fields.sheetName || fields.aba || 'Analítico').trim() || 'Analítico';
    const uf = String(fields.uf || fields.estado || '').trim().toUpperCase();
    const banco = String(fields.banco || 'SINAPI').trim().slice(0, 60) || 'SINAPI';
    const insumosModoRaw = String(fields.insumosModo || fields.insumos || 'ISD').trim().toUpperCase();
    const insumosModo = insumosModoRaw === 'ICD' ? 'ICD' : insumosModoRaw === 'ISE' ? 'ISE' : 'ISD';
    const targetObraId = Number(fields.targetObraId || fields.idObra || 0);
    const obraId = Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : idObra;
    if (!canAccessObraId(obraId, scope)) return fail(reply, 403, 'Sem acesso à obra');
    const forceDataBaseMismatch =
      String(fields.forceDataBaseMismatch || fields.forceParamsMismatch || fields.force || '')
        .trim()
        .toLowerCase() === 'true' ||
      fields.forceDataBaseMismatch === true ||
      fields.forceParamsMismatch === true ||
      fields.force === true;
    const modeRaw = String(fields.mode || fields.modo || 'MISSING_ONLY').trim().toUpperCase();
    const mode = modeRaw === 'UPSERT' || modeRaw === 'REPLACE' ? 'UPSERT' : 'MISSING_ONLY';
    const importAllParsed = String(fields.importAllParsed || fields.importAll || '').toLowerCase() === 'true' || fields.importAllParsed === true || fields.importAll === true;
    const dryRun = String(fields.dryRun || '').toLowerCase() === 'true' || fields.dryRun === true;
    const onlyCodigoServico = fields.codigoServico ? String(fields.codigoServico).trim().toUpperCase() : '';
    if (!uf) return fail(reply, 422, 'UF é obrigatória');

    if (!fileBuffer) {
      const filePath = fields.filePath ? String(fields.filePath) : '';
      if (!filePath) return fail(reply, 422, 'Envie o arquivo XLSX no campo "file" (upload) ou informe "filePath" (apenas ambiente local).');
      if (process.env.VERCEL) return fail(reply, 422, 'Em produção (Vercel), não é possível ler um caminho do seu computador. Envie o arquivo por upload.');
      try {
        fileBuffer = await fs.readFile(filePath);
      } catch {
        return fail(reply, 422, 'Não foi possível ler o arquivo pelo caminho informado.');
      }
    }

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as any);
    } catch {
      return fail(reply, 422, 'Arquivo XLSX inválido ou corrompido.');
    }

    const sheetNames = (wb.worksheets || []).map((s) => String(s.name || '')).filter(Boolean);
    const getSheetByName = (name: string) => {
      const n = String(name || '').trim();
      if (!n) return null;
      const ws = wb.getWorksheet(n);
      if (ws) return ws;
      const hit = (wb.worksheets || []).find((w) => String(w.name || '').trim() === n);
      return hit || null;
    };

    const toMonthYear = (d: Date) => {
      const m = d.getMonth() + 1;
      const mm = m < 10 ? `0${m}` : String(m);
      return `${mm}/${d.getFullYear()}`;
    };

    const cellToPlain = (v: any) => {
      if (v == null) return '';
      if (v instanceof Date) return toMonthYear(v);
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
      if (typeof v === 'object') {
        const anyV = v as any;
        if (typeof anyV.text === 'string') return anyV.text;
        if (Array.isArray(anyV.richText)) return anyV.richText.map((t: any) => String(t?.text || '')).join('');
        if (anyV.formula != null) return anyV.result != null ? anyV.result : '';
        if (anyV.sharedFormula != null) return anyV.result != null ? anyV.result : '';
        if (anyV.hyperlink != null && anyV.text != null) return anyV.text;
        if (anyV.result != null) return anyV.result;
      }
      return String(v);
    };

    const worksheetToMatrix = (ws: ExcelJS.Worksheet) => {
      const rowCount = Math.max(0, Number(ws.actualRowCount || 0));
      const colCount = Math.max(0, Number(ws.actualColumnCount || 0));
      const out: any[][] = [];
      for (let r = 1; r <= rowCount; r++) {
        const row = ws.getRow(r);
        const values = Array.isArray(row.values) ? (row.values as any[]) : [];
        const rowOut: any[] = [];
        for (let c = 1; c <= colCount; c++) {
          rowOut.push(cellToPlain(values[c]));
        }
        out.push(rowOut);
      }
      return out;
    };

    const sheetWs = getSheetByName(sheetName);
    if (!sheetWs) {
      const names = sheetNames.slice(0, 30).join(', ');
      return fail(reply, 422, `Aba não encontrada: "${sheetName}". Abas disponíveis: ${names || '—'}`);
    }

    const detectDataBase = () => {
      const rx = /\b(0[1-9]|1[0-2])\/\d{4}\b/;
      const names = sheetNames.slice(0, 8);
      for (const n of names) {
        const ws = getSheetByName(n);
        if (!ws) continue;
        const m = worksheetToMatrix(ws);
        for (let i = 0; i < Math.min(30, m.length); i++) {
          const line = (m[i] || []).map((c) => String(c ?? '')).join(' ');
          const hit = line.match(rx);
          if (hit?.[0]) return hit[0];
        }
      }
      return null;
    };
    const sinapiDataBaseDetected = detectDataBase();
    const sinapiDataBaseInput = String(fields.sinapiDataBase || fields.dataBase || fields.data_base || '').trim();
    const sinapiDataBase = sinapiDataBaseInput || sinapiDataBaseDetected;
    const sinapiDataBaseKey = sinapiDataBase ? String(sinapiDataBase).trim() : '';
    const requestedPlanilhaIdRaw = fields.planilhaId ?? fields.idPlanilha ?? null;
    const requestedPlanilhaId = requestedPlanilhaIdRaw == null ? null : Number(requestedPlanilhaIdRaw);

    const normalizeSheetName = (n: string) => normalizeHeader(String(n || ''));
    const allSheets = (sheetNames || []).map((n) => ({ name: n, key: normalizeSheetName(n) }));
    const pickInsumosSheetName = () => {
      const isPreco = (k: string) => (k.includes('preco') || k.includes('precos')) && (k.includes('insumo') || k.includes('insumos'));
      const hasToken = (k: string, token: string) => k === token || k.startsWith(`${token}_`) || k.endsWith(`_${token}`) || k.includes(`_${token}_`);
      const pickByExactToken = (token: string) => allSheets.find((s) => String(s.key || '') === token)?.name || '';
      if (insumosModo === 'ISD') {
        const exact = pickByExactToken('isd');
        if (exact) return exact;
        const hit =
          allSheets.find((s) => isPreco(s.key) && hasToken(s.key, 'isd')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('sem_desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('encargos_sociais') && s.key.includes('sem_desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('sem_deson')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('sem') && s.key.includes('desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('encargos') && s.key.includes('sem') && s.key.includes('desoner'));
        return hit?.name || '';
      }
      if (insumosModo === 'ICD') {
        const exact = pickByExactToken('icd');
        if (exact) return exact;
        const hit =
          allSheets.find((s) => isPreco(s.key) && hasToken(s.key, 'icd')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('com_desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('encargos_sociais') && s.key.includes('com_desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('com') && s.key.includes('desoneracao')) ||
          allSheets.find((s) => isPreco(s.key) && s.key.includes('encargos') && s.key.includes('com') && s.key.includes('desoner'));
        return hit?.name || '';
      }
      const exact = pickByExactToken('ise');
      if (exact) return exact;
      const hit =
        allSheets.find((s) => isPreco(s.key) && hasToken(s.key, 'ise')) ||
        allSheets.find((s) => isPreco(s.key) && s.key.includes('sem_encargos')) ||
        allSheets.find((s) => isPreco(s.key) && s.key.includes('sem_encargos_sociais')) ||
        allSheets.find((s) => isPreco(s.key) && s.key.includes('sem') && s.key.includes('encargos'));
      return hit?.name || '';
    };

    const insumosSheetNameInput = String(fields.insumosSheetName || fields.abaInsumos || '').trim();
    const insumosSheetName = insumosSheetNameInput || pickInsumosSheetName();
    const insumosSheet = insumosSheetName ? getSheetByName(insumosSheetName) : null;
    if (!insumosSheet) {
      if (insumosSheetNameInput) {
        const names = sheetNames.slice(0, 30).join(', ');
        return fail(reply, 422, `Aba de insumos não encontrada: "${insumosSheetNameInput}". Abas disponíveis: ${names || '—'}`);
      }
      const sugestoes = allSheets
        .filter((s) => String(s.key || '').includes('preco') || String(s.key || '').includes('precos'))
        .slice(0, 30)
        .map((s) => String(s.name || ''))
        .filter(Boolean)
        .join(', ');
      const names = sheetNames.slice(0, 30).join(', ');
      return fail(reply, 422, `Não foi possível localizar a aba de preços de insumos para ${insumosModo}. Sugestões: ${sugestoes || '—'}. Abas disponíveis: ${names || '—'}.`);
    }

    const parseInsumos = () => {
      const m = worksheetToMatrix(insumosSheet);
      if (!Array.isArray(m) || m.length < 2) return new Map<string, { classificacao: string; descricao: string; und: string; preco: number | null }>();
      const ufLower = uf.toLowerCase();
      let headerIdx = -1;
      let rawHeader: any[] = [];
      for (let i = 0; i < Math.min(80, m.length); i++) {
        const r = Array.isArray(m[i]) ? m[i] : [];
        const keys = r.map((c) => normalizeHeader(String(c || ''))).filter(Boolean);
        if (keys.length < 4) continue;
        const hasCodigo = keys.some((k) => k.includes('codigo') && (k.includes('insumo') || k.includes('item') || k === 'codigo'));
        const hasDesc = keys.some((k) => k.includes('descricao'));
        const hasUnd = keys.some((k) => k === 'unidade' || k === 'und' || k.startsWith('unid'));
        if (hasCodigo && hasDesc && hasUnd) {
          headerIdx = i;
          rawHeader = r;
          break;
        }
      }
      if (headerIdx < 0) return new Map<string, { classificacao: string; descricao: string; und: string; preco: number | null }>();
      const headersNorm = rawHeader.map((h) => normalizeHeader(String(h || '')));
      const findCol = (cands: string[]) => {
        for (const c of cands) {
          const idx = headersNorm.findIndex((h) => h === c);
          if (idx >= 0) return idx;
        }
        for (const c of cands) {
          const idx = headersNorm.findIndex((h) => h.includes(c));
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const iClass = findCol(['classificacao']);
      const iCod = findCol(['codigo_item', 'codigo']);
      const iDesc = findCol(['descricao_item', 'descricao', 'insumo']);
      const iUnd = findCol(['und', 'unid', 'unidade']);
      let iPreco = headersNorm.findIndex((h) => h === ufLower);
      if (iPreco < 0) iPreco = headersNorm.findIndex((h) => h.endsWith(`_${ufLower}`) || h.includes(`_${ufLower}_`) || h.includes(`preco_${ufLower}`) || h.includes(`valor_${ufLower}`));
      let dataStartIdx = headerIdx + 1;
      if (iPreco < 0) {
        for (let off = 1; off <= 3; off++) {
          const r = Array.isArray(m[headerIdx + off]) ? (m[headerIdx + off] as any[]) : [];
          const rowNorm = r.map((h) => normalizeHeader(String(h || '')));
          const idx = rowNorm.findIndex((h) => h === ufLower);
          if (idx >= 0) {
            iPreco = idx;
            dataStartIdx = headerIdx + off + 1;
            break;
          }
        }
      }
      if (iPreco < 0) iPreco = findCol(['preco_unitario', 'preco', 'valor', 'custo_unitario', 'custo', 'preco_medio']);
      if (iCod < 0 || iDesc < 0 || iUnd < 0 || iPreco < 0) return new Map<string, { classificacao: string; descricao: string; und: string; preco: number | null }>();
      const out = new Map<string, { classificacao: string; descricao: string; und: string; preco: number | null }>();
      for (let i = dataStartIdx; i < m.length; i++) {
        const row = Array.isArray(m[i]) ? m[i] : [];
        const code = String(row[iCod] ?? '').trim().toUpperCase();
        if (!code) continue;
        const classificacao = iClass >= 0 ? String(row[iClass] ?? '').trim() : '';
        const desc = String(row[iDesc] ?? '').trim();
        const undV = String(row[iUnd] ?? '').trim();
        const preco = parseNumber(row[iPreco]);
        out.set(code, { classificacao, descricao: desc, und: undV, preco });
      }
      return out;
    };

    const insumosMap = parseInsumos();
    if (!insumosMap.size) return fail(reply, 422, `Não foi possível ler os preços do UF ${uf} na aba de insumos (${insumosSheetName}).`);

    const matrix = worksheetToMatrix(sheetWs);
    if (!Array.isArray(matrix) || matrix.length < 2) return fail(reply, 422, 'Aba vazia.');

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(60, matrix.length); i++) {
      const r = Array.isArray(matrix[i]) ? matrix[i] : [];
      const keys = r.map((c) => normalizeHeader(String(c || ''))).filter(Boolean);
      const hasCodigo = keys.includes('codigo') || keys.includes('codigo_item') || keys.includes('codigo_da_composicao') || keys.includes('codigo_composicao');
      const hasDesc = keys.includes('descricao') || keys.includes('descricao_item');
      const hasCoef = keys.some((k) => k.includes('coef') || k === 'quantidade');
      if (hasCodigo && hasDesc && hasCoef) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx < 0) return fail(reply, 422, 'Não foi possível identificar o cabeçalho da aba. Verifique se é a aba "Analítico".');

    const headerRow = matrix[headerRowIdx] as any[];
    const headers = headerRow.map((h) => normalizeHeader(String(h || '')));
    const findCol = (cands: string[]) => {
      for (const c of cands) {
        const idx = headers.findIndex((h) => h === c);
        if (idx >= 0) return idx;
      }
      for (const c of cands) {
        const idx = headers.findIndex((h) => h.includes(c));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const iCodigo = findCol(['codigo_da_composicao', 'codigo_composicao', 'codigo_item', 'codigo']);
    const iDescricao = findCol(['descricao_item', 'descricao']);
    const iUnd = findCol(['und', 'unid', 'unidade']);
    const iCoef = findCol(['coeficiente', 'coef', 'quantidade']);
    const iCustoUnit = findCol(['custo_unitario', 'custo_unit', 'valor_unitario', 'preco_unitario']);
    const iTipo = findCol(['tipo_item', 'tipo']);
    const iNivel = findCol(['nivel']);
    const iUf = findCol(['uf', 'estado']);

    if (iCodigo < 0 || iDescricao < 0 || iCoef < 0) return fail(reply, 422, 'Aba "Analítico" não contém as colunas mínimas (Código, Descrição, Coeficiente/Quantidade).');

    const comps = new Map<
      string,
      {
        codigo: string;
        descricao: string;
        und: string;
        itens: Array<{
          tipoItem: string;
          tipoItemSinapi?: string;
          tipoSistema?: string;
          classificacao?: string | null;
          codigoItem: string;
          banco: string | null;
          descricao: string | null;
          und: string | null;
          quantidade: number;
          valorUnitario: number | null;
        }>;
      }
    >();
    let current: string | null = null;

    for (let i = headerRowIdx + 1; i < matrix.length; i++) {
      const row = Array.isArray(matrix[i]) ? matrix[i] : [];
      const rowUf = iUf >= 0 ? String(row[iUf] || '').trim().toUpperCase() : '';
      if (uf && iUf >= 0 && rowUf && rowUf !== uf) continue;
      const codigo = String(row[iCodigo] ?? '').trim().toUpperCase();
      const descricao = String(row[iDescricao] ?? '').trim();
      const und = iUnd >= 0 ? String(row[iUnd] ?? '').trim() : '';
      const tipoRaw = iTipo >= 0 ? String(row[iTipo] ?? '').trim() : '';
      const tipoMapped = mapTipo(tipoRaw) || '';
      const nivel = iNivel >= 0 ? parseNumber(row[iNivel]) : null;
      const coef = parseNumber(row[iCoef]);
      const custoUnit = iCustoUnit >= 0 ? parseNumber(row[iCustoUnit]) : null;

      if (!codigo && !descricao) continue;

      const isHeader =
        (nivel != null && Number.isFinite(nivel) && Math.round(nivel) === 0 && codigo) ||
        (tipoMapped === 'COMPOSICAO' && codigo && (coef == null || coef === 1)) ||
        (codigo && descricao && !tipoRaw && (coef == null || !Number.isFinite(coef)));

      if (isHeader) {
        current = codigo;
        if (!comps.has(current)) comps.set(current, { codigo: current, descricao, und, itens: [] });
        continue;
      }

      if (!current) continue;
      const parent = comps.get(current) || { codigo: current, descricao: '', und: '', itens: [] };
      if (!comps.has(current)) comps.set(current, parent);
      if (!codigo) continue;

      const tipoItemSinapi = tipoMapped || (descricao.toUpperCase().includes('AUX') ? 'COMPOSICAO_AUXILIAR' : 'INSUMO');
      const quantidade = coef == null ? null : coef;
      if (quantidade == null || !Number.isFinite(quantidade)) continue;
      const isCompItem = tipoItemSinapi === 'COMPOSICAO' || tipoItemSinapi === 'COMPOSICAO_AUXILIAR';
      const ins = !isCompItem ? insumosMap.get(codigo) : null;
      const tipoExp = isCompItem ? tipoItemSinapi : (ins?.classificacao ? String(ins.classificacao).trim().slice(0, 32) : 'INSUMO');
      parent.itens.push({
        tipoItem: tipoExp,
        tipoItemSinapi,
        tipoSistema: tipoExp,
        classificacao: ins?.classificacao ? String(ins.classificacao).trim().slice(0, 80) : null,
        codigoItem: codigo,
        banco: banco || null,
        descricao: (ins?.descricao || descricao || '').trim() ? String(ins?.descricao || descricao).trim().slice(0, 255) : null,
        und: (ins?.und || und || '').trim() ? String(ins?.und || und).trim().slice(0, 40) : null,
        quantidade: Number(quantidade),
        valorUnitario: isCompItem ? null : ins?.preco == null || !Number.isFinite(ins.preco) ? null : Number(ins.preco),
      });
    }

    const parsedCodes = Array.from(comps.keys());
    if (!parsedCodes.length) return fail(reply, 422, 'Nenhuma composição foi identificada na aba. Verifique a aba, UF e estrutura.');

    const requestedPid = requestedPlanilhaId != null ? Number(requestedPlanilhaId) : NaN;
    const planilhaId = await resolvePlanilhaIdForObra(
      prisma,
      ctx.tenantId,
      obraId,
      Number.isFinite(requestedPid) && requestedPid > 0 ? requestedPid : null
    );
    const vers = (await prisma.$queryRawUnsafe(
      `
      SELECT
        data_base_sbc AS "dataBaseSbc",
        data_base_sinapi AS "dataBaseSinapi",
        bdi_servicos_sbc AS "bdiServicosSbc",
        bdi_servicos_sinapi AS "bdiServicosSinapi",
        bdi_diferenciado_sbc AS "bdiDiferenciadoSbc",
        bdi_diferenciado_sinapi AS "bdiDiferenciadoSinapi",
        enc_sociais_sem_des_sbc AS "encSociaisSemDesSbc",
        enc_sociais_sem_des_sinapi AS "encSociaisSemDesSinapi",
        desconto_sbc AS "descontoSbc",
        desconto_sinapi AS "descontoSinapi"
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      ctx.tenantId,
      obraId,
      planilhaId
    )) as any[];
    const versRow = vers?.[0] || null;
    if (!versRow) return fail(reply, 422, 'Planilha não encontrada para a obra.');
    const planilhaParams = versRow
      ? {
          dataBaseSbc: versRow.dataBaseSbc == null ? null : String(versRow.dataBaseSbc || ''),
          dataBaseSinapi: versRow.dataBaseSinapi == null ? null : String(versRow.dataBaseSinapi || ''),
          bdiServicosSbc: versRow.bdiServicosSbc == null ? null : Number(versRow.bdiServicosSbc),
          bdiServicosSinapi: versRow.bdiServicosSinapi == null ? null : Number(versRow.bdiServicosSinapi),
          bdiDiferenciadoSbc: versRow.bdiDiferenciadoSbc == null ? null : Number(versRow.bdiDiferenciadoSbc),
          bdiDiferenciadoSinapi: versRow.bdiDiferenciadoSinapi == null ? null : Number(versRow.bdiDiferenciadoSinapi),
          encSociaisSemDesSbc: versRow.encSociaisSemDesSbc == null ? null : Number(versRow.encSociaisSemDesSbc),
          encSociaisSemDesSinapi: versRow.encSociaisSemDesSinapi == null ? null : Number(versRow.encSociaisSemDesSinapi),
          descontoSbc: versRow.descontoSbc == null ? null : Number(versRow.descontoSbc),
          descontoSinapi: versRow.descontoSinapi == null ? null : Number(versRow.descontoSinapi),
        }
      : null;

    let targetCodes = new Set<string>(parsedCodes);
    if (onlyCodigoServico) {
      const code = String(onlyCodigoServico).trim().toUpperCase();
      if (!comps.has(code)) return fail(reply, 422, `O serviço ${code} não é cadastrado no SINAPI, na base informada (Data-base: ${sinapiDataBaseKey || '—'}, UF: ${uf || '—'}, ${insumosModo}).`);
      targetCodes = new Set([code]);
    } else if (!importAllParsed) {
      const serv = (await prisma.$queryRawUnsafe(
        `
        SELECT DISTINCT UPPER(COALESCE(codigo,'')) AS codigo
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1 AND id_planilha = $2 AND tipo_linha = 'SERVICO' AND COALESCE(codigo,'') <> ''
        `,
        ctx.tenantId,
        planilhaId
      )) as any[];
      const needed = new Set((serv || []).map((r: any) => String(r.codigo || '').trim()).filter(Boolean));
      targetCodes = new Set(parsedCodes.filter((c) => needed.has(c)));
    }

    const existingRows = (await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT UPPER(codigo_servico) AS codigo
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      `,
      ctx.tenantId,
      obraId,
      planilhaId
    )) as any[];
    const existing = new Set((existingRows || []).map((r: any) => String(r.codigo || '').trim()).filter(Boolean));

    const toImport = Array.from(targetCodes).filter((c) => {
      if (mode === 'MISSING_ONLY') return !existing.has(c);
      return true;
    });

    const skippedExisting = mode === 'MISSING_ONLY' ? Array.from(targetCodes).filter((c) => existing.has(c)).length : 0;
    const skippedNotInPlanilha = onlyCodigoServico ? 0 : importAllParsed ? 0 : parsedCodes.length - targetCodes.size;
    const planilhaDataBase = planilhaParams?.dataBaseSinapi ? String(planilhaParams.dataBaseSinapi || '').trim() : '';
    const sinapiDataBaseNorm = sinapiDataBase ? String(sinapiDataBase || '').trim() : '';
    const paramsMatch = planilhaDataBase && sinapiDataBaseNorm ? planilhaDataBase === sinapiDataBaseNorm : null;
    const paramsStatus = paramsMatch === true ? 'MATCH' : paramsMatch === false ? 'MISMATCH' : 'UNKNOWN';

    if (!dryRun && paramsStatus !== 'MATCH' && !forceDataBaseMismatch) {
      const detalhe =
        paramsStatus === 'UNKNOWN'
          ? `Não foi possível validar a data-base (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${sinapiDataBaseNorm || '—'}).`
          : `Data-base diferente (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${sinapiDataBaseNorm || '—'}).`;
      return fail(reply, 422, `${detalhe} Para prosseguir, marque “Forçar importação (mês-base diferente)”.`);
    }

    const totalItens = toImport.reduce((acc, code) => acc + (comps.get(code)?.itens.length || 0), 0);
    const sample = toImport.slice(0, 5).map((c) => {
      const entry = comps.get(c);
      const all = entry?.itens || [];
      const valorSemBdi = all.reduce((acc: number, it: any) => {
        const q = it?.quantidade == null ? 0 : Number(it.quantidade);
        const vu = it?.valorUnitario == null ? 0 : Number(it.valorUnitario);
        if (!Number.isFinite(q) || !Number.isFinite(vu)) return acc;
        return acc + q * vu;
      }, 0);
      const itens = onlyCodigoServico || targetCodes.size === 1 ? all : all.slice(0, 3);
      return { codigo: c, descricao: entry?.descricao ?? null, und: entry?.und ?? null, valorSemBdi: Number.isFinite(valorSemBdi) ? valorSemBdi : null, itens };
    });

    if (dryRun) {
      return ok(
        reply,
        {
          sheetName,
          uf: uf || null,
          planilhaId,
          planilhaParams,
          sinapiDetected: { dataBase: sinapiDataBase },
          paramsMatch,
          paramsStatus,
          insumosModo,
          parsedComposicoes: parsedCodes.length,
          targetComposicoes: targetCodes.size,
          toImportComposicoes: toImport.length,
          toImportItens: totalItens,
          skippedExisting,
          skippedNotInPlanilha,
          sample,
        },
        { message: 'Prévia gerada' }
      );
    }

    let importedItens = 0;
    let importedComposicoes = 0;
    await prisma.$transaction(async (tx: any) => {
      const usedInsumosCodes = new Set<string>();

      const allParsedCodesForBase = Array.from(targetCodes);
      for (const code of allParsedCodesForBase) {
        const entry = comps.get(code);
        if (!entry) continue;
        await tx.$executeRawUnsafe(
          `
          INSERT INTO sinapi_composicoes (tenant_id, uf, data_base, codigo_composicao, descricao, und)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (tenant_id, uf, data_base, codigo_composicao)
          DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
          `,
          ctx.tenantId,
          uf,
          sinapiDataBaseKey,
          entry.codigo,
          entry.descricao ? entry.descricao.slice(0, 255) : null,
          entry.und ? entry.und.slice(0, 40) : null
        );

        await tx.$executeRawUnsafe(
          `DELETE FROM sinapi_composicoes_itens WHERE tenant_id = $1 AND uf = $2 AND data_base = $3 AND UPPER(codigo_composicao) = $4`,
          ctx.tenantId,
          uf,
          sinapiDataBaseKey,
          String(entry.codigo).trim().toUpperCase()
        );

        const itens = entry.itens || [];
        const chunkSize = 500;
        for (let start = 0; start < itens.length; start += chunkSize) {
          const chunk = itens.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const base = [
                ctx.tenantId,
                uf,
                sinapiDataBaseKey,
                entry.codigo,
                String(r.tipoItem || 'INSUMO').trim().toUpperCase().slice(0, 32) || 'INSUMO',
                String(r.codigoItem || '').trim().slice(0, 80),
                toDec(r.quantidade),
              ];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_composicoes_itens (tenant_id, uf, data_base, codigo_composicao, tipo_item, codigo_item, coeficiente)
            VALUES ${values}
            `,
            ...params
          );
        }
        for (const it of itens) {
          const t = String(it.tipoItem || '').toUpperCase();
          if (t !== 'COMPOSICAO' && t !== 'COMPOSICAO_AUXILIAR') usedInsumosCodes.add(String(it.codigoItem || '').trim().toUpperCase());
        }
      }

      if (usedInsumosCodes.size) {
        const codes = Array.from(usedInsumosCodes);
        const chunkSize = 500;
        for (let start = 0; start < codes.length; start += chunkSize) {
          const chunk = codes.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((code) => {
              const ins = insumosMap.get(code);
              const base = [
                ctx.tenantId,
                uf,
                sinapiDataBaseKey,
                insumosModo,
                code,
                ins?.descricao ? String(ins.descricao).trim().slice(0, 255) : null,
                ins?.und ? String(ins.und).trim().slice(0, 40) : null,
                ins?.preco == null ? null : toDec(ins.preco),
              ];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_insumos (tenant_id, uf, data_base, tipo_preco, codigo_item, descricao, und, preco_unitario)
            VALUES ${values}
            ON CONFLICT (tenant_id, uf, data_base, tipo_preco, codigo_item)
            DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, preco_unitario = EXCLUDED.preco_unitario, atualizado_em = NOW()
            `,
            ...params
          );
        }
      }

      const importSet = new Set(toImport.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean));
      const servicosMeta = new Map<string, { descricao: string | null; und: string | null }>();
      for (const code of importSet) {
        const entry = comps.get(code);
        if (!entry) continue;
        servicosMeta.set(code, {
          descricao: entry.descricao ? String(entry.descricao).trim().slice(0, 255) : null,
          und: entry.und ? String(entry.und).trim().slice(0, 40) : null,
        });
        for (const it of entry.itens || []) {
          const t = String((it as any).tipoItemSinapi || '').trim().toUpperCase();
          if (t !== 'COMPOSICAO' && t !== 'COMPOSICAO_AUXILIAR') continue;
          const child = String(it.codigoItem || '').trim().toUpperCase();
          if (!child) continue;
          if (!servicosMeta.has(child)) {
            servicosMeta.set(child, {
              descricao: it.descricao ? String(it.descricao).trim().slice(0, 255) : null,
              und: it.und ? String(it.und).trim().slice(0, 40) : null,
            });
          }
        }
      }

      if (servicosMeta.size) {
        const entries = Array.from(servicosMeta.entries());
        const params: any[] = [];
        let p = 1;
        const values = entries
          .map(([codigo, meta]) => {
            const base = [ctx.tenantId, sinapiDataBaseKey, codigo, meta.descricao ?? null, meta.und ?? null];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');
        await tx.$executeRawUnsafe(
          `
          INSERT INTO sinapi_servicos_base (tenant_id, data_base, codigo_servico, descricao, und)
          VALUES ${values}
          ON CONFLICT (tenant_id, data_base, codigo_servico)
          DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
          `,
          ...params
        );
      }

      const servRows = servicosMeta.size
        ? ((await tx.$queryRawUnsafe(
            `
            SELECT id_serv_sinapi AS "id", codigo_servico AS "codigo"
            FROM sinapi_servicos_base
            WHERE tenant_id = $1 AND data_base = $2 AND codigo_servico = ANY($3)
            `,
            ctx.tenantId,
            sinapiDataBaseKey,
            Array.from(servicosMeta.keys())
          )) as any[])
        : [];
      const servByCodigo = new Map<string, number>();
      for (const r of servRows || []) servByCodigo.set(String(r.codigo || '').trim().toUpperCase(), Number(r.id));

      const insumosMeta = new Map<string, { classificacao: string | null; descricao: string | null; und: string | null; pu: number | null }>();
      for (const code of importSet) {
        const entry = comps.get(code);
        if (!entry) continue;
        for (const it of entry.itens || []) {
          const t = String((it as any).tipoItemSinapi || '').trim().toUpperCase();
          if (t === 'COMPOSICAO' || t === 'COMPOSICAO_AUXILIAR') continue;
          const insCode = String(it.codigoItem || '').trim().toUpperCase();
          if (!insCode) continue;
          const ins = insumosMap.get(insCode);
          insumosMeta.set(insCode, {
            classificacao: ins?.classificacao ? String(ins.classificacao).trim().slice(0, 80) : null,
            descricao: ins?.descricao ? String(ins.descricao).trim().slice(0, 255) : null,
            und: ins?.und ? String(ins.und).trim().slice(0, 40) : null,
            pu: ins?.preco == null ? null : Number(ins.preco),
          });
        }
      }

      if (insumosMeta.size) {
        const entries = Array.from(insumosMeta.entries());
        const params: any[] = [];
        let p = 1;
        const values = entries
          .map(([codigo, meta]) => {
            const base = [ctx.tenantId, sinapiDataBaseKey, insumosModo, meta.classificacao ?? null, codigo, meta.descricao ?? null, meta.und ?? null];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');
        await tx.$executeRawUnsafe(
          `
          INSERT INTO sinapi_insumos_base (tenant_id, data_base, tipo_preco, classificacao, codigo_insumo, descricao, und)
          VALUES ${values}
          ON CONFLICT (tenant_id, data_base, tipo_preco, codigo_insumo)
          DO UPDATE SET classificacao = EXCLUDED.classificacao, descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
          `,
          ...params
        );
      }

      const insRows = insumosMeta.size
        ? ((await tx.$queryRawUnsafe(
            `
            SELECT id_insumo_sinapi AS "id", codigo_insumo AS "codigo"
            FROM sinapi_insumos_base
            WHERE tenant_id = $1 AND data_base = $2 AND tipo_preco = $3 AND codigo_insumo = ANY($4)
            `,
            ctx.tenantId,
            sinapiDataBaseKey,
            insumosModo,
            Array.from(insumosMeta.keys())
          )) as any[])
        : [];
      const insByCodigo = new Map<string, number>();
      for (const r of insRows || []) insByCodigo.set(String(r.codigo || '').trim().toUpperCase(), Number(r.id));

      if (insumosMeta.size) {
        const entries = Array.from(insumosMeta.entries())
          .map(([codigo, meta]) => {
            const idInsumo = insByCodigo.get(codigo);
            return idInsumo ? { idInsumo, pu: meta.pu } : null;
          })
          .filter(Boolean) as Array<{ idInsumo: number; pu: number | null }>;
        if (entries.length) {
          const params: any[] = [];
          let p = 1;
          const values = entries
            .map((e) => {
              const base = [ctx.tenantId, e.idInsumo, uf, e.pu == null ? null : toDec(e.pu)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_insumos_pu (tenant_id, id_insumo_sinapi, uf, pu)
            VALUES ${values}
            ON CONFLICT (tenant_id, id_insumo_sinapi, uf)
            DO UPDATE SET pu = EXCLUDED.pu, atualizado_em = NOW()
            `,
            ...params
          );
        }
      }

      const puRows = insumosMeta.size
        ? ((await tx.$queryRawUnsafe(
            `
            SELECT id_pu AS "id", id_insumo_sinapi AS "idInsumo"
            FROM sinapi_insumos_pu
            WHERE tenant_id = $1 AND uf = $2 AND id_insumo_sinapi = ANY($3)
            `,
            ctx.tenantId,
            uf,
            Array.from(insByCodigo.values())
          )) as any[])
        : [];
      const puByInsumoId = new Map<number, number>();
      for (const r of puRows || []) puByInsumoId.set(Number(r.idInsumo), Number(r.id));

      for (const code of importSet) {
        const parentId = servByCodigo.get(code);
        if (!parentId) continue;
        const entry = comps.get(code);
        if (!entry) continue;
        await tx.$executeRawUnsafe(
          `DELETE FROM sinapi_composicoes_base WHERE tenant_id = $1 AND uf = $2 AND data_base = $3 AND tipo_preco = $4 AND id_serv_sinapi = $5`,
          ctx.tenantId,
          uf,
          sinapiDataBaseKey,
          insumosModo,
          parentId
        );
        const itens = entry.itens || [];
        if (!itens.length) continue;
        const chunkSize = 500;
        for (let start = 0; start < itens.length; start += chunkSize) {
          const chunk = itens.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((it: any) => {
              const tipoSinapi = String(it.tipoItemSinapi || '').trim().toUpperCase().slice(0, 32) || 'INSUMO';
              const codigoItem = String(it.codigoItem || '').trim().toUpperCase().slice(0, 80);
              const coef = it.quantidade == null ? null : Number(it.quantidade);
              if (!codigoItem || coef == null) return null;
              const isInsumo = tipoSinapi !== 'COMPOSICAO' && tipoSinapi !== 'COMPOSICAO_AUXILIAR';
              const idInsumo = isInsumo ? insByCodigo.get(codigoItem) || null : null;
              const idPu = idInsumo ? puByInsumoId.get(idInsumo) || null : null;
              const ins = isInsumo ? insumosMap.get(codigoItem) : null;
              const desc = isInsumo ? (ins?.descricao ? String(ins.descricao).trim().slice(0, 255) : null) : it.descricao ? String(it.descricao).trim().slice(0, 255) : null;
              const undV = isInsumo ? (ins?.und ? String(ins.und).trim().slice(0, 40) : null) : it.und ? String(it.und).trim().slice(0, 40) : null;
              const base = [ctx.tenantId, uf, sinapiDataBaseKey, insumosModo, parentId, idInsumo, idPu, tipoSinapi, codigoItem, desc, undV, toDec(coef)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .filter(Boolean)
            .join(',');
          if (!values) continue;
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_composicoes_base
              (tenant_id, uf, data_base, tipo_preco, id_serv_sinapi, id_insumo_sinapi, id_pu, tipo_item, codigo_item, descricao, und, coeficiente)
            VALUES ${values}
            `,
            ...params
          );
        }
      }

      for (const code of toImport) {
        const entry = comps.get(code);
        const itens = entry?.itens || [];
        if (!itens.length) continue;
      if (mode === 'UPSERT') {
        await tx.$executeRawUnsafe(
          `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4`,
          ctx.tenantId,
          obraId,
          planilhaId,
          code
        );
        }

        const chunkSize = 500;
        const normalized = itens
          .map((r) => {
            const tipoItem = String(r.tipoItem || 'INSUMO').trim().toUpperCase().slice(0, 32) || 'INSUMO';
            const codigoItem = String(r.codigoItem || '').trim().slice(0, 80);
            const isCompItem = tipoItem === 'COMPOSICAO' || tipoItem === 'COMPOSICAO_AUXILIAR';
            const ins = !isCompItem ? insumosMap.get(String(codigoItem || '').trim().toUpperCase()) : null;
            const compRef = isCompItem ? comps.get(String(codigoItem || '').trim().toUpperCase()) : null;
            return {
            etapa: '',
            tipoItem,
            codigoItem,
            banco: banco || null,
            descricao: isCompItem ? (compRef?.descricao ? String(compRef.descricao).trim().slice(0, 255) : null) : ins?.descricao ? String(ins.descricao).trim().slice(0, 255) : r.descricao ? String(r.descricao).trim().slice(0, 255) : null,
            und: isCompItem ? (compRef?.und ? String(compRef.und).trim().slice(0, 40) : null) : ins?.und ? String(ins.und).trim().slice(0, 40) : r.und ? String(r.und).trim().slice(0, 40) : null,
            quantidade: r.quantidade == null ? null : toDec(r.quantidade),
            valorUnitario: isCompItem ? null : ins?.preco == null ? null : toDec(ins.preco),
            perda: 0,
            codigoCentroCusto: null,
          };
          })
          .filter((i) => i.codigoItem && i.quantidade != null);

        for (let start = 0; start < normalized.length; start += chunkSize) {
          const chunk = normalized.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const base = [ctx.tenantId, obraId, planilhaId, code, r.etapa, r.tipoItem, r.codigoItem, r.banco, r.descricao, r.und, r.quantidade, r.valorUnitario, r.perda, r.codigoCentroCusto];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_composicoes_itens
              (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
            VALUES
              ${values}
            ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_servico, (COALESCE(etapa,'')), tipo_item, codigo_item)
            DO UPDATE SET
              banco = EXCLUDED.banco,
              descricao = EXCLUDED.descricao,
              und = EXCLUDED.und,
              quantidade = EXCLUDED.quantidade,
              valor_unitario = EXCLUDED.valor_unitario,
              perda_percentual = EXCLUDED.perda_percentual,
              codigo_centro_custo = EXCLUDED.codigo_centro_custo,
              atualizado_em = NOW()
            `,
            ...params
          );
          importedItens += chunk.length;
        }
        importedComposicoes++;
      }
    }, { timeout: 120000, maxWait: 20000 });

    return ok(
      reply,
      {
        sheetName,
        uf: uf || null,
        planilhaId,
        planilhaParams,
        sinapiDetected: { dataBase: sinapiDataBase },
        paramsMatch,
        insumosModo,
        importedComposicoes,
        importedItens,
        skippedExisting,
        skippedNotInPlanilha,
      },
      { message: 'Importação SINAPI concluída' }
    );
  });

  server.post('/engenharia/obras/:id/planilha/sinapi/import-analitico-parsed', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    await ensureSinapiBaseTables(prisma);

    const body = (request.body || {}) as any;
    const parsed = z
      .object({
        uf: z.string().min(2),
        insumosModo: z.enum(['ISD', 'ICD', 'ISE']).default('ISD'),
        codigoServico: z.string().min(1),
        planilhaId: z.coerce.number().int().positive().optional().nullable(),
        sinapiDataBase: z.string().optional().nullable(),
        banco: z.string().optional().nullable(),
        targetObraId: z.coerce.number().int().positive().optional().nullable(),
        mode: z.enum(['UPSERT', 'MISSING_ONLY']).optional().default('UPSERT'),
        dryRun: z.boolean().optional().default(false),
        forceDataBaseMismatch: z.boolean().optional().default(false),
        composicao: z
          .object({
            codigo: z.string().min(1),
            descricao: z.string().optional().nullable(),
            und: z.string().optional().nullable(),
          })
          .optional(),
        itens: z
          .array(
            z.object({
              codigoItem: z.string().min(1),
              coeficiente: z.number(),
              tipoItemSinapi: z.string().optional().nullable(),
              descricaoSinapi: z.string().optional().nullable(),
              undSinapi: z.string().optional().nullable(),
              insumoClassificacao: z.string().optional().nullable(),
              insumoDescricao: z.string().optional().nullable(),
              insumoUnd: z.string().optional().nullable(),
              insumoPu: z.number().optional().nullable(),
              expTipo: z.string().optional().nullable(),
              expCodigo: z.string().optional().nullable(),
              expDescricao: z.string().optional().nullable(),
              expUnd: z.string().optional().nullable(),
              expValorUnitario: z.number().optional().nullable(),
            })
          )
          .min(1),
      })
      .parse(body);

    const targetObraId = parsed.targetObraId != null ? Number(parsed.targetObraId) : 0;
    const obraId = Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : idObra;
    if (!canAccessObraId(obraId, scope)) return fail(reply, 403, 'Sem acesso à obra');

    const uf = String(parsed.uf || '').trim().toUpperCase();
    const insumosModo = parsed.insumosModo;
    const codigoServico = String(parsed.codigoServico || '').trim().toUpperCase();
    const banco = String(parsed.banco || 'SINAPI').trim().slice(0, 60) || 'SINAPI';
    const mode = parsed.mode;
    const dryRun = Boolean(parsed.dryRun);
    const forceDataBaseMismatch = Boolean(parsed.forceDataBaseMismatch);
    if (!uf) return fail(reply, 422, 'UF é obrigatória');
    if (!codigoServico) return fail(reply, 422, 'codigoServico é obrigatório');

    const planilhaId = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, obraId, parsed.planilhaId);
    const vers = (await prisma.$queryRawUnsafe(
      `
      SELECT
        data_base_sbc AS "dataBaseSbc",
        data_base_sinapi AS "dataBaseSinapi",
        bdi_servicos_sbc AS "bdiServicosSbc",
        bdi_servicos_sinapi AS "bdiServicosSinapi",
        bdi_diferenciado_sbc AS "bdiDiferenciadoSbc",
        bdi_diferenciado_sinapi AS "bdiDiferenciadoSinapi",
        enc_sociais_sem_des_sbc AS "encSociaisSemDesSbc",
        enc_sociais_sem_des_sinapi AS "encSociaisSemDesSinapi",
        desconto_sbc AS "descontoSbc",
        desconto_sinapi AS "descontoSinapi"
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      ctx.tenantId,
      obraId,
      planilhaId
    )) as any[];
    const versRow = vers?.[0] || null;
    if (!versRow) return fail(reply, 422, 'Planilha não encontrada para a obra.');
    const planilhaParams = {
      dataBaseSbc: versRow.dataBaseSbc == null ? null : String(versRow.dataBaseSbc || ''),
      dataBaseSinapi: versRow.dataBaseSinapi == null ? null : String(versRow.dataBaseSinapi || ''),
      bdiServicosSbc: versRow.bdiServicosSbc == null ? null : Number(versRow.bdiServicosSbc),
      bdiServicosSinapi: versRow.bdiServicosSinapi == null ? null : Number(versRow.bdiServicosSinapi),
      bdiDiferenciadoSbc: versRow.bdiDiferenciadoSbc == null ? null : Number(versRow.bdiDiferenciadoSbc),
      bdiDiferenciadoSinapi: versRow.bdiDiferenciadoSinapi == null ? null : Number(versRow.bdiDiferenciadoSinapi),
      encSociaisSemDesSbc: versRow.encSociaisSemDesSbc == null ? null : Number(versRow.encSociaisSemDesSbc),
      encSociaisSemDesSinapi: versRow.encSociaisSemDesSinapi == null ? null : Number(versRow.encSociaisSemDesSinapi),
      descontoSbc: versRow.descontoSbc == null ? null : Number(versRow.descontoSbc),
      descontoSinapi: versRow.descontoSinapi == null ? null : Number(versRow.descontoSinapi),
    };

    const planilhaDataBase = planilhaParams?.dataBaseSinapi ? String(planilhaParams.dataBaseSinapi || '').trim() : '';
    const sinapiDataBaseNorm = parsed.sinapiDataBase ? String(parsed.sinapiDataBase || '').trim() : '';
    const paramsMatch = planilhaDataBase && sinapiDataBaseNorm ? planilhaDataBase === sinapiDataBaseNorm : null;
    const paramsStatus = paramsMatch === true ? 'MATCH' : paramsMatch === false ? 'MISMATCH' : 'UNKNOWN';

    if (!dryRun && paramsStatus !== 'MATCH' && !forceDataBaseMismatch) {
      const detalhe =
        paramsStatus === 'UNKNOWN'
          ? `Não foi possível validar a data-base (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${sinapiDataBaseNorm || '—'}).`
          : `Data-base diferente (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${sinapiDataBaseNorm || '—'}).`;
      return fail(reply, 422, `${detalhe} Para prosseguir, marque “Forçar importação (mês-base diferente)”.`);
    }

    const itens = (parsed.itens || []).map((r) => {
      const codigoItem = String(r.codigoItem || '').trim().toUpperCase().slice(0, 80);
      const tipoItemSinapi = String(r.tipoItemSinapi || '').trim().toUpperCase().slice(0, 32);
      const expTipo = String(r.expTipo || '').trim().toUpperCase().slice(0, 32);
      const expCodigo = String(r.expCodigo || '').trim().toUpperCase().slice(0, 80);
      return {
        codigoItem,
        coeficiente: r.coeficiente,
        tipoItemSinapi: tipoItemSinapi || (normalizeHeader(tipoItemSinapi).includes('insumo') ? 'INSUMO' : 'COMPOSICAO'),
        descricaoSinapi: r.descricaoSinapi == null ? null : String(r.descricaoSinapi || '').trim().slice(0, 255),
        undSinapi: r.undSinapi == null ? null : String(r.undSinapi || '').trim().slice(0, 40),
        insumoClassificacao: r.insumoClassificacao == null ? null : String(r.insumoClassificacao || '').trim().slice(0, 80),
        insumoDescricao: r.insumoDescricao == null ? null : String(r.insumoDescricao || '').trim().slice(0, 255),
        insumoUnd: r.insumoUnd == null ? null : String(r.insumoUnd || '').trim().slice(0, 40),
        insumoPu: r.insumoPu == null ? null : Number(r.insumoPu),
        expTipo: expTipo || (normalizeHeader(tipoItemSinapi).includes('insumo') ? 'INSUMO' : 'COMPOSICAO'),
        expCodigo: expCodigo || codigoItem,
        expDescricao: r.expDescricao == null ? null : String(r.expDescricao || '').trim().slice(0, 255),
        expUnd: r.expUnd == null ? null : String(r.expUnd || '').trim().slice(0, 40),
        expValorUnitario: r.expValorUnitario == null ? null : Number(r.expValorUnitario),
      };
    });
    const totalItens = itens.length;
    const valorSemBdi = itens.reduce((acc, it: any) => {
      const q = it?.coeficiente == null ? 0 : Number(it.coeficiente);
      const vu = it?.expValorUnitario == null ? (it?.insumoPu == null ? 0 : Number(it.insumoPu)) : Number(it.expValorUnitario);
      if (!Number.isFinite(q) || !Number.isFinite(vu)) return acc;
      return acc + q * vu;
    }, 0);
    const sample = [
      {
        codigo: codigoServico,
        descricao: parsed.composicao?.descricao == null ? null : String(parsed.composicao.descricao || '').trim().slice(0, 255),
        und: parsed.composicao?.und == null ? null : String(parsed.composicao.und || '').trim().slice(0, 40),
        valorSemBdi: Number.isFinite(valorSemBdi) ? valorSemBdi : null,
        itens: itens.slice(0, 3).map((x) => ({
          tipoItem: x.tipoItemSinapi,
          tipoItemSinapi: x.tipoItemSinapi,
          tipoSistema: computeTipoExpert({ tipoItemSinapi: x.tipoItemSinapi, classificacaoSinapi: x.insumoClassificacao }),
          classificacao: x.insumoClassificacao ?? null,
          codigoItem: x.expCodigo,
          banco: banco || null,
          descricao: x.expDescricao ?? x.insumoDescricao ?? x.descricaoSinapi ?? null,
          und: x.expUnd ?? x.insumoUnd ?? x.undSinapi ?? null,
          quantidade: x.coeficiente,
          valorUnitario: x.expValorUnitario ?? x.insumoPu ?? null,
        })),
      },
    ];

    if (dryRun) {
      return ok(
        reply,
        {
          sheetName: 'Analítico (local)',
          uf: uf || null,
          planilhaId,
          planilhaParams,
          sinapiDetected: { dataBase: sinapiDataBaseNorm || null },
          paramsMatch,
          paramsStatus,
          insumosModo,
          parsedComposicoes: 1,
          targetComposicoes: 1,
          toImportComposicoes: 1,
          toImportItens: totalItens,
          skippedExisting: 0,
          skippedNotInPlanilha: 0,
          sample,
        },
        { message: 'Prévia gerada' }
      );
    }

    let importedItens = 0;
    await prisma.$transaction(async (tx: any) => {
      const compCodigo = parsed.composicao?.codigo ? String(parsed.composicao.codigo).trim().toUpperCase() : codigoServico;
      const compDesc = parsed.composicao?.descricao == null ? null : String(parsed.composicao.descricao || '').trim().slice(0, 255);
      const compUnd = parsed.composicao?.und == null ? null : String(parsed.composicao.und || '').trim().slice(0, 40);

      await tx.$executeRawUnsafe(
        `
        INSERT INTO sinapi_composicoes (tenant_id, uf, data_base, codigo_composicao, descricao, und)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, uf, data_base, codigo_composicao)
        DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
        `,
        ctx.tenantId,
        uf,
        sinapiDataBaseNorm,
        compCodigo,
        compDesc,
        compUnd
      );

      await tx.$executeRawUnsafe(
        `DELETE FROM sinapi_composicoes_itens WHERE tenant_id = $1 AND uf = $2 AND data_base = $3 AND UPPER(codigo_composicao) = $4`,
        ctx.tenantId,
        uf,
        sinapiDataBaseNorm,
        compCodigo
      );

      if (itens.length) {
        const chunkSize = 500;
        for (let start = 0; start < itens.length; start += chunkSize) {
          const chunk = itens.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const tipoItem = normalizeHeader(r.tipoItemSinapi).includes('insumo') ? 'INSUMO' : 'COMPOSICAO';
              const base = [ctx.tenantId, uf, sinapiDataBaseNorm, compCodigo, tipoItem, r.codigoItem, toDec(r.coeficiente)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_composicoes_itens (tenant_id, uf, data_base, codigo_composicao, tipo_item, codigo_item, coeficiente)
            VALUES ${values}
            `,
            ...params
          );
        }
      }

      const usedInsumos = new Map<string, { descricao: string | null; und: string | null; preco: number | null }>();
      for (const it of itens) {
        const t = normalizeHeader(it.tipoItemSinapi);
        if (!t.includes('insumo')) continue;
        if (!it.codigoItem) continue;
        usedInsumos.set(it.codigoItem, {
          descricao: it.insumoDescricao ?? it.descricaoSinapi ?? null,
          und: it.insumoUnd ?? it.undSinapi ?? null,
          preco: it.insumoPu ?? it.expValorUnitario ?? null,
        });
      }

      if (usedInsumos.size) {
        const codes = Array.from(usedInsumos.keys());
        const chunkSize = 500;
        for (let start = 0; start < codes.length; start += chunkSize) {
          const chunk = codes.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((code) => {
              const ins = usedInsumos.get(code);
              const base = [ctx.tenantId, uf, sinapiDataBaseNorm, insumosModo, code, ins?.descricao ?? null, ins?.und ?? null, ins?.preco == null ? null : toDec(ins.preco)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_insumos (tenant_id, uf, data_base, tipo_preco, codigo_item, descricao, und, preco_unitario)
            VALUES ${values}
            ON CONFLICT (tenant_id, uf, data_base, tipo_preco, codigo_item)
            DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, preco_unitario = EXCLUDED.preco_unitario, atualizado_em = NOW()
            `,
            ...params
          );
        }
      }

      if (mode === 'UPSERT') {
        await tx.$executeRawUnsafe(
          `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4`,
          ctx.tenantId,
          obraId,
          planilhaId,
          codigoServico
        );
      }

      if (itens.length) {
        const normalized = itens
          .map((r) => ({
            etapa: '',
            tipoItem: computeTipoExpert({ tipoItemSinapi: r.tipoItemSinapi, classificacaoSinapi: r.insumoClassificacao }),
            codigoItem: r.expCodigo,
            banco: banco || null,
            descricao: (r.expDescricao ?? r.insumoDescricao ?? r.descricaoSinapi) ?? null,
            und: (r.expUnd ?? r.insumoUnd ?? r.undSinapi) ?? null,
            quantidade: toDec(r.coeficiente),
            valorUnitario: r.expValorUnitario == null ? (r.insumoPu == null ? null : toDec(r.insumoPu)) : toDec(r.expValorUnitario),
            perda: 0,
            codigoCentroCusto: null,
          }))
          .filter((i) => i.codigoItem && i.quantidade != null);

        const chunkSize = 500;
        for (let start = 0; start < normalized.length; start += chunkSize) {
          const chunk = normalized.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const base = [ctx.tenantId, obraId, planilhaId, codigoServico, r.etapa, r.tipoItem, r.codigoItem, r.banco, r.descricao, r.und, r.quantidade, r.valorUnitario, r.perda, r.codigoCentroCusto];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_composicoes_itens
              (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
            VALUES
              ${values}
            ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_servico, (COALESCE(etapa,'')), tipo_item, codigo_item)
            DO UPDATE SET
              banco = EXCLUDED.banco,
              descricao = EXCLUDED.descricao,
              und = EXCLUDED.und,
              quantidade = EXCLUDED.quantidade,
              valor_unitario = EXCLUDED.valor_unitario,
              perda_percentual = EXCLUDED.perda_percentual,
              codigo_centro_custo = EXCLUDED.codigo_centro_custo,
              atualizado_em = NOW()
            `,
            ...params
          );
          importedItens += chunk.length;
        }
      }

      const servicosMeta = new Map<string, { descricao: string | null; und: string | null }>();
      servicosMeta.set(compCodigo, { descricao: compDesc, und: compUnd });
      for (const it of itens) {
        const t = normalizeHeader(it.tipoItemSinapi);
        if (!t.includes('compos')) continue;
        const code = String(it.codigoItem || '').trim().toUpperCase();
        if (!code) continue;
        servicosMeta.set(code, {
          descricao: it.descricaoSinapi ?? null,
          und: it.undSinapi ?? null,
        });
      }

      if (servicosMeta.size) {
        const entries = Array.from(servicosMeta.entries());
        const params: any[] = [];
        let p = 1;
        const values = entries
          .map(([codigo, meta]) => {
            const base = [ctx.tenantId, sinapiDataBaseNorm, codigo, meta.descricao ?? null, meta.und ?? null];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');
        await tx.$executeRawUnsafe(
          `
          INSERT INTO sinapi_servicos_base (tenant_id, data_base, codigo_servico, descricao, und)
          VALUES ${values}
          ON CONFLICT (tenant_id, data_base, codigo_servico)
          DO UPDATE SET descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
          `,
          ...params
        );
      }

      const servRows = (await tx.$queryRawUnsafe(
        `
        SELECT id_serv_sinapi AS "id", codigo_servico AS "codigo"
        FROM sinapi_servicos_base
        WHERE tenant_id = $1 AND data_base = $2 AND codigo_servico = ANY($3)
        `,
        ctx.tenantId,
        sinapiDataBaseNorm,
        Array.from(servicosMeta.keys())
      )) as any[];
      const servByCodigo = new Map<string, number>();
      for (const r of servRows || []) servByCodigo.set(String(r.codigo || '').trim().toUpperCase(), Number(r.id));
      const parentServId = servByCodigo.get(compCodigo) || null;
      if (!parentServId) return;

      const insumosMeta = new Map<string, { classificacao: string | null; descricao: string | null; und: string | null; pu: number | null }>();
      for (const it of itens) {
        const t = normalizeHeader(it.tipoItemSinapi);
        if (!t.includes('insumo')) continue;
        const code = String(it.codigoItem || '').trim().toUpperCase();
        if (!code) continue;
        insumosMeta.set(code, {
          classificacao: it.insumoClassificacao ?? null,
          descricao: it.insumoDescricao ?? null,
          und: it.insumoUnd ?? null,
          pu: it.insumoPu == null ? null : Number(it.insumoPu),
        });
      }

      if (insumosMeta.size) {
        const entries = Array.from(insumosMeta.entries());
        const params: any[] = [];
        let p = 1;
        const values = entries
          .map(([codigo, meta]) => {
            const base = [ctx.tenantId, sinapiDataBaseNorm, insumosModo, meta.classificacao ?? null, codigo, meta.descricao ?? null, meta.und ?? null];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
          })
          .join(',');
        await tx.$executeRawUnsafe(
          `
          INSERT INTO sinapi_insumos_base (tenant_id, data_base, tipo_preco, classificacao, codigo_insumo, descricao, und)
          VALUES ${values}
          ON CONFLICT (tenant_id, data_base, tipo_preco, codigo_insumo)
          DO UPDATE SET classificacao = EXCLUDED.classificacao, descricao = EXCLUDED.descricao, und = EXCLUDED.und, atualizado_em = NOW()
          `,
          ...params
        );
      }

      const insRows = insumosMeta.size
        ? ((await tx.$queryRawUnsafe(
            `
            SELECT id_insumo_sinapi AS "id", codigo_insumo AS "codigo"
            FROM sinapi_insumos_base
            WHERE tenant_id = $1 AND data_base = $2 AND tipo_preco = $3 AND codigo_insumo = ANY($4)
            `,
            ctx.tenantId,
            sinapiDataBaseNorm,
            insumosModo,
            Array.from(insumosMeta.keys())
          )) as any[])
        : [];
      const insByCodigo = new Map<string, number>();
      for (const r of insRows || []) insByCodigo.set(String(r.codigo || '').trim().toUpperCase(), Number(r.id));

      if (insumosMeta.size) {
        const entries = Array.from(insumosMeta.entries())
          .map(([codigo, meta]) => {
            const idInsumo = insByCodigo.get(codigo);
            return idInsumo ? { idInsumo, pu: meta.pu } : null;
          })
          .filter(Boolean) as Array<{ idInsumo: number; pu: number | null }>;
        if (entries.length) {
          const params: any[] = [];
          let p = 1;
          const values = entries
            .map((e) => {
              const base = [ctx.tenantId, e.idInsumo, uf, e.pu == null ? null : toDec(e.pu)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_insumos_pu (tenant_id, id_insumo_sinapi, uf, pu)
            VALUES ${values}
            ON CONFLICT (tenant_id, id_insumo_sinapi, uf)
            DO UPDATE SET pu = EXCLUDED.pu, atualizado_em = NOW()
            `,
            ...params
          );
        }
      }

      const puRows = insumosMeta.size
        ? ((await tx.$queryRawUnsafe(
            `
            SELECT id_pu AS "id", id_insumo_sinapi AS "idInsumo"
            FROM sinapi_insumos_pu
            WHERE tenant_id = $1 AND uf = $2 AND id_insumo_sinapi = ANY($3)
            `,
            ctx.tenantId,
            uf,
            Array.from(insByCodigo.values())
          )) as any[])
        : [];
      const puByInsumoId = new Map<number, number>();
      for (const r of puRows || []) puByInsumoId.set(Number(r.idInsumo), Number(r.id));

      await tx.$executeRawUnsafe(
        `DELETE FROM sinapi_composicoes_base WHERE tenant_id = $1 AND uf = $2 AND data_base = $3 AND tipo_preco = $4 AND id_serv_sinapi = $5`,
        ctx.tenantId,
        uf,
        sinapiDataBaseNorm,
        insumosModo,
        parentServId
      );

      const compEntries = itens
        .map((it) => {
          const tNorm = normalizeHeader(it.tipoItemSinapi);
          const isInsumo = tNorm.includes('insumo');
          const idInsumo = isInsumo ? insByCodigo.get(String(it.codigoItem || '').trim().toUpperCase()) || null : null;
          const idPu = idInsumo ? puByInsumoId.get(idInsumo) || null : null;
          return {
            tipoItem: it.tipoItemSinapi || (isInsumo ? 'INSUMO' : 'COMPOSICAO'),
            codigoItem: String(it.codigoItem || '').trim().toUpperCase(),
            descricao: (isInsumo ? it.insumoDescricao : it.descricaoSinapi) ?? null,
            und: (isInsumo ? it.insumoUnd : it.undSinapi) ?? null,
            coeficiente: it.coeficiente,
            idInsumo,
            idPu,
          };
        })
        .filter((x) => x.codigoItem && x.coeficiente != null);

      if (compEntries.length) {
        const chunkSize = 500;
        for (let start = 0; start < compEntries.length; start += chunkSize) {
          const chunk = compEntries.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
              const base = [
                ctx.tenantId,
                uf,
                sinapiDataBaseNorm,
                insumosModo,
                parentServId,
                r.idInsumo,
                r.idPu,
                String(r.tipoItem || '').trim().toUpperCase().slice(0, 32),
                String(r.codigoItem || '').trim().toUpperCase().slice(0, 80),
                r.descricao == null ? null : String(r.descricao || '').trim().slice(0, 255),
                r.und == null ? null : String(r.und || '').trim().slice(0, 40),
                toDec(r.coeficiente),
              ];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');
          await tx.$executeRawUnsafe(
            `
            INSERT INTO sinapi_composicoes_base
              (tenant_id, uf, data_base, tipo_preco, id_serv_sinapi, id_insumo_sinapi, id_pu, tipo_item, codigo_item, descricao, und, coeficiente)
            VALUES ${values}
            `,
            ...params
          );
        }
      }
    }, { timeout: 120000, maxWait: 20000 });

    return ok(
      reply,
      {
        uf: uf || null,
        planilhaId,
        planilhaParams,
        sinapiDetected: { dataBase: sinapiDataBaseNorm || null },
        paramsMatch,
        paramsStatus,
        insumosModo,
        importedComposicoes: 1,
        importedItens,
        skippedExisting: 0,
        skippedNotInPlanilha: 0,
      },
      { message: 'Importação SINAPI concluída' }
    );
  });

  server.post('/engenharia/obras/:id/planilha/sinapi/aplicar-base', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    await ensureSinapiBaseTables(prisma);

    const body = (request.body || {}) as any;
    const parsed = z
      .object({
        codigoServico: z.string().min(1),
        dataBase: z.string().min(1),
        uf: z.string().min(2),
        insumosModo: z.enum(['ISD', 'ICD', 'ISE']),
        planilhaId: z.coerce.number().int().positive().optional().nullable(),
        targetObraId: z.coerce.number().int().positive().optional().nullable(),
        mode: z.enum(['UPSERT', 'MISSING_ONLY']).optional().default('MISSING_ONLY'),
        forceDataBaseMismatch: z.boolean().optional().default(false),
        applyInsumoPricesFromSinapi: z.boolean().optional().default(false),
      })
      .parse(body);

    const targetObraId = parsed.targetObraId != null ? Number(parsed.targetObraId) : 0;
    const obraId = Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : idObra;
    if (!canAccessObraId(obraId, scope)) return fail(reply, 403, 'Sem acesso à obra');

    const codigoServico = String(parsed.codigoServico || '').trim().toUpperCase();
    const dataBase = String(parsed.dataBase || '').trim();
    const uf = String(parsed.uf || '').trim().toUpperCase();
    const insumosModo = String(parsed.insumosModo || '').trim().toUpperCase();
    const mode = parsed.mode;
    const forceDataBaseMismatch = Boolean(parsed.forceDataBaseMismatch);
    const applyInsumoPricesFromSinapi = Boolean(parsed.applyInsumoPricesFromSinapi);

    const planilhaId = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, obraId, parsed.planilhaId);
    const vers = (await prisma.$queryRawUnsafe(
      `
      SELECT data_base_sinapi AS "dataBaseSinapi"
      FROM obras_planilhas_versoes
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3
      LIMIT 1
      `,
      ctx.tenantId,
      obraId,
      planilhaId
    )) as any[];
    const planilhaDataBase = vers?.[0]?.dataBaseSinapi == null ? '' : String(vers[0].dataBaseSinapi || '').trim();
    const paramsMatch = planilhaDataBase && dataBase ? planilhaDataBase === dataBase : null;
    const paramsStatus = paramsMatch === true ? 'MATCH' : paramsMatch === false ? 'MISMATCH' : 'UNKNOWN';

    if (paramsStatus !== 'MATCH' && !forceDataBaseMismatch) {
      const detalhe =
        paramsStatus === 'UNKNOWN'
          ? `Não foi possível validar a data-base (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${dataBase || '—'}).`
          : `Data-base diferente (Planilha: ${planilhaDataBase || '—'} / SINAPI: ${dataBase || '—'}).`;
      return fail(reply, 422, `${detalhe} Para prosseguir, marque “Forçar importação (mês-base diferente)”.`);
    }

    const existsInPlanilhaOrReferenced = (await prisma.$queryRawUnsafe(
      `
      WITH RECURSIVE refs(codigo) AS (
        SELECT DISTINCT UPPER(COALESCE(codigo,'')) AS codigo
        FROM obras_planilhas_linhas
        WHERE tenant_id = $1
          AND id_planilha = $2
          AND tipo_linha = 'SERVICO'
          AND COALESCE(codigo,'') <> ''

        UNION

        SELECT DISTINCT UPPER(COALESCE(i.codigo_item,'')) AS codigo
        FROM obras_planilhas_composicoes_itens i
        INNER JOIN refs r
          ON UPPER(COALESCE(i.codigo_servico,'')) = r.codigo
        WHERE i.tenant_id = $1
          AND i.id_obra = $3
          AND i.id_planilha = $2
          AND UPPER(COALESCE(i.tipo_item,'')) IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
          AND COALESCE(i.codigo_item,'') <> ''
      )
      SELECT 1 AS ok
      FROM refs
      WHERE codigo = $4
      LIMIT 1
      `,
      ctx.tenantId,
      planilhaId,
      obraId,
      codigoServico
    )) as any[];
    if (!existsInPlanilhaOrReferenced?.[0]?.ok) {
      return fail(reply, 422, `Serviço inválido para a obra (não está na planilha e não é referenciado por nenhuma composição da planilha): ${codigoServico}`);
    }

    const serv = (await prisma.$queryRawUnsafe(
      `
      SELECT id_serv_sinapi AS "idServ"
      FROM sinapi_servicos_base
      WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_servico) = $3
      ORDER BY id_serv_sinapi DESC
      LIMIT 1
      `,
      ctx.tenantId,
      dataBase,
      codigoServico
    )) as any[];
    const idServ = serv?.[0]?.idServ != null ? Number(serv[0].idServ) : 0;
    if (!idServ) return fail(reply, 422, `O serviço ${codigoServico} não é cadastrado no SINAPI, na base informada (Data-base: ${dataBase || '—'}, UF: ${uf || '—'}, ${insumosModo}).`);

    const itens = (await prisma.$queryRawUnsafe(
      `
      SELECT
        c.tipo_item AS "tipoItemSinapi",
        c.codigo_item AS "codigoItem",
        COALESCE(NULLIF(c.descricao,''), i.descricao, '') AS "descricao",
        COALESCE(NULLIF(c.und,''), i.und, '') AS "und",
        c.coeficiente AS "coeficiente",
        p.pu AS "pu",
        COALESCE(i.classificacao,'INSUMO') AS "classificacao"
      FROM sinapi_composicoes_base c
      LEFT JOIN sinapi_insumos_base i
        ON i.tenant_id = c.tenant_id AND i.id_insumo_sinapi = c.id_insumo_sinapi
      LEFT JOIN sinapi_insumos_pu p
        ON p.tenant_id = c.tenant_id AND p.id_pu = c.id_pu
      WHERE c.tenant_id = $1
        AND c.uf = $2
        AND c.data_base = $3
        AND c.tipo_preco = $4
        AND c.id_serv_sinapi = $5
      ORDER BY c.id_compo_sinapi ASC
      `,
      ctx.tenantId,
      uf,
      dataBase,
      insumosModo,
      idServ
    )) as any[];

    const normalized = (itens || [])
      .map((r: any) => {
        const tipoSinapi = String(r.tipoItemSinapi || '').trim().toUpperCase().slice(0, 32) || 'INSUMO';
        const codigoItem = String(r.codigoItem || '').trim().toUpperCase().slice(0, 80);
        const coef = r.coeficiente == null ? null : Number(r.coeficiente);
        if (!codigoItem || coef == null || !Number.isFinite(coef)) return null;
        const isCompItem = normalizeHeader(tipoSinapi).includes('composicao');
        const tipoItem = computeTipoExpert({ tipoItemSinapi: tipoSinapi, classificacaoSinapi: r.classificacao });
        const desc = String(r.descricao || '').trim().slice(0, 255) || null;
        const undV = String(r.und || '').trim().slice(0, 40) || null;
        const pu = r.pu == null ? null : Number(r.pu);
        const valorUnitario = isCompItem ? null : pu == null || !Number.isFinite(pu) ? null : pu;
        return {
          etapa: '',
          tipoItem,
          codigoItem,
          banco: 'SINAPI',
          descricao: desc,
          und: undV,
          quantidade: toDec(coef),
          valorUnitario: valorUnitario == null ? null : toDec(valorUnitario),
          perda: 0,
          codigoCentroCusto: null,
        };
      })
      .filter(Boolean) as Array<{
      etapa: string;
      tipoItem: string;
      codigoItem: string;
      banco: string;
      descricao: string | null;
      und: string | null;
      quantidade: any;
      valorUnitario: any | null;
      perda: number;
      codigoCentroCusto: string | null;
    }>;

    if (!normalized.length) return fail(reply, 422, 'Composição sem itens na base importada. Reimporte o SINAPI ou revise filtros (Data-base/UF/ISD-ICD-ISE).');

    const existing = (await prisma.$queryRawUnsafe(
      `
      SELECT 1 AS ok
      FROM obras_planilhas_composicoes_itens
      WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4
      LIMIT 1
      `,
      ctx.tenantId,
      obraId,
      planilhaId,
      codigoServico
    )) as any[];
    const already = Boolean(existing?.[0]?.ok);

    if (already && mode === 'MISSING_ONLY' && !applyInsumoPricesFromSinapi) {
      return ok(
        reply,
        {
          codigoServico,
          dataBase,
          uf,
          insumosModo,
          mode,
          importedItens: 0,
          skippedExisting: true,
        },
        { message: 'Composição já existia na obra (modo: importar somente faltantes)' }
      );
    }

    async function calcularTotalComposicaoSinapiBase(
      tx: any,
      args: { tenantId: number; uf: string; dataBase: string; tipoPreco: string; codigoComposicao: string },
      cache: Map<string, number | null>,
      stack: Set<string>
    ): Promise<number | null> {
      const codigo = String(args.codigoComposicao || '').trim().toUpperCase();
      if (!codigo) return null;
      if (cache.has(codigo)) return cache.get(codigo) ?? null;
      if (stack.has(codigo)) return null;
      stack.add(codigo);

      const serv = (await tx.$queryRawUnsafe(
        `
        SELECT id_serv_sinapi AS "idServ"
        FROM sinapi_servicos_base
        WHERE tenant_id = $1 AND data_base = $2 AND UPPER(codigo_servico) = $3
        ORDER BY id_serv_sinapi DESC
        LIMIT 1
        `,
        args.tenantId,
        args.dataBase,
        codigo
      )) as any[];
      const idServ = serv?.[0]?.idServ != null ? Number(serv[0].idServ) : 0;
      if (!idServ) {
        stack.delete(codigo);
        cache.set(codigo, null);
        return null;
      }

      const itens = (await tx.$queryRawUnsafe(
        `
        SELECT
          c.tipo_item AS "tipoItemSinapi",
          c.codigo_item AS "codigoItem",
          c.coeficiente AS "coeficiente",
          p.pu AS "pu"
        FROM sinapi_composicoes_base c
        LEFT JOIN sinapi_insumos_pu p
          ON p.tenant_id = c.tenant_id AND p.id_pu = c.id_pu
        WHERE c.tenant_id = $1
          AND c.uf = $2
          AND c.data_base = $3
          AND c.tipo_preco = $4
          AND c.id_serv_sinapi = $5
        ORDER BY c.id_compo_sinapi ASC
        `,
        args.tenantId,
        args.uf,
        args.dataBase,
        args.tipoPreco,
        idServ
      )) as any[];

      if (!itens?.length) {
        stack.delete(codigo);
        cache.set(codigo, null);
        return null;
      }

      let total = 0;
      for (const r of itens) {
        const tipo = String(r?.tipoItemSinapi || '').trim().toUpperCase();
        const codigoItem = String(r?.codigoItem || '').trim().toUpperCase();
        const coef = r?.coeficiente == null ? null : Number(r.coeficiente);
        if (!codigoItem || coef == null || !Number.isFinite(coef)) continue;
        if (tipo === 'COMPOSICAO' || tipo === 'COMPOSICAO_AUXILIAR') {
          const valorRef = await calcularTotalComposicaoSinapiBase(
            tx,
            { tenantId: args.tenantId, uf: args.uf, dataBase: args.dataBase, tipoPreco: args.tipoPreco, codigoComposicao: codigoItem },
            cache,
            stack
          );
          if (valorRef == null) continue;
          total += Number(coef) * Number(valorRef);
        } else {
          const pu = r?.pu == null ? null : Number(r.pu);
          if (!Number.isFinite(pu as number)) continue;
          total += Number(coef) * Number(pu);
        }
      }

      stack.delete(codigo);
      const fixo = Number(total.toFixed(6));
      cache.set(codigo, fixo);
      return fixo;
    }

    async function fixarValoresReferenciasPorSinapiBase(
      tx: any,
      args: { tenantId: number; idObra: number; idPlanilha: number; codigoServico: string; uf: string; dataBase: string; tipoPreco: string }
    ) {
      const itensRef = (await tx.$queryRawUnsafe(
        `
        SELECT id_item AS "idItem", UPPER(COALESCE(codigo_item,'')) AS "codigoItem", valor_unitario AS "valorUnitario"
        FROM obras_planilhas_composicoes_itens
        WHERE tenant_id = $1
          AND id_obra = $2
          AND id_planilha = $3
          AND UPPER(codigo_servico) = $4
          AND UPPER(COALESCE(tipo_item,'')) IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
        ORDER BY id_item ASC
        `,
        args.tenantId,
        args.idObra,
        args.idPlanilha,
        String(args.codigoServico || '').trim().toUpperCase()
      )) as any[];
      if (!itensRef?.length) return { atualizados: 0 };
      const cache = new Map<string, number | null>();
      let atualizados = 0;
      for (const it of itensRef) {
        const codigoItem = String(it?.codigoItem || '').trim().toUpperCase();
        if (!codigoItem) continue;
        const vuAtual = it?.valorUnitario == null ? null : Number(it.valorUnitario);
        if (vuAtual != null && Number.isFinite(vuAtual)) continue;
        const totalRef = await calcularTotalComposicaoSinapiBase(
          tx,
          { tenantId: args.tenantId, uf: args.uf, dataBase: args.dataBase, tipoPreco: args.tipoPreco, codigoComposicao: codigoItem },
          cache,
          new Set<string>([String(args.codigoServico || '').trim().toUpperCase()])
        );
        if (totalRef == null) continue;
        await tx.$executeRawUnsafe(
          `
          UPDATE obras_planilhas_composicoes_itens
          SET valor_unitario = $5, atualizado_em = NOW()
          WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND id_item = $4
          `,
          args.tenantId,
          args.idObra,
          args.idPlanilha,
          Number(it.idItem),
          toDec(totalRef)
        );
        atualizados++;
      }
      return { atualizados };
    }

    let importedItens = 0;
    await prisma.$transaction(async (tx) => {
      await ensureInsumosPrecosTables(tx);

      const desiredInsumoPrices = new Map<string, number>();
      for (const r of normalized) {
        const tipo = String(r.tipoItem || '').trim().toUpperCase();
        if (tipo === 'COMPOSICAO') continue;
        if (r.valorUnitario == null) continue;
        const code = String(r.codigoItem || '').trim().toUpperCase();
        const vu = Number(r.valorUnitario);
        if (!code || !Number.isFinite(vu)) continue;
        desiredInsumoPrices.set(code, vu);
      }

      const desiredCodes = Array.from(desiredInsumoPrices.keys());
      const existingPriceRows =
        desiredCodes.length > 0
          ? ((await tx.$queryRawUnsafe(
              `
              SELECT UPPER(COALESCE(codigo_item,'')) AS "codigoItem", valor_unitario AS "valorUnitario"
              FROM obras_insumos_precos
              WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(COALESCE(codigo_item,'')) = ANY($4::text[])
              `,
              ctx.tenantId,
              obraId,
              planilhaId,
              desiredCodes
            )) as any[])
          : [];
      const existingInsumoPrices = new Map<string, number>();
      for (const r of existingPriceRows || []) {
        const c = String(r?.codigoItem || '').trim().toUpperCase();
        const v = r?.valorUnitario == null ? null : Number(r.valorUnitario);
        if (!c || v == null || !Number.isFinite(v)) continue;
        existingInsumoPrices.set(c, v);
      }

      const chosenInsumoPrices = new Map<string, number>();
      for (const code of desiredCodes) {
        const desired = desiredInsumoPrices.get(code);
        if (desired == null) continue;
        const existing = existingInsumoPrices.get(code);
        if (applyInsumoPricesFromSinapi) {
          chosenInsumoPrices.set(code, desired);
          continue;
        }
        if (existing != null && Number.isFinite(existing)) {
          chosenInsumoPrices.set(code, existing);
          continue;
        }
        chosenInsumoPrices.set(code, desired);
      }

      if (chosenInsumoPrices.size) {
        const chunkSize = 500;
        const list = Array.from(chosenInsumoPrices.entries());
        for (let start = 0; start < list.length; start += chunkSize) {
          const chunk = list.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map(([codigoItem, valorUnitario]) => {
              const base = [ctx.tenantId, obraId, planilhaId, codigoItem, toDec(valorUnitario)];
              for (const v of base) params.push(v);
              const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
              return `(${placeholders})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_insumos_precos
              (tenant_id, id_obra, id_planilha, codigo_item, valor_unitario)
            VALUES
              ${values}
            ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_item)
            DO UPDATE SET
              valor_unitario = EXCLUDED.valor_unitario,
              atualizado_em = NOW()
            `,
            ...params
          );
        }
      }

      if (applyInsumoPricesFromSinapi && chosenInsumoPrices.size) {
        const chunkSize = 400;
        const list = Array.from(chosenInsumoPrices.entries());
        for (let start = 0; start < list.length; start += chunkSize) {
          const chunk = list.slice(start, start + chunkSize);
          const params: any[] = [ctx.tenantId, obraId, planilhaId];
          let p = 4;
          const values = chunk
            .map(([codigoItem, valorUnitario]) => {
              params.push(codigoItem);
              params.push(toDec(valorUnitario));
              const a = `$${p++}`;
              const b = `$${p++}`;
              return `(${a}, ${b})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            UPDATE obras_planilhas_composicoes_itens i
            SET valor_unitario = v.valor_unitario, atualizado_em = NOW()
            FROM (VALUES ${values}) AS v(codigo_item, valor_unitario)
            WHERE i.tenant_id = $1
              AND i.id_obra = $2
              AND i.id_planilha = $3
              AND UPPER(COALESCE(i.codigo_item,'')) = v.codigo_item
              AND UPPER(COALESCE(i.tipo_item,'')) NOT IN ('COMPOSICAO','COMPOSICAO_AUXILIAR')
            `,
            ...params
          );
        }

        const affected = (await tx.$queryRawUnsafe(
          `
          SELECT DISTINCT UPPER(COALESCE(codigo_servico,'')) AS "codigoServico"
          FROM obras_planilhas_composicoes_itens
          WHERE tenant_id = $1
            AND id_obra = $2
            AND id_planilha = $3
            AND UPPER(COALESCE(codigo_item,'')) = ANY($4::text[])
          `,
          ctx.tenantId,
          obraId,
          planilhaId,
          Array.from(chosenInsumoPrices.keys())
        )) as any[];
        const affectedCodes = Array.from(
          new Set(
            (affected || [])
              .map((r: any) => String(r?.codigoServico || '').trim().toUpperCase())
              .filter(Boolean)
              .concat([codigoServico])
          )
        );
        if (affectedCodes.length) {
          await recalcularFixacaoCascata(tx, ctx.tenantId, obraId, planilhaId, affectedCodes);
        }
      }

      if (mode === 'UPSERT') {
        await tx.$executeRawUnsafe(
          `DELETE FROM obras_planilhas_composicoes_itens WHERE tenant_id = $1 AND id_obra = $2 AND id_planilha = $3 AND UPPER(codigo_servico) = $4`,
          ctx.tenantId,
          obraId,
          planilhaId,
          codigoServico
        );
      }

      for (const r of normalized) {
        const tipo = String(r.tipoItem || '').trim().toUpperCase();
        if (tipo === 'COMPOSICAO') continue;
        const codigoItem = String(r.codigoItem || '').trim().toUpperCase();
        const vu = chosenInsumoPrices.get(codigoItem);
        if (vu == null || !Number.isFinite(vu)) continue;
        r.valorUnitario = toDec(vu);
      }

      if (!already || mode === 'UPSERT') {
        const chunkSize = 500;
        for (let start = 0; start < normalized.length; start += chunkSize) {
          const chunk = normalized.slice(start, start + chunkSize);
          const params: any[] = [];
          let p = 1;
          const values = chunk
            .map((r) => {
            const base = [
              ctx.tenantId,
              obraId,
              planilhaId,
              codigoServico,
              r.etapa,
              r.tipoItem,
              r.codigoItem,
              r.banco,
              r.descricao,
              r.und,
              r.quantidade,
              r.valorUnitario,
              r.perda,
              r.codigoCentroCusto,
            ];
            for (const v of base) params.push(v);
            const placeholders = Array.from({ length: base.length }, () => `$${p++}`).join(',');
            return `(${placeholders})`;
            })
            .join(',');

          await tx.$executeRawUnsafe(
            `
            INSERT INTO obras_planilhas_composicoes_itens
              (tenant_id, id_obra, id_planilha, codigo_servico, etapa, tipo_item, codigo_item, banco, descricao, und, quantidade, valor_unitario, perda_percentual, codigo_centro_custo)
            VALUES
              ${values}
            ON CONFLICT (tenant_id, id_obra, id_planilha, codigo_servico, (COALESCE(etapa,'')), tipo_item, codigo_item)
            DO UPDATE SET
              banco = EXCLUDED.banco,
              descricao = EXCLUDED.descricao,
              und = EXCLUDED.und,
              quantidade = EXCLUDED.quantidade,
              valor_unitario = EXCLUDED.valor_unitario,
              perda_percentual = EXCLUDED.perda_percentual,
              codigo_centro_custo = EXCLUDED.codigo_centro_custo,
              atualizado_em = NOW()
            `,
            ...params
          );
          importedItens += chunk.length;
        }
      }

      await fixarValoresReferenciasPorSinapiBase(tx, {
        tenantId: ctx.tenantId,
        idObra: obraId,
        idPlanilha: planilhaId,
        codigoServico,
        uf,
        dataBase,
        tipoPreco: insumosModo,
      });
    }, { timeout: 120000, maxWait: 20000 });

    return ok(
      reply,
      {
        codigoServico,
        dataBase,
        uf,
        insumosModo,
        mode,
        importedItens,
        skippedExisting: false,
      },
      { message: 'Composição aplicada na obra' }
    );
  });

  server.get('/engenharia/obras/:id/planilha/sinapi/importados', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensureSinapiBaseTables(prisma);

    const q = z
      .object({
        codigo: z.string().optional().nullable(),
        dataBase: z.string().optional().nullable(),
        uf: z.string().optional().nullable(),
        insumosModo: z.enum(['ISD', 'ICD', 'ISE']).optional().nullable(),
      })
      .parse(request.query || {});

    const codigo = String(q.codigo || '').trim().toUpperCase();
    const dataBase = String(q.dataBase || '').trim();
    const uf = String(q.uf || '').trim().toUpperCase();
    const insumosModo = q.insumosModo ? String(q.insumosModo).trim().toUpperCase() : '';

    const where: string[] = ['s.tenant_id = $1'];
    const params: any[] = [ctx.tenantId];
    if (codigo) {
      params.push(codigo);
      where.push(`UPPER(s.codigo_servico) = $${params.length}`);
    }
    if (dataBase) {
      params.push(dataBase);
      where.push(`s.data_base = $${params.length}`);
    }
    if (uf) {
      params.push(uf);
      where.push(`c.uf = $${params.length}`);
    }
    if (insumosModo) {
      params.push(insumosModo);
      where.push(`c.tipo_preco = $${params.length}`);
    }

    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        s.codigo_servico AS "codigo",
        COALESCE(s.descricao,'') AS "descricao",
        COALESCE(s.und,'') AS "und",
        s.data_base AS "dataBase",
        c.uf AS "uf",
        c.tipo_preco AS "insumosModo",
        COUNT(DISTINCT c.codigo_item) AS "itens",
        COUNT(DISTINCT c.id_insumo_sinapi) FILTER (WHERE c.id_insumo_sinapi IS NOT NULL) AS "insumos",
        SUM((c.coeficiente * COALESCE(pu.pu, 0))) FILTER (WHERE c.id_pu IS NOT NULL) AS "valorComposicao"
      FROM sinapi_servicos_base s
      JOIN sinapi_composicoes_base c
        ON c.tenant_id = s.tenant_id
        AND c.data_base = s.data_base
        AND c.id_serv_sinapi = s.id_serv_sinapi
      LEFT JOIN sinapi_insumos_pu pu
        ON pu.tenant_id = c.tenant_id
        AND pu.id_pu = c.id_pu
      WHERE ${where.join(' AND ')}
      GROUP BY s.codigo_servico, s.descricao, s.und, s.data_base, c.uf, c.tipo_preco
      HAVING COUNT(*) > 0 AND COUNT(*) FILTER (WHERE c.id_insumo_sinapi IS NOT NULL) > 0
      ORDER BY s.data_base DESC, c.uf ASC, c.tipo_preco ASC, s.codigo_servico ASC
      LIMIT 800
      `,
      ...params
    )) as any[];

    return ok(
      reply,
      {
        rows: (rows || []).map((r: any) => ({
          codigo: String(r.codigo || '').trim(),
          descricao: String(r.descricao || ''),
          und: String(r.und || ''),
          dataBase: String(r.dataBase || ''),
          uf: String(r.uf || ''),
          insumosModo: String(r.insumosModo || ''),
          itens: r.itens == null ? 0 : Number(r.itens),
          insumos: r.insumos == null ? 0 : Number(r.insumos),
          valorComposicao: r.valorComposicao == null ? null : Number(r.valorComposicao),
        })),
      },
      { message: 'Serviços SINAPI importados' }
    );
  });

  server.delete('/engenharia/obras/:id/planilha/sinapi/importados', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensureSinapiBaseTables(prisma);

    const q = z
      .object({
        codigo: z.string().min(1),
        dataBase: z.string().min(1),
        uf: z.string().min(2),
        insumosModo: z.enum(['ISD', 'ICD', 'ISE']),
      })
      .parse(request.query || {});

    const codigo = String(q.codigo || '').trim().toUpperCase();
    const dataBase = String(q.dataBase || '').trim();
    const uf = String(q.uf || '').trim().toUpperCase();
    const insumosModo = String(q.insumosModo || '').trim().toUpperCase();

    const serv = (await prisma.$queryRawUnsafe(
      `
      SELECT
        id_serv_sinapi AS "idServ"
      FROM sinapi_servicos_base
      WHERE tenant_id = $1
        AND data_base = $2
        AND UPPER(codigo_servico) = $3
      ORDER BY id_serv_sinapi DESC
      LIMIT 1
      `,
      ctx.tenantId,
      dataBase,
      codigo
    )) as any[];
    const idServ = serv?.[0]?.idServ != null ? Number(serv[0].idServ) : 0;
    if (!idServ) return fail(reply, 404, `Serviço não encontrado na base SINAPI (código: ${codigo}, data-base: ${dataBase}).`);

    const { deletedItens, removedServico } = await prisma.$transaction(async (tx) => {
      const deleted = await tx.$executeRawUnsafe(
        `
        DELETE FROM sinapi_composicoes_base
        WHERE tenant_id = $1
          AND data_base = $2
          AND uf = $3
          AND tipo_preco = $4
          AND id_serv_sinapi = $5
        `,
        ctx.tenantId,
        dataBase,
        uf,
        insumosModo,
        idServ
      );

      const remaining = (await tx.$queryRawUnsafe(
        `
        SELECT COUNT(*)::int AS "cnt"
        FROM sinapi_composicoes_base
        WHERE tenant_id = $1
          AND data_base = $2
          AND id_serv_sinapi = $3
        `,
        ctx.tenantId,
        dataBase,
        idServ
      )) as any[];
      const cnt = remaining?.[0]?.cnt == null ? 0 : Number(remaining[0].cnt);
      const removeServ = !Number.isFinite(cnt) || cnt <= 0;
      if (removeServ) {
        await tx.$executeRawUnsafe(
          `
          DELETE FROM sinapi_servicos_base
          WHERE tenant_id = $1
            AND id_serv_sinapi = $2
          `,
          ctx.tenantId,
          idServ
        );
      }
      return { deletedItens: Number(deleted || 0), removedServico: Boolean(removeServ) };
    });

    return ok(
      reply,
      { codigo, dataBase, uf, insumosModo, deletedItens, removedServico },
      { message: 'Preço/composição SINAPI excluído da base' }
    );
  });

  server.get('/engenharia/obras/:id/planilha/sinapi/composicao', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensureSinapiBaseTables(prisma);

    const q = z
      .object({
        codigo: z.string().min(1),
        dataBase: z.string().min(1),
        uf: z.string().min(2),
        insumosModo: z.enum(['ISD', 'ICD', 'ISE']),
      })
      .parse(request.query || {});

    const codigo = String(q.codigo || '').trim().toUpperCase();
    const dataBase = String(q.dataBase || '').trim();
    const uf = String(q.uf || '').trim().toUpperCase();
    const insumosModo = String(q.insumosModo || '').trim().toUpperCase();

    const serv = (await prisma.$queryRawUnsafe(
      `
      SELECT
        id_serv_sinapi AS "idServ",
        COALESCE(descricao,'') AS "descricao",
        COALESCE(und,'') AS "und"
      FROM sinapi_servicos_base
      WHERE tenant_id = $1
        AND data_base = $2
        AND UPPER(codigo_servico) = $3
      ORDER BY id_serv_sinapi DESC
      LIMIT 1
      `,
      ctx.tenantId,
      dataBase,
      codigo
    )) as any[];
    const servRow = serv?.[0] || null;
    const idServ = servRow?.idServ != null ? Number(servRow.idServ) : 0;
    if (!idServ) return fail(reply, 404, `Serviço não encontrado na base SINAPI (código: ${codigo}, data-base: ${dataBase}).`);

    const itens = (await prisma.$queryRawUnsafe(
      `
      SELECT
        c.tipo_item AS "tipoItem",
        c.codigo_item AS "codigoItem",
        COALESCE(c.descricao,'') AS "descricao",
        COALESCE(c.und,'') AS "und",
        c.coeficiente AS "coeficiente",
        pu.pu AS "valorUnitario",
        COALESCE(i.classificacao,'') AS "classificacao"
      FROM sinapi_composicoes_base c
      LEFT JOIN sinapi_insumos_base i
        ON i.tenant_id = c.tenant_id AND i.id_insumo_sinapi = c.id_insumo_sinapi
      LEFT JOIN sinapi_insumos_pu pu
        ON pu.tenant_id = c.tenant_id
       AND pu.id_pu = c.id_pu
      WHERE c.tenant_id = $1
        AND c.uf = $2
        AND c.data_base = $3
        AND c.tipo_preco = $4
        AND c.id_serv_sinapi = $5
      ORDER BY c.tipo_item, c.codigo_item
      `,
      ctx.tenantId,
      uf,
      dataBase,
      insumosModo,
      idServ
    )) as any[];

    const normalized = (itens || []).map((r: any) => {
      const coef = r.coeficiente == null ? null : Number(r.coeficiente);
      const vu = r.valorUnitario == null ? null : Number(r.valorUnitario);
      const valor = coef != null && vu != null && Number.isFinite(coef) && Number.isFinite(vu) ? coef * vu : null;
      return {
        tipoItem: String(r.tipoItem || ''),
        codigoItem: String(r.codigoItem || ''),
        descricao: String(r.descricao || ''),
        und: String(r.und || ''),
        classificacao: String(r.classificacao || '') || null,
        coeficiente: coef,
        valorUnitario: vu,
        valor,
      };
    });

    const total = normalized.reduce((acc: number, r: any) => {
      const v = r?.valor == null ? null : Number(r.valor);
      return v != null && Number.isFinite(v) ? acc + v : acc;
    }, 0);

    return ok(
      reply,
      {
        codigo,
        descricao: String(servRow?.descricao || ''),
        und: String(servRow?.und || ''),
        uf,
        dataBase,
        insumosModo,
        valorSemBdi: Number.isFinite(total) ? total : null,
        itens: normalized,
      },
      { message: 'Composição SINAPI' }
    );
  });

  server.get('/engenharia/obras/:id/contrato', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    const obra = await prisma.obra.findFirst({
      where: { id: idObra, tenantId: ctx.tenantId },
      select: { id: true, name: true, contratoId: true, contrato: { select: { id: true, objeto: true } } },
    });
    if (!obra) return fail(reply, 404, 'Obra não encontrada');

    return ok(
      reply,
      {
        idObra: Number(obra.id),
        nomeObra: obra.name ? String(obra.name) : '',
        idContrato: obra.contratoId != null ? Number(obra.contratoId) : obra.contrato?.id != null ? Number(obra.contrato.id) : null,
        objeto: obra.contrato?.objeto != null ? String(obra.contrato.objeto) : null,
      },
      { message: 'Obra/Contrato' }
    );
  });

  server.get('/engenharia/obras/:id/planilha/insumos/consolidado', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);
    const q = z.object({ planilhaId: z.coerce.number().int().positive().optional().nullable() }).parse(request.query || {});

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    await ensurePlanilhaOrcamentariaTables(prisma);
    await ensurePlanilhaComposicaoTables(prisma);
    await ensureInsumosPrecosTables(prisma);
    const idPlanilha = await resolvePlanilhaIdForObra(prisma, ctx.tenantId, idObra, q.planilhaId);

    const rows = (await prisma.$queryRawUnsafe(
      `
      WITH servicos AS (
        SELECT
          UPPER(COALESCE(codigo,'')) AS codigo_servico,
          COALESCE(quantidade, 0) AS quant_servico
        FROM obras_planilhas_linhas l
        WHERE l.tenant_id = $1
          AND l.id_planilha = $3
          AND l.tipo_linha = 'SERVICO'
          AND COALESCE(l.codigo,'') <> ''
      ),
      insumos AS (
        SELECT
          UPPER(COALESCE(ci.codigo_item,'')) AS codigo_item,
          MAX(COALESCE(ci.descricao,'')) AS descricao,
          MAX(COALESCE(ci.und,'')) AS und,
          MAX(COALESCE(ci.valor_unitario, 0)) AS max_valor_unitario,
          SUM(s.quant_servico * ci.quantidade * (1 + (ci.perda_percentual / 100.0))) AS quantidade_total
        FROM servicos s
        JOIN obras_planilhas_composicoes_itens ci
          ON ci.tenant_id = $1 AND ci.id_obra = $2 AND ci.id_planilha = $3 AND UPPER(ci.codigo_servico) = s.codigo_servico
        WHERE COALESCE(ci.tipo_item,'INSUMO') NOT IN ('COMPOSICAO', 'COMPOSICAO_AUXILIAR')
          AND COALESCE(ci.codigo_item,'') <> ''
        GROUP BY UPPER(COALESCE(ci.codigo_item,''))
      )
      SELECT
        i.codigo_item AS "codigoItem",
        i.descricao AS "descricao",
        i.und AS "und",
        COALESCE(p.valor_unitario, i.max_valor_unitario, 0) AS "valorUnitario",
        i.quantidade_total AS "quantidadeTotal"
      FROM insumos i
      LEFT JOIN obras_insumos_precos p
        ON p.tenant_id = $1 AND p.id_obra = $2 AND p.id_planilha = $3 AND UPPER(COALESCE(p.codigo_item,'')) = i.codigo_item
      ORDER BY i.codigo_item
      `,
      ctx.tenantId,
      idObra,
      idPlanilha
    )) as any[];

    return ok(
      reply,
      {
        rows: (rows || []).map((r: any) => ({
          codigoItem: String(r.codigoItem || ''),
          descricao: String(r.descricao || ''),
          und: String(r.und || ''),
          valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario),
          quantidadeTotal: r.quantidadeTotal == null ? 0 : Number(r.quantidadeTotal),
        })),
      },
      { message: 'Insumos consolidados' }
    );
  });

  server.get('/engenharia/obras/:id/planilha/insumos/precos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    return fail(reply, 410, 'Endpoint desativado. O preço unitário do insumo agora é capturado das composições.');
  });

  server.post('/engenharia/obras/:id/planilha/insumos/precos', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    return fail(reply, 410, 'Endpoint desativado. O preço unitário do insumo agora é capturado das composições.');
  });

  server.post('/engenharia/obras/:id/planilha/insumos/precos/importar-csv', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params || {});
    const idObra = Number(id);

    const scope = (request.user as any)?.abrangencia as any;
    if (!canAccessObraId(idObra, scope)) return fail(reply, 403, 'Sem acesso à obra');

    return fail(reply, 410, 'Endpoint desativado. O preço unitário do insumo agora é capturado das composições.');
  });

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
