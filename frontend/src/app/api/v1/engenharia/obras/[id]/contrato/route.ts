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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idObra = parseId(id);
    if (!idObra) return fail(400, 'ID inválido.');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const objetoCol = await detectContratoObjetoColumn();
    const objetoExpr = objetoCol ? `c.${objetoCol}` : 'NULL';

    const [[row]]: any = await db.query(
      `
      SELECT
        o.id_obra AS idObra,
        COALESCE(o.nome, '') AS nomeObra,
        o.id_contrato AS idContrato,
        COALESCE(c.numero_contrato, '') AS numeroContrato,
        ${objetoExpr} AS objeto
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
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
    });
  } catch (e) {
    return handleApiError(e);
  }
}
