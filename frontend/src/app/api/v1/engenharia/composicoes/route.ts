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
      where.push('(LOWER(codigo) LIKE ? OR LOWER(descricao) LIKE ? OR LOWER(COALESCE(codigo_servico,"")) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT codigo, codigo_servico AS codigoServico, descricao, unidade, bdi
      FROM engenharia_composicoes
      WHERE ${where.join(' AND ')}
      ORDER BY codigo ASC
      LIMIT 2000
      `,
      params
    );
    return ok(
      (rows as any[]).map((r) => ({
        codigo: String(r.codigo),
        codigoServico: r.codigoServico ? String(r.codigoServico) : null,
        descricao: String(r.descricao),
        unidade: String(r.unidade),
        bdi: r.bdi == null ? 0 : Number(r.bdi),
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
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim().toUpperCase() : null;
    const descricao = String(body?.descricao || '').trim();
    const unidade = String(body?.unidade || '').trim();
    const bdi = body?.bdi == null ? 0 : toNumber(body.bdi);
    const ativo = body?.ativo === false ? 0 : 1;

    if (!codigo) return fail(422, 'codigo é obrigatório');
    if (!descricao) return fail(422, 'descricao é obrigatória');
    if (!unidade) return fail(422, 'unidade é obrigatória');

    await db.query(
      `
      INSERT INTO engenharia_composicoes (tenant_id, codigo, codigo_servico, descricao, unidade, bdi, ativo)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        codigo_servico = VALUES(codigo_servico),
        descricao = VALUES(descricao),
        unidade = VALUES(unidade),
        bdi = VALUES(bdi),
        ativo = VALUES(ativo),
        updated_at = CURRENT_TIMESTAMP
      `,
      [current.tenantId, codigo, codigoServico, descricao, unidade, Number.isNaN(bdi) ? 0 : bdi, ativo]
    );

    return ok({ codigo });
  } catch (e) {
    return handleApiError(e);
  }
}

