import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_gestores (
      id_gestor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_funcionario_gestor BIGINT UNSIGNED NOT NULL,
      definido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_definidor BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_gestor),
      UNIQUE KEY uk_obra (tenant_id, id_obra),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    const [[row]]: any = await db.query(
      `
      SELECT
        id_funcionario_gestor AS idFuncionarioGestor,
        definido_em AS definidoEm,
        id_usuario_definidor AS idUsuarioDefinidor
      FROM obras_gestores
      WHERE tenant_id = ? AND id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );

    return ok(
      row
        ? {
            idObra,
            idFuncionarioGestor: Number(row.idFuncionarioGestor),
            definidoEm: String(row.definidoEm),
            idUsuarioDefinidor: Number(row.idUsuarioDefinidor),
          }
        : null
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const idFuncionarioGestor = Number(body?.idFuncionarioGestor || 0);

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!Number.isFinite(idFuncionarioGestor) || idFuncionarioGestor <= 0) return fail(422, 'idFuncionarioGestor é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    await conn.query(
      `
      INSERT INTO obras_gestores (tenant_id, id_obra, id_funcionario_gestor, id_usuario_definidor)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE
        id_funcionario_gestor = VALUES(id_funcionario_gestor),
        id_usuario_definidor = VALUES(id_usuario_definidor),
        definido_em = CURRENT_TIMESTAMP
      `,
      [current.tenantId, idObra, idFuncionarioGestor, current.id]
    );

    return ok({ idObra, idFuncionarioGestor });
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

