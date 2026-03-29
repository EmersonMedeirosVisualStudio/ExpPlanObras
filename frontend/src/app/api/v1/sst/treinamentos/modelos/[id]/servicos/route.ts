import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_treinamentos_modelos_servicos (
      id_modelo_servico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_modelo_servico),
      UNIQUE KEY uk_modelo_servico (tenant_id, id_treinamento_modelo, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
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
      SELECT codigo_servico AS codigoServico
      FROM sst_treinamentos_modelos_servicos
      WHERE tenant_id = ? AND id_treinamento_modelo = ?
      ORDER BY codigo_servico ASC
      `,
      [current.tenantId, idModelo]
    );
    return ok((rows as any[]).map((r) => String(r.codigoServico)));
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
    const codigos = Array.isArray(body?.codigos) ? body.codigos : [];
    const normalized = Array.from(new Set(codigos.map(normalizeCodigoServico).filter(Boolean))) as string[];

    await ensureTables();

    await conn.beginTransaction();
    await conn.query(`DELETE FROM sst_treinamentos_modelos_servicos WHERE tenant_id = ? AND id_treinamento_modelo = ?`, [current.tenantId, idModelo]);
    for (const c of normalized) {
      await conn.query(
        `INSERT INTO sst_treinamentos_modelos_servicos (tenant_id, id_treinamento_modelo, codigo_servico) VALUES (?,?,?)`,
        [current.tenantId, idModelo, c]
      );
    }
    await conn.commit();
    return ok({ idModelo, codigos: normalized });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

