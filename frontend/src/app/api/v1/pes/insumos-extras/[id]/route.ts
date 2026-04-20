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
    CREATE TABLE IF NOT EXISTS engenharia_pes_insumos_extras (
      id_extra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      codigo_insumo VARCHAR(80) NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      delta_quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      id_usuario BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_extra),
      KEY idx_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_serv_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_criado (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE engenharia_pes_insumos_extras ADD COLUMN codigo_insumo VARCHAR(80) NULL AFTER codigo_centro_custo`).catch(() => null);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await context.params;
    const idExtra = Number(id || 0);
    if (!Number.isFinite(idExtra) || idExtra <= 0) return fail(422, 'id inválido');

    await ensureTables();

    const [[row]]: any = await db.query(
      `
      SELECT id_obra AS idObra
      FROM engenharia_pes_insumos_extras
      WHERE tenant_id = ? AND id_extra = ?
      LIMIT 1
      `,
      [current.tenantId, idExtra]
    );
    if (!row) return fail(404, 'Registro não encontrado');

    const idObra = Number(row.idObra || 0);
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await db.query(`DELETE FROM engenharia_pes_insumos_extras WHERE tenant_id = ? AND id_extra = ?`, [current.tenantId, idExtra]);
    return ok({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
