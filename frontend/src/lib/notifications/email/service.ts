import { db } from '@/lib/db';
import type { NotificationEmailMode, NotificationEmailTemplateKey } from './types';
import { buildEmailTemplate } from './template-registry';
import { getEmailProvider } from '@/lib/email/provider';

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function retryDelayMinutes(attempt: number) {
  if (attempt <= 1) return 0;
  if (attempt === 2) return 5;
  if (attempt === 3) return 15;
  if (attempt === 4) return 60;
  return 360;
}

async function safeScalar(sql: string, params: any[], field: string) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return row?.[field] ?? null;
  } catch {
    return null;
  }
}

async function getUserEmail(tenantId: number, userId: number): Promise<string | null> {
  const email = await safeScalar(
    `SELECT email FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`,
    [tenantId, userId],
    'email'
  );
  return email ? String(email) : null;
}

async function getUserName(tenantId: number, userId: number): Promise<string> {
  const nome = await safeScalar(
    `SELECT nome FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`,
    [tenantId, userId],
    'nome'
  );
  return nome ? String(nome) : `Usuário ${userId}`;
}

async function getEmailPreference(args: { tenantId: number; userId: number; modulo: string }) {
  try {
    const [[row]]: any = await db.query(
      `
      SELECT
        recebe_email AS recebeEmail,
        modo_email AS modoEmail,
        somente_criticas_email AS somenteCriticasEmail,
        recebe_email_critico_forcado AS recebeEmailCriticoForcado
      FROM notificacoes_preferencias_usuario
      WHERE tenant_id = ? AND id_usuario = ? AND modulo = ? AND ativo = 1
      LIMIT 1
      `,
      [args.tenantId, args.userId, args.modulo]
    );
    if (!row) return null;
    return {
      recebeEmail: !!row.recebeEmail,
      modoEmail: String(row.modoEmail || 'IMEDIATO') as NotificationEmailMode,
      somenteCriticasEmail: !!row.somenteCriticasEmail,
      recebeEmailCriticoForcado: !!row.recebeEmailCriticoForcado,
    };
  } catch {
    return null;
  }
}

function shouldSendImmediate(pref: any, severidade: string) {
  if (!pref) return false;
  if (pref.modoEmail !== 'IMEDIATO') return false;
  if (!pref.recebeEmail && !(pref.recebeEmailCriticoForcado && (severidade === 'DANGER' || severidade === 'CRITICAL'))) return false;
  if (pref.somenteCriticasEmail && !(severidade === 'DANGER' || severidade === 'CRITICAL')) return false;
  return true;
}

