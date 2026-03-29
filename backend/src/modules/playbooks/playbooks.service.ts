import prisma from '../../plugins/prisma.js';
import { emitObservabilityEvent } from '../observabilidade/emit.js';
import { redactPayload } from '../observabilidade/redaction.js';
import { getPlaybookActionExecutor } from './registry.js';
import { maxRisk, needsApproval } from './guardrails.js';
import type { PlaybookActionType, PlaybookApprovalPolicy, PlaybookExecutionStatus, PlaybookMode, PlaybookRiskLevel } from './types.js';

function toRisk(v: any): PlaybookRiskLevel {
  const s = String(v || '').toUpperCase();
  if (s === 'MEDIO' || s === 'ALTO' || s === 'CRITICO') return s as any;
  return 'BAIXO';
}

function toApprovalPolicy(v: any): PlaybookApprovalPolicy {
  const s = String(v || '').toUpperCase();
  if (s === 'NAO_EXIGE' || s === 'EXIGE_ANTES' || s === 'EXIGE_SE_RISCO_ALTO' || s === 'QUATRO_OLHOS') return s as any;
  return 'EXIGE_SE_RISCO_ALTO';
}

function toMode(v: any): PlaybookMode {
  const s = String(v || '').toUpperCase();
  if (s === 'SEMI_AUTOMATICO' || s === 'AUTOMATICO') return s as any;
  return 'MANUAL';
}

function buildIdempotencyKey(args: { tenantId: number; playbookId: number; alertaId?: number | null; incidenteId?: number | null; eventoOrigemId?: number | null }) {
  return `${args.tenantId}:${args.playbookId}:${args.alertaId || 0}:${args.incidenteId || 0}:${args.eventoOrigemId || 0}`;
}

export async function simularPlaybook(args: { tenantId: number; playbookId: number }) {
  const pb = await prisma.observabilidadePlaybook.findUnique({
    where: { id: args.playbookId },
    include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } },
  });
  if (!pb || pb.tenantId !== args.tenantId) return { ok: false as const, reason: 'PLAYBOOK_INVALIDO' };
  const policy = toApprovalPolicy(pb.politicaAprovacao);
  let riskMax = toRisk(pb.riscoPadrao);
  const actionTypes: PlaybookActionType[] = pb.passos.map((p) => String(p.tipoAcao) as any);
  for (const p of pb.passos) riskMax = maxRisk(riskMax, toRisk(p.riscoAcao));
  const approvalRequired = needsApproval({ policy, riskMax, actionTypes });
  return {
    ok: true as const,
    playbook: { id: pb.id, codigo: pb.codigo, nome: pb.nome, modoExecucao: pb.modoExecucao, gatilhoTipo: pb.gatilhoTipo },
    riskMax,
    approvalRequired,
    policy,
    steps: pb.passos.map((p) => ({ id: p.id, ordemExecucao: p.ordemExecucao, tipoAcao: p.tipoAcao, nomePasso: p.nomePasso, riscoAcao: p.riscoAcao, reversivel: p.reversivel })),
  };
}

