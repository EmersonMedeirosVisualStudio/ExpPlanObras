import { handleApiError, ok, fail } from '@/lib/api/http';
import { db } from '@/lib/db';
import { DASHBOARD_EXPORT_PROVIDERS } from '@/lib/modules/dashboard-export/registry';
import { executarExport, getUserPermissionCodes } from '@/lib/modules/relatorios-agendados/server';
import { buildEmailTemplate } from '@/lib/notifications/email/template-registry';
import type { NotificationEmailTemplateKey } from '@/lib/notifications/email/types';
import { createHash } from 'crypto';
import { publishRealtimeEvent } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

type ExecucaoPendenteRow = { id: number; tenantId: number; agendamentoId: number };

function safeJsonParse(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

async function markExecucao(args: { tenantId: number; execucaoId: number; status: string; mensagem?: string | null; final?: boolean }) {
  const fields: string[] = [`status_execucao = ?`, `mensagem_resultado = ?`];
  const params: any[] = [args.status, args.mensagem ?? null];
  if (args.final) {
    fields.push(`finalizado_em = NOW()`);
  }
  await db.execute(
    `
    UPDATE relatorios_agendamentos_execucoes
    SET ${fields.join(', ')}
    WHERE tenant_id = ? AND id_relatorio_agendamento_execucao = ?
    `,
    [...params, args.tenantId, args.execucaoId]
  );
}

async function updateAgendamentoUltimaExecucao(args: { tenantId: number; agendamentoId: number; status: string }) {
  await db.execute(
    `
    UPDATE relatorios_agendamentos
    SET ultima_execucao_em = NOW(), ultima_execucao_status = ?
    WHERE tenant_id = ? AND id_relatorio_agendamento = ?
    `,
    [args.status, args.tenantId, args.agendamentoId]
  );
}

async function insertArquivo(args: {
  tenantId: number;
  execucaoId: number;
  formato: 'PDF' | 'XLSX';
  nomeArquivo: string;
  storagePath: string;
  buffer: Buffer;
}) {
  const hash = createHash('sha256').update(args.buffer).digest('hex');
  await db.execute(
    `
    INSERT INTO relatorios_agendamentos_execucoes_arquivos
      (tenant_id, id_relatorio_agendamento_execucao, formato_arquivo, nome_arquivo, storage_path, tamanho_bytes, hash_arquivo, conteudo_blob)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [args.tenantId, args.execucaoId, args.formato, args.nomeArquivo, args.storagePath, args.buffer.length, hash, args.buffer]
  );
  return { hash, tamanhoBytes: args.buffer.length };
}

async function enqueueRelatorioEmail(args: {
  tenantId: number;
  agendamentoId: number;
  execucaoId: number;
  emailDestino: string;
  usuario: { id: number; nome: string; email: string };
  notificacao: { titulo: string; mensagem: string; modulo: string; severidade: string; rota: string | null; metadata?: Record<string, unknown> };
  anexos: { filename: string; contentType: string; contentBase64: string }[];
}) {
  const templateKey: NotificationEmailTemplateKey = 'RELATORIO_AGENDADO';
  const payload = {
    tenantId: args.tenantId,
    usuario: args.usuario,
    notificacao: {
      idEvento: null,
      titulo: args.notificacao.titulo,
      mensagem: args.notificacao.mensagem,
      severidade: args.notificacao.severidade,
      rota: args.notificacao.rota,
      modulo: args.notificacao.modulo,
      metadata: args.notificacao.metadata,
    },
  };
  const built = buildEmailTemplate(templateKey, payload);

  const dedupeKey = `relatorio.execucao.${args.execucaoId}.email.${args.emailDestino}`;
  const anexosJson = JSON.stringify(args.anexos || []);

  try {
    await db.execute(
      `
      INSERT INTO notificacoes_email_fila
        (tenant_id, id_usuario_destinatario, email_destino, template_key, assunto, payload_json, status_envio, chave_deduplicacao,
         categoria_email, origem_tipo, origem_id, anexos_json)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, 'RELATORIO', 'RELATORIO_AGENDADO_EXECUCAO', ?, ?)
      ON DUPLICATE KEY UPDATE atualizado_em = CURRENT_TIMESTAMP
      `,
      [args.tenantId, args.usuario.id, args.emailDestino, templateKey, built.assunto, JSON.stringify(payload), dedupeKey, args.execucaoId, anexosJson]
    );
  } catch {
    await db.execute(
      `
      INSERT INTO notificacoes_email_fila
        (tenant_id, id_usuario_destinatario, email_destino, template_key, assunto, payload_json, status_envio, chave_deduplicacao)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?)
      ON DUPLICATE KEY UPDATE atualizado_em = CURRENT_TIMESTAMP
      `,
      [args.tenantId, args.usuario.id, args.emailDestino, templateKey, built.assunto, JSON.stringify(payload), dedupeKey]
    );
  }
}

async function fetchExecucoesPendentes(limit: number): Promise<ExecucaoPendenteRow[]> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      `
      SELECT
        id_relatorio_agendamento_execucao AS id,
        tenant_id AS tenantId,
        id_relatorio_agendamento AS agendamentoId
      FROM relatorios_agendamentos_execucoes
      WHERE status_execucao = 'PENDENTE'
      ORDER BY id_relatorio_agendamento_execucao ASC
      LIMIT ?
      FOR UPDATE
      `,
      [limit]
    );

    const ids = (rows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    if (ids.length) {
      await conn.query(
        `
        UPDATE relatorios_agendamentos_execucoes
        SET status_execucao = 'PROCESSANDO', iniciado_em = NOW(), mensagem_resultado = NULL
        WHERE id_relatorio_agendamento_execucao IN (${ids.map(() => '?').join(',')})
          AND status_execucao = 'PENDENTE'
        `,
        ids
      );
    }

    await conn.commit();
    return (rows as any[]).map((r) => ({ id: Number(r.id), tenantId: Number(r.tenantId), agendamentoId: Number(r.agendamentoId) }));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const pendentes = await fetchExecucoesPendentes(10);
    let processadas = 0;

    for (const ex of pendentes) {
      const tenantId = ex.tenantId;
      const execucaoId = ex.id;
      const agendamentoId = ex.agendamentoId;

      try {
        const [[ag]]: any = await db.query(
          `
          SELECT
            id_relatorio_agendamento AS id,
            tenant_id AS tenantId,
            nome_agendamento AS nome,
            contexto_dashboard AS contexto,
            formato_envio AS formato,
            recorrencia,
            horario_execucao AS horarioExecucao,
            timezone,
            dia_semana AS diaSemana,
            dia_mes AS diaMes,
            filtros_json AS filtros,
            widgets_json AS widgets,
            assunto_email_template AS assuntoEmailTemplate,
            corpo_email_template AS corpoEmailTemplate,
            ativo,
            status_agendamento AS statusAgendamento,
            id_usuario_proprietario AS ownerUserId
          FROM relatorios_agendamentos
          WHERE tenant_id = ? AND id_relatorio_agendamento = ?
          LIMIT 1
          `,
          [tenantId, agendamentoId]
        );

        if (!ag) {
          await markExecucao({ tenantId, execucaoId, status: 'ERRO', mensagem: 'Agendamento não encontrado', final: true });
          continue;
        }

        if (!ag.ativo || String(ag.statusAgendamento) !== 'ATIVO') {
          await markExecucao({ tenantId, execucaoId, status: 'CANCELADO', mensagem: 'Agendamento pausado/inativo', final: true });
          await updateAgendamentoUltimaExecucao({ tenantId, agendamentoId, status: 'CANCELADO' });
          continue;
        }

        const ownerUserId = Number(ag.ownerUserId);
        const provider = DASHBOARD_EXPORT_PROVIDERS[String(ag.contexto) as any];
        if (!provider) {
          await markExecucao({ tenantId, execucaoId, status: 'ERRO', mensagem: 'Contexto não suportado', final: true });
          await updateAgendamentoUltimaExecucao({ tenantId, agendamentoId, status: 'ERRO' });
          continue;
        }

        const perms = await getUserPermissionCodes(tenantId, ownerUserId);
        const required = [String(provider.requiredPermission), 'dashboard.exportar'];
        const missing = required.filter((p) => !perms.includes(p));
        if (missing.length) {
          await markExecucao({
            tenantId,
            execucaoId,
            status: 'BLOQUEADO_PERMISSAO',
            mensagem: `Permissão ausente do proprietário: ${missing.join(', ')}`,
            final: true,
          });
          await updateAgendamentoUltimaExecucao({ tenantId, agendamentoId, status: 'BLOQUEADO_PERMISSAO' });
          continue;
        }

        const filtros = safeJsonParse(ag.filtros) || undefined;
        const files = await executarExport({
          tenantId,
          userId: ownerUserId,
          contexto: String(ag.contexto) as any,
          filtros,
          formato: String(ag.formato) as any,
        });

        const anexos: { filename: string; contentType: string; contentBase64: string }[] = [];
        for (const f of files) {
          const storagePath = `/tenants/${tenantId}/relatorios-agendados/${agendamentoId}/${execucaoId}/${f.filename}`;
          await insertArquivo({
            tenantId,
            execucaoId,
            formato: f.formato,
            nomeArquivo: f.filename,
            storagePath,
            buffer: f.buffer,
          });
          anexos.push({ filename: f.filename, contentType: f.contentType, contentBase64: f.buffer.toString('base64') });
        }

        let destinatarios: any[] = [];
        try {
          const [rows]: any = await db.query(
            `
            SELECT
              tipo_destinatario AS tipo,
              id_usuario AS idUsuario,
              email_destino AS emailDestino,
              nome_destinatario AS nomeDestinatario
            FROM relatorios_agendamentos_destinatarios
            WHERE tenant_id = ? AND id_relatorio_agendamento = ? AND ativo = 1
            ORDER BY id_relatorio_agendamento_destinatario ASC
            `,
            [tenantId, agendamentoId]
          );
          destinatarios = rows as any[];
        } catch {
          destinatarios = [];
        }

        const tituloDefault = `Relatório agendado - ${String(ag.nome)} - ${new Date().toISOString().slice(0, 10)}`;
        const titulo = ag.assuntoEmailTemplate ? String(ag.assuntoEmailTemplate) : tituloDefault;
        const mensagemDefault = `Segue o relatório do dashboard (${String(ag.contexto)}) com os anexos gerados.`;
        const mensagem = ag.corpoEmailTemplate ? String(ag.corpoEmailTemplate) : mensagemDefault;

        let totalEmails = 0;
        const totalDestinatarios = destinatarios.length;

        for (const d of destinatarios) {
          if (String(d.tipo) === 'USUARIO' && d.idUsuario) {
            const uid = Number(d.idUsuario);
            const [[urow]]: any = await db.query(
              `SELECT nome, email FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`,
              [tenantId, uid]
            );
            const email = urow?.email ? String(urow.email) : null;
            if (!email) continue;
            const nome = urow?.nome ? String(urow.nome) : `Usuário ${uid}`;
            await enqueueRelatorioEmail({
              tenantId,
              agendamentoId,
              execucaoId,
              emailDestino: email,
              usuario: { id: uid, nome, email },
              notificacao: { titulo, mensagem, modulo: 'RELATORIOS', severidade: 'INFO', rota: null, metadata: { agendamentoId, execucaoId } },
              anexos,
            });
            totalEmails++;
          } else if (String(d.tipo) === 'EMAIL' && d.emailDestino) {
            const emailDestino = String(d.emailDestino);
            const nome = d.nomeDestinatario ? String(d.nomeDestinatario) : emailDestino;
            await enqueueRelatorioEmail({
              tenantId,
              agendamentoId,
              execucaoId,
              emailDestino,
              usuario: { id: ownerUserId, nome, email: emailDestino },
              notificacao: { titulo, mensagem, modulo: 'RELATORIOS', severidade: 'INFO', rota: null, metadata: { agendamentoId, execucaoId } },
              anexos,
            });
            totalEmails++;
          }
        }

        await db.execute(
          `
          UPDATE relatorios_agendamentos_execucoes
          SET status_execucao = 'SUCESSO',
              finalizado_em = NOW(),
              total_destinatarios = ?,
              total_emails_enfileirados = ?,
              total_arquivos = ?
          WHERE tenant_id = ? AND id_relatorio_agendamento_execucao = ?
          `,
          [totalDestinatarios, totalEmails, files.length, tenantId, execucaoId]
        );

        await updateAgendamentoUltimaExecucao({ tenantId, agendamentoId, status: 'SUCESSO' });
        await publishRealtimeEvent({
          tenantId,
          topic: 'relatorios',
          name: 'relatorio.execucao.changed',
          targetType: 'USER',
          targetValue: String(ownerUserId),
          payload: { agendamentoId, execucaoId, status: 'SUCESSO' },
          ttlSeconds: 60,
        });
        await publishRealtimeEvent({
          tenantId,
          topic: 'relatorios',
          name: 'relatorio.execucao.changed',
          targetType: 'PERMISSION',
          targetValue: 'relatorios.agendados.view',
          payload: { agendamentoId, execucaoId, status: 'SUCESSO' },
          ttlSeconds: 60,
        });
      } catch (e: any) {
        const msg = String(e?.message || 'Erro ao processar execução');
        await markExecucao({ tenantId, execucaoId, status: 'ERRO', mensagem: msg, final: true });
        await updateAgendamentoUltimaExecucao({ tenantId, agendamentoId, status: 'ERRO' });
        try {
          const [[row]]: any = await db.query(
            `SELECT id_usuario_proprietario AS ownerUserId FROM relatorios_agendamentos WHERE tenant_id = ? AND id_relatorio_agendamento = ?`,
            [tenantId, agendamentoId]
          );
          const ownerUserId = Number(row?.ownerUserId || 0);
          if (ownerUserId) {
            await publishRealtimeEvent({
              tenantId,
              topic: 'relatorios',
              name: 'relatorio.execucao.changed',
              targetType: 'USER',
              targetValue: String(ownerUserId),
              payload: { agendamentoId, execucaoId, status: 'ERRO' },
              ttlSeconds: 60,
            });
          }
          await publishRealtimeEvent({
            tenantId,
            topic: 'relatorios',
            name: 'relatorio.execucao.changed',
            targetType: 'PERMISSION',
            targetValue: 'relatorios.agendados.view',
            payload: { agendamentoId, execucaoId, status: 'ERRO' },
            ttlSeconds: 60,
          });
        } catch {}
      } finally {
        processadas++;
      }
    }

    return ok({ status: 'ok', total: pendentes.length, processadas });
  } catch (e) {
    return handleApiError(e);
  }
}
