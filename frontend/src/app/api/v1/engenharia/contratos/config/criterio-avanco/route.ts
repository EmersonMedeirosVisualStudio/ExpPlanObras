import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

async function ensureContratosParametrosTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_parametros (
      id_param BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contrato BIGINT UNSIGNED NOT NULL,
      criterio_avanco ENUM('QNT_UN_SERV','HORAS_HOMEM') NOT NULL DEFAULT 'QNT_UN_SERV',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_param),
      UNIQUE KEY uk_contrato (tenant_id, id_contrato),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idContrato = Number(req.nextUrl.searchParams.get('idContrato') || 0);
    if (!Number.isFinite(idContrato) || idContrato <= 0) return fail(422, 'idContrato é obrigatório');
    await ensureContratosParametrosTable();
    const [[row]]: any = await db.query(
      `SELECT criterio_avanco FROM contratos_parametros WHERE tenant_id = ? AND id_contrato = ? LIMIT 1`,
      [current.tenantId, idContrato]
    );
    const criterio = String(row?.criterio_avanco || 'QNT_UN_SERV');
    return ok({ idContrato, criterioAvanco: criterio });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json();
    const idContrato = Number(body?.idContrato || 0);
    const criterio = String(body?.criterioAvanco || '').trim().toUpperCase();
    if (!Number.isFinite(idContrato) || idContrato <= 0) return fail(422, 'idContrato é obrigatório');
    if (!['QNT_UN_SERV', 'HORAS_HOMEM'].includes(criterio)) return fail(422, 'criterioAvanco inválido');

    await ensureContratosParametrosTable();

    const [[contrato]]: any = await conn.query(
      `SELECT id_contrato, numero_contrato FROM contratos WHERE tenant_id = ? AND id_contrato = ? LIMIT 1`,
      [current.tenantId, idContrato]
    );
    if (!contrato) return fail(404, 'Contrato não encontrado');
    if (!String(contrato.numero_contrato || '').trim()) return fail(422, 'Contrato sem número. Cadastre o número do contrato.');

    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `
      INSERT INTO contratos_parametros (tenant_id, id_contrato, criterio_avanco)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE criterio_avanco = VALUES(criterio_avanco)
      `,
      [current.tenantId, idContrato, criterio]
    );
    await conn.commit();

    return ok({ idContrato, criterioAvanco: criterio });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
