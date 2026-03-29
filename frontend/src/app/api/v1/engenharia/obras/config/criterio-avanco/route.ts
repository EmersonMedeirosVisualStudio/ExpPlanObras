import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

async function ensureObrasParametrosTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_parametros (
      id_param BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      criterio_avanco ENUM('QNT_UN_SERV','HORAS_HOMEM') NOT NULL DEFAULT 'QNT_UN_SERV',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_param),
      UNIQUE KEY uk_obra (tenant_id, id_obra),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');

    await ensureObrasParametrosTable();

    const [[obra]]: any = await db.query(
      `
      SELECT o.id_obra, c.numero_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');

    const [[row]]: any = await db.query(
      `SELECT criterio_avanco FROM obras_parametros WHERE tenant_id = ? AND id_obra = ? LIMIT 1`,
      [current.tenantId, idObra]
    );
    const criterio = String(row?.criterio_avanco || 'QNT_UN_SERV');
    return ok({ idObra, criterioAvanco: criterio });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json();
    const idObra = Number(body?.idObra || 0);
    const criterio = String(body?.criterioAvanco || '').trim().toUpperCase();
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!['QNT_UN_SERV', 'HORAS_HOMEM'].includes(criterio)) return fail(422, 'criterioAvanco inválido');

    await ensureObrasParametrosTable();

    const [[obra]]: any = await conn.query(
      `
      SELECT o.id_obra, c.numero_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');
    if (!String(obra.numero_contrato || '').trim()) return fail(422, 'Obra sem contrato principal numerado. Cadastre o número do contrato.');

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO obras_parametros (tenant_id, id_obra, criterio_avanco)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE criterio_avanco = VALUES(criterio_avanco)
      `,
      [current.tenantId, idObra, criterio]
    );
    await conn.commit();

    return ok({ idObra, criterioAvanco: criterio });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