async function executarPasso(args: {
  tenantId: number;
  executorUserId: number;
  playbookId: number;
  execucaoId: number;
  passo: any;
  alertaId?: number | null;
  incidenteId?: number | null;
  eventoOrigemId?: number | null;
}) {
  const exec = getPlaybookActionExecutor(String(args.passo.tipoAcao) as any);
  const entrada = redactPayload(args.passo.configuracaoJson ?? null);
  const execucaoPasso = await prisma.observabilidadePlaybookExecucaoPasso.create({
    data: {
      tenantId: args.tenantId,
      execucaoId: args.execucaoId,
      passoId: args.passo.id,
      ordemExecucao: args.passo.ordemExecucao,
      statusPasso: 'EXECUTANDO',
      iniciadoEm: new Date(),
      entradaRedactedJson: entrada,
    } as any,
  });

  if (!exec) {
    await prisma.observabilidadePlaybookExecucaoPasso.update({ where: { id: execucaoPasso.id }, data: { statusPasso: 'FALHA', finalizadoEm: new Date(), erroResumo: 'EXECUTOR_NAO_SUPORTADO' } });
    return { ok: false as const, error: 'EXECUTOR_NAO_SUPORTADO', incidenteId: args.incidenteId ?? null };
  }

  const res = await exec.execute({
    tenantId: args.tenantId,
    executorUserId: args.executorUserId,
    playbookId: args.playbookId,
    execucaoId: args.execucaoId,
    passoId: args.passo.id,
    tipoAcao: args.passo.tipoAcao,
    configuracao: args.passo.configuracaoJson ?? null,
    alertaId: args.alertaId ?? null,
    incidenteId: args.incidenteId ?? null,
    eventoOrigemId: args.eventoOrigemId ?? null,
  });

  const out = redactPayload(res.output ?? null);
  await prisma.observabilidadePlaybookExecucaoPasso.update({
    where: { id: execucaoPasso.id },
    data: {
      statusPasso: res.ok ? 'CONCLUIDO' : 'FALHA',
      finalizadoEm: new Date(),
      saidaRedactedJson: out,
      erroResumo: res.ok ? null : String(res.error || 'FALHA'),
    } as any,
  });

  const incidenteId = res.incidenteId ?? args.incidenteId ?? null;
  if (incidenteId) {
    await prisma.observabilidadeIncidenteTimeline.create({
      data: {
        tenantId: args.tenantId,
        incidenteId,
        tipoEventoTimeline: 'PLAYBOOK_PASSO',
        titulo: `Playbook: ${args.passo.nomePasso}`,
        descricao: res.ok ? 'Passo executado' : 'Falha ao executar passo',
        autorUserId: args.executorUserId,
        metadataJson: { playbookId: args.playbookId, execucaoId: args.execucaoId, passoId: args.passo.id, tipoAcao: args.passo.tipoAcao, ok: res.ok },
      },
    });
  }

  await emitObservabilityEvent({
    tenantId: args.tenantId,
    categoria: res.ok ? 'SISTEMA' : 'SECURITY',
    nomeEvento: res.ok ? 'playbook.step.success' : 'playbook.step.failed',
    severidade: res.ok ? 'INFO' : 'ERROR',
    resultado: res.ok ? 'SUCESSO' : 'FALHA',
    origemTipo: 'INTERNAL',
    modulo: 'PLAYBOOKS',
    entidadeTipo: 'PLAYBOOK_EXECUCAO',
    entidadeId: args.execucaoId,
    actorUserId: args.executorUserId,
    payload: { playbookId: args.playbookId, passoId: args.passo.id, tipoAcao: args.passo.tipoAcao, ok: res.ok, error: res.error || null },
  });

  return { ok: res.ok, error: res.error, incidenteId };
}

