import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function parseId(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function detectContratoObjetoColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'contratos'
        AND column_name IN ('objeto', 'objeto_contrato', 'descricao', 'descricao_contrato')
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = ['objeto', 'objeto_contrato', 'descricao', 'descricao_contrato'];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

async function detectContratoContratanteColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'contratos'
        AND column_name IN (
          'orgao_contratante',
          'contratante',
          'contratante_nome',
          'nome_contratante',
          'cliente',
          'cliente_nome',
          'tomador'
        )
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = ['orgao_contratante', 'contratante', 'contratante_nome', 'nome_contratante', 'cliente', 'cliente_nome', 'tomador'];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

async function detectContratoValorConcedenteColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'contratos'
        AND column_name IN (
          'valor_concedente',
          'valor_convenio',
          'valor_repasse',
          'valor_concedente_total',
          'valor_convenio_total',
          'valor_repasse_total'
        )
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = ['valor_concedente', 'valor_convenio', 'valor_repasse', 'valor_concedente_total', 'valor_convenio_total', 'valor_repasse_total'];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

async function detectContratoValorRecursosProprioColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'contratos'
        AND column_name IN (
          'valor_recursos_proprios',
          'valor_recursos_proprio',
          'valor_recurso_proprio',
          'valor_rp',
          'valor_recursos_proprios_total',
          'valor_recursos_proprio_total',
          'valor_recurso_proprio_total',
          'valor_rp_total'
        )
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = [
      'valor_recursos_proprios',
      'valor_recursos_proprio',
      'valor_recurso_proprio',
      'valor_rp',
      'valor_recursos_proprios_total',
      'valor_recursos_proprio_total',
      'valor_recurso_proprio_total',
      'valor_rp_total',
    ];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

async function detectContratoContraparteIdColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'contratos'
        AND column_name IN (
          'id_contraparte',
          'id_contraparte_contratante',
          'id_contratante',
          'id_cliente',
          'id_cliente_contratante'
        )
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = ['id_contraparte_contratante', 'id_contratante', 'id_contraparte', 'id_cliente_contratante', 'id_cliente'];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

async function hasEngenhariaContrapartesTable() {
  try {
    const [[r]]: any = await db.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'engenharia_contrapartes'
      `,
      []
    );
    return Number(r?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function detectEngenhariaContraparteNomeColumn() {
  try {
    const [rows]: any = await db.query(
      `
      SELECT COLUMN_NAME AS col
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'engenharia_contrapartes'
        AND column_name IN ('nome_razao', 'razao_social', 'nome')
      `,
      []
    );
    const cols = new Set((rows as any[]).map((r: any) => String(r?.col || '').trim().toLowerCase()).filter(Boolean));
    const order = ['nome_razao', 'razao_social', 'nome'];
    return order.find((c) => cols.has(c)) || null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idObra = parseId(id);
    if (!idObra) return fail(400, 'ID inválido.');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const objetoCol = await detectContratoObjetoColumn();
    const objetoExpr = objetoCol ? `c.${objetoCol}` : 'NULL';
    const contratanteCol = await detectContratoContratanteColumn();
    const contratanteExpr = contratanteCol ? `c.${contratanteCol}` : 'NULL';
    const concedenteCol = await detectContratoValorConcedenteColumn();
    const concedenteExpr = concedenteCol ? `c.${concedenteCol}` : 'NULL';
    const rpCol = await detectContratoValorRecursosProprioColumn();
    const rpExpr = rpCol ? `c.${rpCol}` : 'NULL';
    const contraparteIdCol = await detectContratoContraparteIdColumn();
    const hasContrapartes = contraparteIdCol ? await hasEngenhariaContrapartesTable() : false;
    const contraparteNomeCol = hasContrapartes ? await detectEngenhariaContraparteNomeColumn() : null;
    const joinContraparte = hasContrapartes && contraparteIdCol ? `LEFT JOIN engenharia_contrapartes cp ON cp.tenant_id = c.tenant_id AND cp.id_contraparte = c.${contraparteIdCol}` : '';
    const contraparteNomeExpr = hasContrapartes && contraparteNomeCol ? `cp.${contraparteNomeCol}` : 'NULL';

    const [[row]]: any = await db.query(
      `
      SELECT
        o.id_obra AS idObra,
        COALESCE(o.nome, '') AS nomeObra,
        o.id_contrato AS idContrato,
        COALESCE(c.numero_contrato, '') AS numeroContrato,
        ${objetoExpr} AS objeto,
        ${contratanteExpr} AS contratante,
        ${contraparteNomeExpr} AS contratanteContraparte,
        ${concedenteExpr} AS valorConcedente,
        ${rpExpr} AS valorRecursosProprio
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      ${joinContraparte}
      WHERE c.tenant_id = ?
        AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!row) return fail(404, 'Obra não encontrada');

    return ok({
      idObra: Number(row.idObra),
      nomeObra: String(row.nomeObra || ''),
      idContrato: Number(row.idContrato),
      numeroContrato: String(row.numeroContrato || ''),
      objeto: row.objeto == null ? null : String(row.objeto || ''),
      contratante:
        row.contratanteContraparte != null && String(row.contratanteContraparte || '').trim()
          ? String(row.contratanteContraparte || '').trim()
          : row.contratante == null
            ? null
            : String(row.contratante || ''),
      valorConcedente: row.valorConcedente == null || row.valorConcedente === '' ? null : Number(row.valorConcedente),
      valorRecursosProprio: row.valorRecursosProprio == null || row.valorRecursosProprio === '' ? null : Number(row.valorRecursosProprio),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
