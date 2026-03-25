import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('doesn\'t exist') || msg.includes('unknown') || msg.includes('mobile_dispositivos') || msg.includes('mobile_push_tokens')) {
    throw new ApiError(501, 'Banco sem tabelas de dispositivos/push mobile. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export async function upsertMobileDevice(tenantId: number, userId: number, body: any) {
  const plataforma = String(body?.plataforma || 'WEB').toUpperCase();
  const deviceUuid = body?.deviceUuid ? String(body.deviceUuid) : null;
  const fabricante = body?.fabricante ? String(body.fabricante) : null;
  const modelo = body?.modelo ? String(body.modelo) : null;
  const soNome = body?.soNome ? String(body.soNome) : null;
  const soVersao = body?.soVersao ? String(body.soVersao) : null;
  const appVersao = body?.appVersao ? String(body.appVersao) : null;
  const buildNumber = body?.buildNumber ? String(body.buildNumber) : null;
  const idioma = body?.idioma ? String(body.idioma) : null;

  try {
    const [[row]]: any = await db.query(
      `
      SELECT id_mobile_dispositivo AS id
      FROM mobile_dispositivos
      WHERE tenant_id = ? AND id_usuario = ? AND COALESCE(device_uuid, '') = COALESCE(?, '')
      LIMIT 1
      `,
      [tenantId, userId, deviceUuid]
    );

    if (row?.id) {
      await db.query(
        `
        UPDATE mobile_dispositivos
        SET plataforma = ?, fabricante = ?, modelo = ?, so_nome = ?, so_versao = ?, app_versao = ?, build_number = ?, idioma = ?, ultimo_acesso_em = NOW(), ativo = 1
        WHERE id_mobile_dispositivo = ? AND tenant_id = ?
        `,
        [plataforma, fabricante, modelo, soNome, soVersao, appVersao, buildNumber, idioma, row.id, tenantId]
      );
      return { id: Number(row.id) };
    }

    const [res]: any = await db.query(
      `
      INSERT INTO mobile_dispositivos
        (tenant_id, id_usuario, plataforma, device_uuid, fabricante, modelo, so_nome, so_versao, app_versao, build_number, idioma, ultimo_acesso_em, ativo)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
      `,
      [tenantId, userId, plataforma, deviceUuid, fabricante, modelo, soNome, soVersao, appVersao, buildNumber, idioma]
    );

    return { id: Number(res.insertId) };
  } catch (e) {
    return assertSqlReady(e);
  }
}

export async function upsertMobilePushToken(tenantId: number, userId: number, deviceId: number | null, body: any) {
  const provider = String(body?.provider || 'FCM').toUpperCase();
  const token = String(body?.token || '').trim();
  const ambiente = String(body?.ambiente || 'PROD').toUpperCase();
  if (!token) throw new ApiError(422, 'token obrigatório');

  try {
    await db.query(
      `
      INSERT INTO mobile_push_tokens
        (tenant_id, id_usuario, id_mobile_dispositivo, provider, token_push, ambiente, ativo, ultimo_heartbeat_em)
      VALUES
        (?, ?, ?, ?, ?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE
        ativo = VALUES(ativo),
        ultimo_heartbeat_em = VALUES(ultimo_heartbeat_em),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [tenantId, userId, deviceId || 0, provider, token, ambiente]
    );
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e);
  }
}

export async function deactivateMobilePushToken(tenantId: number, userId: number, body: any) {
  const provider = String(body?.provider || 'FCM').toUpperCase();
  const token = String(body?.token || '').trim();
  if (!token) throw new ApiError(422, 'token obrigatório');
  try {
    await db.query(
      `
      UPDATE mobile_push_tokens
      SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_usuario = ? AND provider = ? AND token_push = ?
      `,
      [tenantId, userId, provider, token]
    );
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e);
  }
}

