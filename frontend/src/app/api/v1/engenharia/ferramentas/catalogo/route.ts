import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_catalogo (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_codigo (tenant_id, codigo),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const q = String(req.nextUrl.searchParams.get('q') || '').trim();

    await ensureTables();

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (q) {
      where.push('(codigo LIKE ? OR descricao LIKE ?)');
      const s = `%${q}%`;
      params.push(s, s);
    }

    const [rows]: any = await db.query(
      `
      SELECT id_item AS idItem, codigo, descricao, unidade_medida AS unidadeMedida
      FROM engenharia_ferramentas_catalogo
      WHERE ${where.join(' AND ')}
      ORDER BY descricao
      LIMIT 500
      `,
      params
    );
    return ok((rows as any[]).map((r) => ({ ...r, idItem: Number(r.idItem) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const codigo = String(body?.codigo || '').trim();
    const descricao = String(body?.descricao || '').trim();
    const unidadeMedida = body?.unidadeMedida ? String(body.unidadeMedida).trim() : null;

    if (!codigo) return fail(422, 'codigo é obrigatório');
    if (!descricao) return fail(422, 'descricao é obrigatória');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ferramentas_catalogo
        (tenant_id, codigo, descricao, unidade_medida)
      VALUES
        (?,?,?,?)
      `,
      [current.tenantId, codigo.slice(0, 80), descricao.slice(0, 255), unidadeMedida ? unidadeMedida.slice(0, 32) : null]
    );
    await conn.commit();
    return ok({ idItem: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

