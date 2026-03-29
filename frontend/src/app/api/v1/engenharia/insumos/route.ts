import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureEngenhariaImportTables();

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const where: string[] = ['tenant_id = ?', 'ativo = 1'];
    const params: any[] = [current.tenantId];
    if (q) {
      where.push('(LOWER(codigo) LIKE ? OR LOWER(descricao) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT codigo, descricao, unidade, grupo, categoria, preco_unitario AS custoBase
      FROM engenharia_materiais
      WHERE ${where.join(' AND ')}
      ORDER BY codigo ASC
      LIMIT 2000
      `,
      params
    );
    return ok(
      (rows as any[]).map((r) => ({
        codigo: String(r.codigo),
        descricao: String(r.descricao),
        unidade: String(r.unidade),
        grupo: r.grupo ? String(r.grupo) : null,
        categoria: r.categoria ? String(r.categoria) : null,
        custoBase: r.custoBase == null ? 0 : Number(r.custoBase),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureEngenhariaImportTables();

    const body = await req.json().catch(() => null);
    const codigo = String(body?.codigo || '').trim().toUpperCase();
    const descricao = String(body?.descricao || '').trim();
    const unidade = String(body?.unidade || '').trim();
    const grupo = body?.grupo ? String(body.grupo).trim() : null;
    const categoria = body?.categoria ? String(body.categoria).trim() : null;
    const custoBase = body?.custoBase == null ? 0 : toNumber(body.custoBase);
    const ativo = body?.ativo === false ? 0 : 1;

    if (!codigo) return fail(422, 'codigo é obrigatório');
    if (!descricao) return fail(422, 'descricao é obrigatória');
    if (!unidade) return fail(422, 'unidade é obrigatória');

    await db.query(
      `
      INSERT INTO engenharia_materiais (tenant_id, codigo, descricao, unidade, grupo, categoria, preco_unitario, ativo)
      VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        descricao = VALUES(descricao),
        unidade = VALUES(unidade),
        grupo = VALUES(grupo),
        categoria = VALUES(categoria),
        preco_unitario = VALUES(preco_unitario),
        ativo = VALUES(ativo),
        updated_at = CURRENT_TIMESTAMP
      `,
      [current.tenantId, codigo, descricao, unidade, grupo, categoria, Number.isNaN(custoBase) ? 0 : custoBase, ativo]
    );

    return ok({ codigo });
  } catch (e) {
    return handleApiError(e);
  }
}

