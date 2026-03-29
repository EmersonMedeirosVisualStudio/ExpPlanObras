import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos_tarifas (
      id_tarifa BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      custo_hora_produtiva DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_hora_improdutiva DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_km DECIMAL(14,4) NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_tarifa),
      UNIQUE KEY uk_ativo (tenant_id, id_ativo),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idAtivo = Number(req.nextUrl.searchParams.get('idAtivo') || 0);
    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');

    await ensureTables();
    const [[row]]: any = await db.query(
      `
      SELECT
        id_ativo AS idAtivo,
        custo_hora_produtiva AS custoHoraProdutiva,
        custo_hora_improdutiva AS custoHoraImprodutiva,
        custo_km AS custoKm
      FROM engenharia_ativos_tarifas
      WHERE tenant_id = ? AND id_ativo = ?
      LIMIT 1
      `,
      [current.tenantId, idAtivo]
    );
    return ok(
      row
        ? {
            idAtivo: Number(row.idAtivo),
            custoHoraProdutiva: Number(row.custoHoraProdutiva || 0),
            custoHoraImprodutiva: Number(row.custoHoraImprodutiva || 0),
            custoKm: Number(row.custoKm || 0),
          }
        : { idAtivo, custoHoraProdutiva: 0, custoHoraImprodutiva: 0, custoKm: 0 }
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
    const idAtivo = Number(body?.idAtivo || 0);
    const custoHoraProdutiva = toNumber(body?.custoHoraProdutiva);
    const custoHoraImprodutiva = toNumber(body?.custoHoraImprodutiva);
    const custoKm = toNumber(body?.custoKm);

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!Number.isFinite(custoHoraProdutiva) || custoHoraProdutiva < 0) return fail(422, 'custoHoraProdutiva inválido');
    if (!Number.isFinite(custoHoraImprodutiva) || custoHoraImprodutiva < 0) return fail(422, 'custoHoraImprodutiva inválido');
    if (!Number.isFinite(custoKm) || custoKm < 0) return fail(422, 'custoKm inválido');

    await ensureTables();

    const [[ativo]]: any = await conn.query(`SELECT id_ativo FROM engenharia_ativos WHERE tenant_id = ? AND id_ativo = ? LIMIT 1`, [
      current.tenantId,
      idAtivo,
    ]);
    if (!ativo) return fail(404, 'Ativo não encontrado');

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_ativos_tarifas
        (tenant_id, id_ativo, custo_hora_produtiva, custo_hora_improdutiva, custo_km, id_usuario_atualizador)
      VALUES
        (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        custo_hora_produtiva = VALUES(custo_hora_produtiva),
        custo_hora_improdutiva = VALUES(custo_hora_improdutiva),
        custo_km = VALUES(custo_km),
        id_usuario_atualizador = VALUES(id_usuario_atualizador)
      `,
      [current.tenantId, idAtivo, custoHoraProdutiva, custoHoraImprodutiva, custoKm, current.id]
    );
    await conn.commit();
    return ok({ idAtivo });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

