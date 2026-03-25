import webpush from 'web-push';
import { db } from '@/lib/db';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function getVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@expplan.local';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
  plataforma?: string | null;
  idioma?: string | null;
};

export async function upsertPushSubscription(args: { tenantId: number; userId: number; sub: PushSubscriptionInput }) {
  const endpoint = String(args.sub.endpoint || '').trim();
  const p256dh = String(args.sub.keys?.p256dh || '').trim();
  const auth = String(args.sub.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) throw new Error('Assinatura inválida');

  await db.execute(
    `
    INSERT INTO push_dispositivos_assinaturas
      (tenant_id, id_usuario, endpoint, p256dh, auth_key, user_agent, plataforma, idioma, ativo, ultimo_heartbeat_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE
      p256dh = VALUES(p256dh),
      auth_key = VALUES(auth_key),
      user_agent = VALUES(user_agent),
      plataforma = VALUES(plataforma),
      idioma = VALUES(idioma),
      ativo = 1,
      ultimo_heartbeat_em = VALUES(ultimo_heartbeat_em),
      atualizado_em = CURRENT_TIMESTAMP
    `,
    [
      args.tenantId,
      args.userId,
      endpoint,
      p256dh,
      auth,
      args.sub.userAgent ?? null,
      args.sub.plataforma ?? null,
      args.sub.idioma ?? null,
      nowIso(),
    ]
  );
}

export async function listPushSubscriptions(args: { tenantId: number; userId: number }) {
  const [rows]: any = await db.query(
    `
    SELECT
      id_push_dispositivo_assinatura AS id,
      endpoint,
      user_agent AS userAgent,
      plataforma,
      idioma,
      ativo,
      ultimo_heartbeat_em AS ultimoHeartbeatEm,
      criado_em AS criadoEm
    FROM push_dispositivos_assinaturas
    WHERE tenant_id = ? AND id_usuario = ?
    ORDER BY atualizado_em DESC
    LIMIT 50
    `,
    [args.tenantId, args.userId]
  );
  return rows as any[];
}

export async function deactivatePushSubscription(args: { tenantId: number; userId: number; endpoint: string }) {
  const endpoint = String(args.endpoint || '').trim();
  if (!endpoint) return;
  await db.execute(
    `
    UPDATE push_dispositivos_assinaturas
    SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND id_usuario = ? AND endpoint = ?
    `,
    [args.tenantId, args.userId, endpoint]
  );
}

async function shouldSendPushForUser(args: { tenantId: number; userId: number; modulo: string; severidade: string }) {
  try {
    const [[row]]: any = await db.query(
      `
      SELECT recebe_push AS recebePush, somente_criticas_push AS somenteCriticasPush, ativo
      FROM notificacoes_preferencias_usuario
      WHERE tenant_id = ? AND id_usuario = ? AND modulo = ?
      LIMIT 1
      `,
      [args.tenantId, args.userId, args.modulo]
    );
    if (!row) return false;
    if (!row.ativo) return false;
    if (!row.recebePush) return false;
    if (row.somenteCriticasPush && String(args.severidade || '') !== 'DANGER') return false;
    return true;
  } catch {
    return false;
  }
}

export async function enqueuePushForRecipient(args: { tenantId: number; userId: number; eventId: number }) {
  const vapid = getVapid();
  if (!vapid) return;

  const [[ev]]: any = await db.query(
    `
    SELECT id_notificacao_evento AS id, modulo, severidade, titulo, mensagem, rota
    FROM notificacoes_eventos
    WHERE tenant_id = ? AND id_notificacao_evento = ?
    LIMIT 1
    `,
    [args.tenantId, args.eventId]
  );
  if (!ev) return;

  const modulo = String(ev.modulo || '');
  const severidade = String(ev.severidade || '');
  const okPref = await shouldSendPushForUser({ tenantId: args.tenantId, userId: args.userId, modulo, severidade });
  if (!okPref) return;

  const [subs]: any = await db.query(
    `
    SELECT id_push_dispositivo_assinatura AS id, endpoint, p256dh, auth_key AS authKey
    FROM push_dispositivos_assinaturas
    WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
    ORDER BY atualizado_em DESC
    LIMIT 20
    `,
    [args.tenantId, args.userId]
  );
  if (!subs.length) return;

  const titulo = String(ev.titulo || '').slice(0, 180);
  const mensagem = String(ev.mensagem || '').slice(0, 255);
  const rota = ev.rota ? String(ev.rota).slice(0, 255) : null;

  for (const s of subs as any[]) {
    const deviceId = Number(s.id);
    if (!deviceId) continue;
    const dedupe = `u${args.userId}.e${args.eventId}.d${deviceId}`;
    try {
      await db.execute(
        `
        INSERT IGNORE INTO notificacoes_push_fila
          (tenant_id, id_notificacao_evento, id_usuario_destinatario, id_push_dispositivo_assinatura, titulo, mensagem, rota, payload_json, status_envio, tentativas, proxima_tentativa_em, chave_deduplicacao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 0, ?, ?)
        `,
        [
          args.tenantId,
          args.eventId,
          args.userId,
          deviceId,
          titulo,
          mensagem,
          rota,
          JSON.stringify({ title: titulo, body: mensagem, route: rota, module: modulo, notificationId: args.eventId }),
          nowIso(),
          dedupe,
        ]
      );
    } catch {}
  }
}

