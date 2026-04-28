import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS tenant_configuracoes (
      id_config BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      chave VARCHAR(120) NOT NULL,
      valor_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_config),
      UNIQUE KEY uk_tenant_chave (tenant_id, chave),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

const KEY = 'rh.presencas.politica';

function normalizeBool(v: any, defaultValue: boolean) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return defaultValue;
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_VIEW);
    await ensureTables();

    const [[row]]: any = await db.query(`SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`, [
      current.tenantId,
      KEY,
    ]);
    const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};

    return ok({
      exigirAutorizacaoDispositivo: normalizeBool(cfg?.exigirAutorizacaoDispositivo, true),
      bloquearPorTreinamentoVencido: normalizeBool(cfg?.bloquearPorTreinamentoVencido, true),
      exigirGeolocalizacao: normalizeBool(cfg?.exigirGeolocalizacao, false),
      exigirFoto: normalizeBool(cfg?.exigirFoto, false),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
