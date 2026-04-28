import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_presencas_autorizacoes (
      id_autorizacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_usuario BIGINT UNSIGNED NOT NULL,
      termo_versao VARCHAR(40) NOT NULL,
      aceito_em DATETIME NOT NULL,
      ip_registro VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      device_uuid VARCHAR(80) NULL,
      plataforma VARCHAR(20) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_autorizacao),
      UNIQUE KEY uk_tenant_user (tenant_id, id_usuario),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function getClientIp(req: NextRequest) {
  const xf = req.headers.get('x-forwarded-for') || '';
  const first = xf.split(',').map((s) => s.trim()).filter(Boolean)[0] || null;
  return first || req.headers.get('x-real-ip') || null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_VIEW);
    await ensureTables();

    const [[row]]: any = await db.query(
      `
      SELECT termo_versao AS termoVersao, aceito_em AS aceitoEm, ativo
      FROM rh_presencas_autorizacoes
      WHERE tenant_id = ? AND id_usuario = ?
      LIMIT 1
      `,
      [current.tenantId, current.id]
    );

    return ok({
      autorizado: row ? Boolean(row.ativo) : false,
      termoVersao: row?.termoVersao ? String(row.termoVersao) : null,
      aceitoEm: row?.aceitoEm ? String(row.aceitoEm) : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    await ensureTables();

    const body = (await req.json().catch(() => null)) as any;
    const termoVersao = String(body?.termoVersao || '').trim();
    const deviceUuid = body?.deviceUuid ? String(body.deviceUuid).trim() : null;
    const plataforma = body?.plataforma ? String(body.plataforma).trim().toUpperCase() : null;

    if (!termoVersao) return fail(422, 'termoVersao é obrigatório');

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent');

    await db.query(
      `
      INSERT INTO rh_presencas_autorizacoes
        (tenant_id, id_usuario, termo_versao, aceito_em, ip_registro, user_agent, device_uuid, plataforma, ativo)
      VALUES
        (?, ?, ?, NOW(), ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        termo_versao = VALUES(termo_versao),
        aceito_em = VALUES(aceito_em),
        ip_registro = VALUES(ip_registro),
        user_agent = VALUES(user_agent),
        device_uuid = VALUES(device_uuid),
        plataforma = VALUES(plataforma),
        ativo = 1,
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [current.tenantId, current.id, termoVersao, ip, ua ? String(ua).slice(0, 255) : null, deviceUuid, plataforma]
    );

    return ok({ autorizado: true, termoVersao, aceitoEm: new Date().toISOString() });
  } catch (e) {
    return handleApiError(e);
  }
}