export async function enqueueImmediateEmailForEvent(args: { tenantId: number; userId: number; eventId: number }) {
  const { tenantId, userId, eventId } = args;

  const email = await getUserEmail(tenantId, userId);
  if (!email) return;

  let event: any = null;
  try {
    const [[row]]: any = await db.query(
      `
      SELECT id_notificacao_evento AS idEvento, modulo, severidade, titulo, mensagem, rota, metadata_json AS metadataJson, resolvida_em AS resolvidaEm
      FROM notificacoes_eventos
      WHERE tenant_id = ? AND id_notificacao_evento = ?
      LIMIT 1
      `,
      [tenantId, eventId]
    );
    event = row;
  } catch {
    return;
  }
  if (!event || event.resolvidaEm) return;

  const pref = await getEmailPreference({ tenantId, userId, modulo: String(event.modulo) });
  if (!shouldSendImmediate(pref, String(event.severidade))) return;

  const dedupeKey = `email.imediato.evento.${eventId}.usuario.${userId}`;
  const templateKey: NotificationEmailTemplateKey = 'ALERTA_IMEDIATO';

  const nome = await getUserName(tenantId, userId);
  const payload = {
    tenantId,
    usuario: { id: userId, nome, email },
    notificacao: {
      idEvento: eventId,
      titulo: String(event.titulo),
      mensagem: String(event.mensagem),
      severidade: String(event.severidade),
      rota: event.rota ? String(event.rota) : null,
      modulo: String(event.modulo),
      metadata: event.metadataJson ? JSON.parse(String(event.metadataJson)) : undefined,
    },
  };

  const built = buildEmailTemplate(templateKey, payload);

  try {
    await db.execute(
      `
      INSERT INTO notificacoes_email_fila
        (tenant_id, id_notificacao_evento, id_usuario_destinatario, email_destino, template_key, assunto, payload_json, status_envio, chave_deduplicacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?)
      ON DUPLICATE KEY UPDATE
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [tenantId, eventId, userId, email, templateKey, built.assunto, JSON.stringify(payload), dedupeKey]
    );
  } catch {}
}

export async function processPendingNotificationEmails(limit = 20) {
  const provider = getEmailProvider();
  let rows: any[] = [];
  try {
    const [r]: any = await db.query(
      `
      SELECT
        id_notificacao_email AS id,
        tenant_id AS tenantId,
        id_notificacao_evento AS eventId,
        id_usuario_destinatario AS userId,
        email_destino AS emailDestino,
        template_key AS templateKey,
        assunto,
        payload_json AS payloadJson,
        anexos_json AS anexosJson,
        tentativas,
        status_envio AS statusEnvio
      FROM notificacoes_email_fila
      WHERE status_envio = 'PENDENTE'
        AND proxima_tentativa_em <= NOW()
      ORDER BY id_notificacao_email ASC
      LIMIT ?
      `,
      [limit]
    );
    rows = r as any[];
  } catch {
    const [r]: any = await db.query(
      `
      SELECT
        id_notificacao_email AS id,
        tenant_id AS tenantId,
        id_notificacao_evento AS eventId,
        id_usuario_destinatario AS userId,
        email_destino AS emailDestino,
        template_key AS templateKey,
        assunto,
        payload_json AS payloadJson,
        tentativas,
        status_envio AS statusEnvio
      FROM notificacoes_email_fila
      WHERE status_envio = 'PENDENTE'
        AND proxima_tentativa_em <= NOW()
      ORDER BY id_notificacao_email ASC
      LIMIT ?
      `,
      [limit]
    );
    rows = r as any[];
  }

  for (const job of rows as any[]) {
    const id = Number(job.id);
    const tentativas = Number(job.tentativas || 0);
    const now = new Date();

    try {
      await db.execute(
        `UPDATE notificacoes_email_fila SET status_envio = 'PROCESSANDO', processando_desde = NOW() WHERE id_notificacao_email = ? AND status_envio = 'PENDENTE'`,
        [id]
      );
    } catch {
      continue;
    }

    try {
      const payload = JSON.parse(String(job.payloadJson || '{}'));
      const templateKey = String(job.templateKey) as NotificationEmailTemplateKey;
      const built = buildEmailTemplate(templateKey, payload);

      let attachments: { filename: string; contentType: string; content: Buffer }[] | undefined;
      try {
        const raw = job.anexosJson ? JSON.parse(String(job.anexosJson)) : null;
        if (Array.isArray(raw)) {
          attachments = raw
            .filter((a) => a && a.filename && a.contentBase64)
            .map((a) => ({
              filename: String(a.filename),
              contentType: String(a.contentType || 'application/octet-stream'),
              content: Buffer.from(String(a.contentBase64), 'base64'),
            }));
        }
      } catch {}

      const out = await provider.send({
        to: String(job.emailDestino),
        subject: built.assunto,
        html: built.html,
        text: built.text,
        attachments,
      });

      await db.execute(
        `
        UPDATE notificacoes_email_fila
        SET status_envio = 'ENVIADO', enviado_em = NOW(), provider_message_id = ?, tentativas = ?, processando_desde = NULL, ultimo_erro = NULL
        WHERE id_notificacao_email = ?
        `,
        [out.messageId, tentativas + 1, id]
      );
    } catch (e: any) {
      const nextAttempt = tentativas + 1;
      const delay = retryDelayMinutes(nextAttempt);
      const nextAt = addMinutes(now, delay);
      const status = nextAttempt >= 5 ? 'ERRO' : 'PENDENTE';
      const msg = String(e?.message || 'Erro ao enviar e-mail');
      await db.execute(
        `
        UPDATE notificacoes_email_fila
        SET status_envio = ?, tentativas = ?, proxima_tentativa_em = ?, erro_em = NOW(), ultimo_erro = ?, processando_desde = NULL
        WHERE id_notificacao_email = ?
        `,
        [status, nextAttempt, nextAt, msg, id]
      );
    }
  }
}

export async function retryNotificationEmail(args: { tenantId: number; jobId: number }) {
  try {
    await db.execute(
      `
      UPDATE notificacoes_email_fila
      SET status_envio = 'PENDENTE', proxima_tentativa_em = NOW(), ultimo_erro = NULL, processando_desde = NULL
      WHERE tenant_id = ? AND id_notificacao_email = ? AND status_envio IN ('ERRO','CANCELADO')
      `,
      [args.tenantId, args.jobId]
    );
  } catch {}
}

export async function cancelNotificationEmail(args: { tenantId: number; jobId: number }) {
  try {
    await db.execute(
      `
      UPDATE notificacoes_email_fila
      SET status_envio = 'CANCELADO'
      WHERE tenant_id = ? AND id_notificacao_email = ? AND status_envio IN ('PENDENTE','ERRO')
      `,
      [args.tenantId, args.jobId]
    );
  } catch {}
}

export async function enqueueDigestEmailForUser(args: { tenantId: number; userId: number; templateKey: NotificationEmailTemplateKey; dedupeKey: string }) {
  const email = await getUserEmail(args.tenantId, args.userId);
  if (!email) return;
  const nome = await getUserName(args.tenantId, args.userId);

  let itens: any[] = [];
  try {
    const [rows]: any = await db.query(
      `
      SELECT e.modulo, e.severidade, e.titulo, e.mensagem, e.rota
      FROM notificacoes_destinatarios d
      INNER JOIN notificacoes_eventos e ON e.id_notificacao_evento = d.id_notificacao_evento
      WHERE d.tenant_id = ? AND d.id_usuario = ?
        AND d.status_leitura = 'NAO_LIDA'
        AND e.resolvida_em IS NULL
        AND (e.expira_em IS NULL OR e.expira_em > NOW())
      ORDER BY e.atualizado_em DESC
      LIMIT 50
      `,
      [args.tenantId, args.userId]
    );
    itens = rows as any[];
  } catch {
    itens = [];
  }

  const payload = {
    tenantId: args.tenantId,
    usuario: { id: args.userId, nome, email },
    notificacao: { idEvento: null, titulo: 'Digesto', mensagem: 'Digesto de notificações', severidade: 'INFO', rota: null, modulo: 'ADMIN' },
    itensDigesto: itens.map((i) => ({
      titulo: String(i.titulo),
      mensagem: String(i.mensagem),
      rota: i.rota ? String(i.rota) : null,
      modulo: String(i.modulo),
      severidade: String(i.severidade),
    })),
  };

  const built = buildEmailTemplate(args.templateKey, payload);
  try {
    await db.execute(
      `
      INSERT INTO notificacoes_email_fila
        (tenant_id, id_usuario_destinatario, email_destino, template_key, assunto, payload_json, status_envio, chave_deduplicacao)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?)
      ON DUPLICATE KEY UPDATE atualizado_em = CURRENT_TIMESTAMP
      `,
      [args.tenantId, args.userId, email, args.templateKey, built.assunto, JSON.stringify(payload), args.dedupeKey]
    );
  } catch {}
}
