import { db } from '@/lib/db';
import { publishMenuRefreshForUser, publishNotificationNewForUser } from '@/lib/realtime/publish';
import type { AlertSignal, AlertCollectContext } from '@/lib/alerts/types';
import { ALERT_PROVIDERS } from '@/lib/alerts/registry';
import { enqueueImmediateEmailForEvent } from '@/lib/notifications/email/service';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function collectAlertSignals(ctx: AlertCollectContext): Promise<AlertSignal[]> {
  const providers = ALERT_PROVIDERS;
  const signals = (await Promise.all(providers.map((p) => p.collect(ctx)))).flat();
  return signals;
}

export async function upsertNotificationEvent(args: { tenantId: number; userId: number; signal: AlertSignal }): Promise<number> {
  const { tenantId, userId, signal } = args;
  const dedupe = `u${userId}.${signal.dedupeKey}`;

  const payload = {
    modulo: signal.module,
    chave_evento: signal.key,
    chave_deduplicacao: dedupe,
    severidade: signal.severity,
    titulo: signal.titulo,
    mensagem: signal.mensagem,
    rota: signal.rota ?? null,
    entidade_tipo: signal.entidadeTipo ?? null,
    entidade_id: signal.entidadeId ?? null,
    referencia_data: signal.referenciaData ? new Date(signal.referenciaData) : null,
    expira_em: signal.expiresAt ? new Date(signal.expiresAt) : null,
    metadata_json: signal.metadata ? JSON.stringify(signal.metadata) : null,
  };

  await db.execute(
    `
    INSERT INTO notificacoes_eventos
      (tenant_id, modulo, chave_evento, chave_deduplicacao, severidade, titulo, mensagem, rota, entidade_tipo, entidade_id, referencia_data, expira_em, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      modulo = VALUES(modulo),
      chave_evento = VALUES(chave_evento),
      severidade = VALUES(severidade),
      titulo = VALUES(titulo),
      mensagem = VALUES(mensagem),
      rota = VALUES(rota),
      entidade_tipo = VALUES(entidade_tipo),
      entidade_id = VALUES(entidade_id),
      referencia_data = VALUES(referencia_data),
      expira_em = VALUES(expira_em),
      metadata_json = VALUES(metadata_json),
      resolvida_em = NULL
    `,
    [
      tenantId,
      payload.modulo,
      payload.chave_evento,
      payload.chave_deduplicacao,
      payload.severidade,
      payload.titulo,
      payload.mensagem,
      payload.rota,
      payload.entidade_tipo,
      payload.entidade_id,
      payload.referencia_data,
      payload.expira_em,
      payload.metadata_json,
    ]
  );

  const [[row]]: any = await db.query(
    `SELECT id_notificacao_evento AS id FROM notificacoes_eventos WHERE tenant_id = ? AND chave_deduplicacao = ? LIMIT 1`,
    [tenantId, dedupe]
  );
  return Number(row?.id);
}

export async function assignNotificationRecipient(args: { tenantId: number; eventId: number; userId: number }) {
  const { tenantId, eventId, userId } = args;
  try {
    const [res]: any = await db.execute(
      `
      INSERT IGNORE INTO notificacoes_destinatarios
        (id_notificacao_evento, tenant_id, id_usuario, status_leitura, entregue_no_app, entregue_email, entregue_push)
      VALUES (?, ?, ?, 'NAO_LIDA', 1, 0, 0)
      `,
      [eventId, tenantId, userId]
    );
    const inserted = Number(res?.affectedRows || 0) > 0;
    if (inserted) {
      await enqueueImmediateEmailForEvent({ tenantId, userId, eventId });
      await publishNotificationNewForUser(tenantId, userId, eventId);
      await publishMenuRefreshForUser(tenantId, userId);
    }
  } catch {}
}

export async function resolveMissingUserSignals(args: { tenantId: number; userId: number; activeDedupeKeys: string[] }) {
  const { tenantId, userId, activeDedupeKeys } = args;
  const prefix = `u${userId}.`;
  const active = new Set(activeDedupeKeys.map((k) => `${prefix}${k}`));

  const rows = await safeQuery(
    async () => {
      const [r]: any = await db.query(
        `
        SELECT id_notificacao_evento AS id, chave_deduplicacao AS dedupe
        FROM notificacoes_eventos
        WHERE tenant_id = ?
          AND resolvida_em IS NULL
          AND chave_deduplicacao LIKE ?
        `,
        [tenantId, `${prefix}%`]
      );
      return r as any[];
    },
    []
  );

  const toResolve = rows.filter((r: any) => !active.has(String(r.dedupe)));
  if (!toResolve.length) return;

  const ids = toResolve.map((r: any) => Number(r.id)).filter((n) => Number.isFinite(n));
  if (!ids.length) return;

  await db.execute(
    `
    UPDATE notificacoes_eventos
    SET resolvida_em = ?
    WHERE tenant_id = ? AND id_notificacao_evento IN (${ids.map(() => '?').join(',')})
    `,
    [nowIso(), tenantId, ...ids]
  );
}

export async function syncNotificationsForUser(args: { tenantId: number; userId: number; permissions: string[]; scope: AlertCollectContext['scope'] }) {
  const { tenantId, userId, permissions, scope } = args;

  const signals = await collectAlertSignals({ tenantId, userId, permissions, scope });
  const activeDedupeKeys = signals.map((s) => s.dedupeKey);

  await safeQuery(async () => {
    for (const s of signals) {
      const eventId = await upsertNotificationEvent({ tenantId, userId, signal: s });
      await assignNotificationRecipient({ tenantId, eventId, userId });
    }
    await resolveMissingUserSignals({ tenantId, userId, activeDedupeKeys });
    return null;
  }, null);
}
