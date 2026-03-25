import type { WorkflowTipoAcao } from './types';
import type { AlertSignal } from '@/lib/alerts/types';
import { assignNotificationRecipient, upsertNotificationEvent } from '@/lib/notifications/service';
import { publishRealtimeEvent } from '@/lib/realtime/publish';
import { criarSolicitacaoAprovacao, enviarSolicitacaoAprovacao } from '@/lib/modules/aprovacoes/server';
import { db } from '@/lib/db';
import { getWorkflowHandler } from './registry';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function notifyUser(args: { tenantId: number; userId: number; signal: AlertSignal }) {
  const eventId = await upsertNotificationEvent({ tenantId: args.tenantId, userId: args.userId, signal: args.signal });
  await assignNotificationRecipient({ tenantId: args.tenantId, eventId, userId: args.userId });
}

export async function executeWorkflowAction(args: {
  tenantId: number;
  workflowInstanciaId: number;
  entidadeTipo: string;
  entidadeId: number;
  userId: number;
  tipoAcao: WorkflowTipoAcao;
  configuracao: any;
  contexto: Record<string, unknown>;
}) {
  const tipo = args.tipoAcao;
  const cfg = args.configuracao || {};

  if (tipo === 'NOTIFICAR') {
    const userIds = Array.isArray(cfg.userIds) ? cfg.userIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
    const titulo = cfg.titulo ? String(cfg.titulo) : 'Workflow';
    const mensagem = cfg.mensagem ? String(cfg.mensagem) : `Workflow ${args.entidadeTipo}:${args.entidadeId}`;
    const rota = cfg.rota ? String(cfg.rota) : getWorkflowHandler(args.entidadeTipo)?.rotaDetalhe?.(args.entidadeId) ?? '/dashboard/workflows';

    for (const uid of userIds) {
      await notifyUser({
        tenantId: args.tenantId,
        userId: uid,
        signal: {
          module: 'ADMIN',
          key: 'WORKFLOW_NOTIFICACAO',
          dedupeKey: `workflow.${args.workflowInstanciaId}.notify.${uid}.${titulo}`,
          severity: 'INFO',
          titulo,
          mensagem,
          rota,
          entidadeTipo: 'WORKFLOW_INSTANCIA',
          entidadeId: args.workflowInstanciaId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { workflowInstanciaId: args.workflowInstanciaId, entidadeTipo: args.entidadeTipo, entidadeId: args.entidadeId },
        },
      });
    }
    return;
  }

  if (tipo === 'REALTIME') {
    const topic = String(cfg.topic || 'menu');
    const name = String(cfg.name || 'workflow.changed');
    const targetType = String(cfg.targetType || 'TENANT') as any;
    const targetValue = cfg.targetValue ? String(cfg.targetValue) : null;
    const payload = cfg.payload && typeof cfg.payload === 'object' ? cfg.payload : { workflowInstanciaId: args.workflowInstanciaId };
    await publishRealtimeEvent({ tenantId: args.tenantId, topic: topic as any, name, targetType, targetValue, payload, ttlSeconds: 60 });
    return;
  }

  if (tipo === 'CRIAR_TAREFA') {
    const titulo = String(cfg.titulo || `Tarefa do workflow #${args.workflowInstanciaId}`).slice(0, 180);
    const descricao = cfg.descricao ? String(cfg.descricao) : null;
    const idUsuario = cfg.idUsuarioResponsavel !== undefined && cfg.idUsuarioResponsavel !== null ? Number(cfg.idUsuarioResponsavel) : null;
    const prazoHoras = cfg.prazoHoras !== undefined && cfg.prazoHoras !== null ? Number(cfg.prazoHoras) : null;
    const prazo = prazoHoras && prazoHoras > 0 ? new Date(Date.now() + prazoHoras * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ') : null;

    await db.execute(
      `
      INSERT INTO workflows_instancias_tarefas
        (tenant_id, id_workflow_instancia, tipo_tarefa, titulo_tarefa, descricao_tarefa, id_usuario_responsavel, status_tarefa, prazo_em)
      VALUES (?, ?, 'ACAO_MANUAL', ?, ?, ?, 'PENDENTE', ?)
      `,
      [args.tenantId, args.workflowInstanciaId, titulo, descricao, idUsuario, prazo]
    );
    return;
  }

  if (tipo === 'CRIAR_APROVACAO') {
    const idModelo = cfg.idModelo !== undefined && cfg.idModelo !== null ? Number(cfg.idModelo) : null;
    const out = await criarSolicitacaoAprovacao({
      tenantId: args.tenantId,
      entidadeTipo: String(args.entidadeTipo).toUpperCase(),
      entidadeId: args.entidadeId,
      userId: args.userId,
      idModelo,
    });
    if (cfg.enviar !== false) {
      await enviarSolicitacaoAprovacao({ tenantId: args.tenantId, solicitacaoId: out.id, userId: args.userId });
    }
    return;
  }

  if (tipo === 'CHAMAR_HANDLER') {
    const handler = getWorkflowHandler(args.entidadeTipo);
    if (!handler?.validarTransicao) return;
    await handler.validarTransicao({
      tenantId: args.tenantId,
      entidadeId: args.entidadeId,
      chaveTransicao: String(cfg.chaveTransicao || ''),
      formulario: (args.contexto as any)?.formulario as any,
      userId: args.userId,
    });
    return;
  }
}