export async function processPushQueue(args: { tenantId?: number | null; limit?: number | null }) {
  const vapid = getVapid();
  if (!vapid) return { processed: 0, sent: 0, failed: 0 };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const limit = Math.min(100, Math.max(1, Number(args.limit || 50)));
  const whereTenant = args.tenantId ? `AND q.tenant_id = ?` : '';
  const params: any[] = [];
  if (args.tenantId) params.push(Number(args.tenantId));

  const [rows]: any = await db.query(
    `
    SELECT
      q.id_notificacao_push AS id,
      q.tenant_id AS tenantId,
      q.id_notificacao_evento AS eventId,
      q.id_usuario_destinatario AS userId,
      q.id_notificacao_destinatario AS destinatarioId,
      q.id_push_dispositivo_assinatura AS deviceId,
      q.payload_json AS payloadJson,
      d.endpoint,
      d.p256dh,
      d.auth_key AS authKey,
      q.tentativas
    FROM notificacoes_push_fila q
    INNER JOIN push_dispositivos_assinaturas d ON d.id_push_dispositivo_assinatura = q.id_push_dispositivo_assinatura
    WHERE q.status_envio = 'PENDENTE'
      AND q.proxima_tentativa_em <= NOW()
      ${whereTenant}
      AND d.ativo = 1
    ORDER BY q.proxima_tentativa_em ASC, q.id_notificacao_push ASC
    LIMIT ?
    `,
    [...params, limit]
  );

  let sent = 0;
  let failed = 0;

  for (const r of rows as any[]) {
    const id = Number(r.id);
    const tenantId = Number(r.tenantId);
    const payload = r.payloadJson ? (typeof r.payloadJson === 'string' ? r.payloadJson : JSON.stringify(r.payloadJson)) : '{}';
    const subscription = {
      endpoint: String(r.endpoint),
      keys: { p256dh: String(r.p256dh), auth: String(r.authKey) },
    };

    try {
      await webpush.sendNotification(subscription as any, payload);

      await db.execute(
        `
        UPDATE notificacoes_push_fila
        SET status_envio = 'ENVIADO', enviado_em = NOW(), atualizado_em = CURRENT_TIMESTAMP
        WHERE id_notificacao_push = ?
        `,
        [id]
      );
      if (r.destinatarioId) {
        await db.execute(
          `
          UPDATE notificacoes_destinatarios
          SET entregue_push = 1
          WHERE tenant_id = ? AND id_notificacao_destinatario = ?
          `,
          [tenantId, Number(r.destinatarioId)]
        );
      }
      sent++;
    } catch (e: any) {
      failed++;
      const statusCode = Number(e?.statusCode || e?.status || 0);
      const nextAttempts = Number(r.tentativas || 0) + 1;
      const delayMin = Math.min(60, 2 ** Math.min(6, nextAttempts));
      const nextAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const msg = String(e?.body || e?.message || 'Erro ao enviar push').slice(0, 2000);

      if (statusCode === 404 || statusCode === 410) {
        try {
          await db.execute(`UPDATE push_dispositivos_assinaturas SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id_push_dispositivo_assinatura = ?`, [
            Number(r.deviceId),
          ]);
        } catch {}
      }

      await db.execute(
        `
        UPDATE notificacoes_push_fila
        SET status_envio = 'PENDENTE',
            tentativas = ?,
            proxima_tentativa_em = ?,
            erro_em = NOW(),
            ultimo_erro = ?,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id_notificacao_push = ?
        `,
        [nextAttempts, nextAt, msg, id]
      );
    }
  }

  return { processed: (rows as any[]).length, sent, failed };
}