async function runExecucao(args: { tenantId: number; execucaoId: number; executorUserId: number }) {
  const ex = await prisma.observabilidadePlaybookExecucao.findUnique({
    where: { id: args.execucaoId },
    include: { playbook: { include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } } } },
  });
  if (!ex || ex.tenantId !== args.tenantId) return { ok: false as const, reason: 'EXECUCAO_INVALIDA' };
  if (ex.statusExecucao !== 'EXECUTANDO') {
    await prisma.observabilidadePlaybookExecucao.update({ where: { id: ex.id }, data: { statusExecucao: 'EXECUTANDO', iniciadoEm: ex.iniciadoEm ?? new Date() } as any });
  }

  const pb = (ex as any).playbook;
  let incidenteId = ex.incidenteId ?? null;
  let anyFail = false;
  let executed = 0;
  for (const passo of pb.passos as any[]) {
    const r = await executarPasso({
      tenantId: args.tenantId,
      executorUserId: args.executorUserId,
      playbookId: pb.id,
      execucaoId: ex.id,
      passo,
      alertaId: ex.alertaId ?? null,
      incidenteId,
      eventoOrigemId: ex.eventoOrigemId ?? null,
    });
    executed++;
    if (r.incidenteId) incidenteId = r.incidenteId;
    if (!r.ok) {
      anyFail = true;
      if (!passo.continuaEmErro) break;
    }
  }

  const finalStatus: PlaybookExecutionStatus = anyFail ? (executed === (pb.passos as any[]).length ? 'PARCIAL' : 'FALHA') : 'CONCLUIDA';
  await prisma.observabilidadePlaybookExecucao.update({
    where: { id: ex.id },
    data: { statusExecucao: finalStatus, finalizadoEm: new Date(), resultadoResumoJson: redactPayload({ anyFail, executed, total: (pb.passos as any[]).length, incidenteId }) } as any,
  });

  await emitObservabilityEvent({
    tenantId: args.tenantId,
    categoria: anyFail ? 'SECURITY' : 'SISTEMA',
    nomeEvento: anyFail ? 'playbook.execution.failed' : 'playbook.execution.completed',
    severidade: anyFail ? 'ERROR' : 'INFO',
    resultado: anyFail ? 'FALHA' : 'SUCESSO',
    origemTipo: 'INTERNAL',
    modulo: 'PLAYBOOKS',
    entidadeTipo: 'PLAYBOOK_EXECUCAO',
    entidadeId: ex.id,
    actorUserId: args.executorUserId,
    payload: { playbookId: pb.id, statusExecucao: finalStatus, incidenteId },
  });

  return { ok: true as const, execucaoId: ex.id, statusExecucao: finalStatus, incidenteId, anyFail };
}

export async function executarPlaybook(args: { tenantId: number; executorUserId: number; playbookId: number; alertaId?: number | null; incidenteId?: number | null; eventoOrigemId?: number | null; modoExecucao?: PlaybookMode }) {
  const pb = await prisma.observabilidadePlaybook.findUnique({
    where: { id: args.playbookId },
    include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } },
  });
  if (!pb || pb.tenantId !== args.tenantId) return { ok: false as const, reason: 'PLAYBOOK_INVALIDO' };

  const sim = await simularPlaybook({ tenantId: args.tenantId, playbookId: args.playbookId });
  if (!sim.ok) return sim;

  const key = buildIdempotencyKey({ tenantId: args.tenantId, playbookId: args.playbookId, alertaId: args.alertaId ?? null, incidenteId: args.incidenteId ?? null, eventoOrigemId: args.eventoOrigemId ?? null });
  const existing = await prisma.observabilidadePlaybookExecucao.findUnique({ where: { tenantId_chaveIdempotencia: { tenantId: args.tenantId, chaveIdempotencia: key } } }).catch(() => null);
  if (existing && existing.statusExecucao !== 'CANCELADA') {
    return { ok: true as const, execucaoId: existing.id, statusExecucao: existing.statusExecucao, aprovacaoExigida: existing.aprovacaoExigida };
  }

  const status: PlaybookExecutionStatus = sim.approvalRequired ? 'PENDENTE_APROVACAO' : 'EXECUTANDO';
  const created = await prisma.observabilidadePlaybookExecucao.create({
    data: {
      tenantId: args.tenantId,
      playbookId: pb.id,
      alertaId: args.alertaId ?? null,
      incidenteId: args.incidenteId ?? null,
      eventoOrigemId: args.eventoOrigemId ?? null,
      modoExecucao: toMode(args.modoExecucao ?? pb.modoExecucao),
      statusExecucao: status,
      chaveIdempotencia: key,
      aprovacaoExigida: sim.approvalRequired,
      executadoPorUserId: args.executorUserId,
      iniciadoEm: sim.approvalRequired ? null : new Date(),
    } as any,
  });

  await emitObservabilityEvent({
    tenantId: args.tenantId,
    categoria: 'SECURITY',
    nomeEvento: 'playbook.execution.created',
    severidade: sim.approvalRequired ? 'WARNING' : 'INFO',
    resultado: 'SUCESSO',
    origemTipo: 'INTERNAL',
    modulo: 'PLAYBOOKS',
    entidadeTipo: 'PLAYBOOK_EXECUCAO',
    entidadeId: created.id,
    actorUserId: args.executorUserId,
    payload: { playbookId: pb.id, approvalRequired: sim.approvalRequired, statusExecucao: status, alertaId: args.alertaId ?? null, incidenteId: args.incidenteId ?? null, eventoOrigemId: args.eventoOrigemId ?? null },
  });

  if (sim.approvalRequired) {
    return { ok: true as const, execucaoId: created.id, statusExecucao: created.statusExecucao, aprovacaoExigida: true };
  }
  const ran = await runExecucao({ tenantId: args.tenantId, execucaoId: created.id, executorUserId: args.executorUserId });
  if (!ran.ok) return ran;
  return { ok: true as const, execucaoId: created.id, statusExecucao: ran.statusExecucao, aprovacaoExigida: false, incidenteId: ran.incidenteId };
}

