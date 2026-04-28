import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_treinamentos_requisitos (
      id_requisito BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
      tipo_regra VARCHAR(30) NOT NULL,
      valor_regra VARCHAR(120) NULL,
      obrigatorio TINYINT(1) NOT NULL DEFAULT 1,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_requisito),
      KEY idx_tenant_modelo (tenant_id, id_treinamento_modelo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipoRegra(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'CARGO' || s === 'FUNCAO' || s === 'CBO' || s === 'NORMA') return s;
  return null;
}

function normalizeValorRegra(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
    const { id } = await params;
    const idModelo = Number(id || 0);
    if (!Number.isFinite(idModelo) || idModelo <= 0) return fail(422, 'idModelo inválido');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_requisito AS id,
        tipo_regra AS tipoRegra,
        valor_regra AS valorRegra,
        obrigatorio,
        ativo
      FROM sst_treinamentos_requisitos
      WHERE tenant_id = ? AND id_treinamento_modelo = ?
      ORDER BY tipo_regra ASC, valor_regra ASC
      `,
      [current.tenantId, idModelo]
    );

    return ok(
      (rows as any[]).map((r) => ({
        id: Number(r.id),
        tipoRegra: String(r.tipoRegra),
        valorRegra: r.valorRegra != null ? String(r.valorRegra) : null,
        obrigatorio: Boolean(r.obrigatorio),
        ativo: Boolean(r.ativo),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_CRUD);
    const { id } = await params;
    const idModelo = Number(id || 0);
    if (!Number.isFinite(idModelo) || idModelo <= 0) return fail(422, 'idModelo inválido');

    const body = await req.json().catch(() => null);
    const itens = Array.isArray(body?.itens) ? body.itens : [];

    const normalized = itens
      .map((x: any) => ({
        tipoRegra: normalizeTipoRegra(x?.tipoRegra),
        valorRegra: normalizeValorRegra(x?.valorRegra),
      }))
      .filter((x: any) => x.tipoRegra) as Array<{ tipoRegra: 'CARGO' | 'FUNCAO' | 'CBO' | 'NORMA'; valorRegra: string | null }>;

    await ensureTables();

    await conn.beginTransaction();
    await conn.query(`DELETE FROM sst_treinamentos_requisitos WHERE tenant_id = ? AND id_treinamento_modelo = ?`, [current.tenantId, idModelo]);
    for (const it of normalized) {
      await conn.query(
        `
        INSERT INTO sst_treinamentos_requisitos
          (tenant_id, id_treinamento_modelo, tipo_regra, valor_regra, obrigatorio, ativo)
        VALUES
          (?, ?, ?, ?, 1, 1)
        `,
        [current.tenantId, idModelo, it.tipoRegra, it.valorRegra]
      );
    }
    await conn.commit();

    return ok({ idModelo, itens: normalized });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
