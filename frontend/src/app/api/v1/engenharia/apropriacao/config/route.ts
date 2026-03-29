import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
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

const KEY = 'engenharia.apropriacao.cc_policy';

function normalizeBool(v: any, defaultValue: boolean) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return defaultValue;
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.CONFIG_EMPRESA_VIEW);
    await ensureTables();

    const [[row]]: any = await db.query(
      `SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`,
      [current.tenantId, KEY]
    );

    const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};

    return ok({
      permitirSemCentroCusto: normalizeBool(cfg?.permitirSemCentroCusto, true),
      exibirAlerta: normalizeBool(cfg?.exibirAlerta, true),
      bloquearSalvamento: normalizeBool(cfg?.bloquearSalvamento, false),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.CONFIG_EMPRESA_EDIT);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const payload = {
      permitirSemCentroCusto: normalizeBool(body?.permitirSemCentroCusto, true),
      exibirAlerta: normalizeBool(body?.exibirAlerta, true),
      bloquearSalvamento: normalizeBool(body?.bloquearSalvamento, false),
    };

    if (payload.bloquearSalvamento && payload.permitirSemCentroCusto) {
      return fail(422, 'Configuração inválida: não é possível bloquear salvamento e permitir apropriação sem centro de custo ao mesmo tempo.');
    }

    await conn.query(
      `
      INSERT INTO tenant_configuracoes (tenant_id, chave, valor_json, id_usuario_atualizador)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE
        valor_json = VALUES(valor_json),
        id_usuario_atualizador = VALUES(id_usuario_atualizador),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [current.tenantId, KEY, JSON.stringify(payload), current.id]
    );

    return ok(payload);
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