export async function aprovarExecucao(args: { tenantId: number; aprovadorUserId: number; execucaoId: number }) {
  const ex = await prisma.observabilidadePlaybookExecucao.findUnique({ where: { id: args.execucaoId } }).catch(() => null);
  if (!ex || ex.tenantId !== args.tenantId) return { ok: false as const, reason: 'EXECUCAO_INVALIDA' };
  if (ex.statusExecucao !== 'PENDENTE_APROVACAO') return { ok: false as const, reason: 'STATUS_INVALIDO' };
  const pb = await prisma.observabilidadePlaybook.findUnique({ where: { id: ex.playbookId } }).catch(() => null);
  if (!pb || pb.tenantId !== args.tenantId) return { ok: false as const, reason: 'PLAYBOOK_INVALIDO' };
  if (String(pb.politicaAprovacao || '').toUpperCase() === 'QUATRO_OLHOS' && ex.executadoPorUserId && ex.executadoPorUserId === args.aprovadorUserId) {
    return { ok: false as const, reason: 'QUATRO_OLHOS' };
  }

  await prisma.observabilidadePlaybookExecucao.update({
    where: { id: ex.id },
    data: { aprovadoPorUserId: args.aprovadorUserId, aprovadoEm: new Date(), statusExecucao: 'EXECUTANDO', iniciadoEm: new Date() } as any,
  });

  const executorUserId = ex.executadoPorUserId || args.aprovadorUserId;
  const ran = await runExecucao({ tenantId: args.tenantId, execucaoId: ex.id, executorUserId });
  return { ok: true as const, triggered: ran };
}

export async function cancelarExecucao(args: { tenantId: number; userId: number; execucaoId: number; motivo?: string | null }) {
  const ex = await prisma.observabilidadePlaybookExecucao.findUnique({ where: { id: args.execucaoId } }).catch(() => null);
  if (!ex || ex.tenantId !== args.tenantId) return { ok: false as const, reason: 'EXECUCAO_INVALIDA' };
  if (ex.statusExecucao === 'CONCLUIDA' || ex.statusExecucao === 'CANCELADA') return { ok: false as const, reason: 'STATUS_INVALIDO' };
  await prisma.observabilidadePlaybookExecucao.update({
    where: { id: ex.id },
    data: { statusExecucao: 'CANCELADA', finalizadoEm: new Date(), resultadoResumoJson: redactPayload({ canceladoPor: args.userId, motivo: args.motivo ?? null }) } as any,
  });
  await emitObservabilityEvent({
    tenantId: args.tenantId,
    categoria: 'SECURITY',
    nomeEvento: 'playbook.execution.cancelled',
    severidade: 'WARNING',
    resultado: 'SUCESSO',
    origemTipo: 'INTERNAL',
    modulo: 'PLAYBOOKS',
    entidadeTipo: 'PLAYBOOK_EXECUCAO',
    entidadeId: ex.id,
    actorUserId: args.userId,
    payload: { motivo: args.motivo ?? null },
  });
  return { ok: true as const };
}

