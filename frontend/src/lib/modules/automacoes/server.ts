import { db } from '@/lib/db';
import type {
  AutomacaoExecucaoDTO,
  AutomacaoExecucaoStatus,
  AutomacaoOcorrenciaStatus,
  AutomacaoRecorrencia,
  AutomacaoTaskStatus,
  PendenciaOcorrenciaDTO,
  PendenciaSignal,
  SlaPoliticaDTO,
  TarefaInstanciaDTO,
  TarefaRecorrenteModeloDTO,
  TarefaRecorrenteModeloSaveDTO,
} from './types';
import { PENDENCIA_PROVIDERS } from './providers';
import { findUserIdsByPermission, resolveResponsavelUserIds } from './resolve-responsavel';
import { upsertNotificationEvent, assignNotificationRecipient } from '@/lib/notifications/service';
import type { AlertModule, AlertSignal } from '@/lib/alerts/types';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function toIsoDateTime(d: Date) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseTime(hhmmss: string) {
  const p = String(hhmmss || '00:00:00').split(':').map((n) => Number(n));
  const h = Number(p[0] || 0);
  const m = Number(p[1] || 0);
  const s = Number(p[2] || 0);
  return { h, m, s };
}

function normalizeTipoLocal(v: unknown): 'OBRA' | 'UNIDADE' | 'DIRETORIA' | 'EMPRESA' | null {
  const s = v ? String(v).toUpperCase() : '';
  if (s === 'OBRA' || s === 'UNIDADE' || s === 'DIRETORIA' || s === 'EMPRESA') return s;
  return null;
}

function normalizeAlertModule(v: unknown): AlertModule {
  const s = v ? String(v).toUpperCase() : '';
  if (s === 'RH') return 'RH';
  if (s === 'SST') return 'SST';
  if (s === 'SUPRIMENTOS' || s === 'SUP') return 'SUPRIMENTOS';
  if (s === 'ENGENHARIA' || s === 'ENG') return 'ENGENHARIA';
  return 'ADMIN';
}

export function calcularProximaExecucaoAutomacao(args: {
  recorrencia: AutomacaoRecorrencia;
  horarioExecucao: string;
  diaSemana: number | null;
  diaMes: number | null;
  from?: Date;
}) {
  const base = args.from ? new Date(args.from.getTime()) : new Date();
  const { h, m, s } = parseTime(args.horarioExecucao);

  if (args.recorrencia === 'DIARIA') {
    const d = new Date(base.getTime());
    d.setHours(h, m, s, 0);
    if (d <= base) d.setDate(d.getDate() + 1);
    return d;
  }

  if (args.recorrencia === 'SEMANAL') {
    const target = args.diaSemana === null ? 1 : Number(args.diaSemana);
    const d = new Date(base.getTime());
    d.setHours(h, m, s, 0);
    const day = d.getDay();
    const targetJs = ((target % 7) + 7) % 7;
    let delta = targetJs - day;
    if (delta < 0) delta += 7;
    if (delta === 0 && d <= base) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  const dayOfMonth = args.diaMes === null ? 1 : Math.min(Math.max(Number(args.diaMes), 1), 28);
  const d = new Date(base.getTime());
  d.setHours(h, m, s, 0);
  d.setDate(dayOfMonth);
  if (d <= base) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(dayOfMonth);
  }
  return d;
}

async function createExecucao(args: {
  tenantId: number;
  tipoExecucao: AutomacaoExecucaoDTO['tipoExecucao'];
  execucaoManual: boolean;
  userId: number | null;
}) {
  const iniciado = nowIso();
  await db.execute(
    `
    INSERT INTO automacoes_execucoes
      (tenant_id, tipo_execucao, status_execucao, id_usuario_executor_manual, execucao_manual, iniciado_em)
    VALUES (?, ?, 'PROCESSANDO', ?, ?, ?)
    `,
    [args.tenantId, args.tipoExecucao, args.userId, args.execucaoManual ? 1 : 0, iniciado]
  );
  const [[row]]: any = await db.query(
    `SELECT id_automacao_execucao AS id FROM automacoes_execucoes WHERE tenant_id = ? ORDER BY id_automacao_execucao DESC LIMIT 1`,
    [args.tenantId]
  );
  return Number(row?.id);
}

async function finishExecucao(args: {
  tenantId: number;
  execucaoId: number;
  status: AutomacaoExecucaoStatus;
  totals: { processado: number; criado: number; notificado: number; escalado: number };
  mensagem: string | null;
}) {
  await db.execute(
    `
    UPDATE automacoes_execucoes
    SET status_execucao = ?,
        finalizado_em = ?,
        total_processado = ?,
        total_criado = ?,
        total_notificado = ?,
        total_escalado = ?,
        mensagem_resultado = ?
    WHERE tenant_id = ? AND id_automacao_execucao = ?
    `,
    [
      args.status,
      nowIso(),
      args.totals.processado,
      args.totals.criado,
      args.totals.notificado,
      args.totals.escalado,
      args.mensagem,
      args.tenantId,
      args.execucaoId,
    ]
  );
}

export async function listarModelos(tenantId: number): Promise<TarefaRecorrenteModeloDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      id_automacao_tarefa_modelo AS id,
      nome_modelo AS nome,
      modulo,
      tipo_local AS tipoLocal,
      id_obra AS idObra,
      id_unidade AS idUnidade,
      id_setor_diretoria AS idDiretoria,
      recorrencia,
      horario_execucao AS horarioExecucao,
      timezone,
      dia_semana AS diaSemana,
      dia_mes AS diaMes,
      titulo_tarefa AS tituloTarefa,
      descricao_tarefa AS descricaoTarefa,
      responsavel_tipo AS responsavelTipo,
      id_usuario_responsavel AS idUsuarioResponsavel,
      permissao_responsavel AS permissaoResponsavel,
      gera_notificacao AS geraNotificacao,
      gera_email AS geraEmail,
      ativo,
      proxima_execucao_em AS proximaExecucaoEm,
      ultima_execucao_em AS ultimaExecucaoEm
    FROM automacoes_tarefas_modelos
    WHERE tenant_id = ?
    ORDER BY ativo DESC, nome_modelo ASC
    `,
    [tenantId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    nome: String(r.nome),
    modulo: String(r.modulo),
    tipoLocal: normalizeTipoLocal(r.tipoLocal),
    idObra: r.idObra !== null ? Number(r.idObra) : null,
    idUnidade: r.idUnidade !== null ? Number(r.idUnidade) : null,
    idDiretoria: r.idDiretoria !== null ? Number(r.idDiretoria) : null,
    recorrencia: String(r.recorrencia) as any,
    horarioExecucao: String(r.horarioExecucao),
    timezone: String(r.timezone || 'America/Sao_Paulo'),
    diaSemana: r.diaSemana !== null ? Number(r.diaSemana) : null,
    diaMes: r.diaMes !== null ? Number(r.diaMes) : null,
    tituloTarefa: String(r.tituloTarefa),
    descricaoTarefa: r.descricaoTarefa ? String(r.descricaoTarefa) : null,
    responsavelTipo: String(r.responsavelTipo) as any,
    idUsuarioResponsavel: r.idUsuarioResponsavel !== null ? Number(r.idUsuarioResponsavel) : null,
    permissaoResponsavel: r.permissaoResponsavel ? String(r.permissaoResponsavel) : null,
    geraNotificacao: Boolean(r.geraNotificacao),
    geraEmail: Boolean(r.geraEmail),
    ativo: Boolean(r.ativo),
    proximaExecucaoEm: r.proximaExecucaoEm ? new Date(r.proximaExecucaoEm).toISOString() : null,
    ultimaExecucaoEm: r.ultimaExecucaoEm ? new Date(r.ultimaExecucaoEm).toISOString() : null,
  }));
}

export async function criarModelo(tenantId: number, body: TarefaRecorrenteModeloSaveDTO) {
  const next = calcularProximaExecucaoAutomacao({
    recorrencia: body.recorrencia,
    horarioExecucao: body.horarioExecucao,
    diaSemana: body.diaSemana,
    diaMes: body.diaMes,
  });
  await db.execute(
    `
    INSERT INTO automacoes_tarefas_modelos
      (tenant_id, nome_modelo, modulo, tipo_local, id_obra, id_unidade, id_setor_diretoria,
       titulo_tarefa, descricao_tarefa, recorrencia, horario_execucao, timezone, dia_semana, dia_mes,
       responsavel_tipo, id_usuario_responsavel, permissao_responsavel,
       gera_notificacao, gera_email, ativo, proxima_execucao_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      tenantId,
      body.nome,
      body.modulo,
      body.tipoLocal,
      body.idObra,
      body.idUnidade,
      body.idDiretoria,
      body.tituloTarefa,
      body.descricaoTarefa,
      body.recorrencia,
      body.horarioExecucao,
      body.timezone || 'America/Sao_Paulo',
      body.diaSemana,
      body.diaMes,
      body.responsavelTipo,
      body.idUsuarioResponsavel,
      body.permissaoResponsavel,
      body.geraNotificacao ? 1 : 0,
      body.geraEmail ? 1 : 0,
      body.ativo ? 1 : 0,
      toIsoDateTime(next),
    ]
  );
  const [[row]]: any = await db.query(
    `SELECT id_automacao_tarefa_modelo AS id FROM automacoes_tarefas_modelos WHERE tenant_id = ? ORDER BY id_automacao_tarefa_modelo DESC LIMIT 1`,
    [tenantId]
  );
  return Number(row?.id);
}

export async function atualizarModelo(tenantId: number, id: number, body: TarefaRecorrenteModeloSaveDTO) {
  const next = calcularProximaExecucaoAutomacao({
    recorrencia: body.recorrencia,
    horarioExecucao: body.horarioExecucao,
    diaSemana: body.diaSemana,
    diaMes: body.diaMes,
  });
  await db.execute(
    `
    UPDATE automacoes_tarefas_modelos
    SET nome_modelo = ?,
        modulo = ?,
        tipo_local = ?,
        id_obra = ?,
        id_unidade = ?,
        id_setor_diretoria = ?,
        titulo_tarefa = ?,
        descricao_tarefa = ?,
        recorrencia = ?,
        horario_execucao = ?,
        timezone = ?,
        dia_semana = ?,
        dia_mes = ?,
        responsavel_tipo = ?,
        id_usuario_responsavel = ?,
        permissao_responsavel = ?,
        gera_notificacao = ?,
        gera_email = ?,
        ativo = ?,
        proxima_execucao_em = ?
    WHERE tenant_id = ? AND id_automacao_tarefa_modelo = ?
    `,
    [
      body.nome,
      body.modulo,
      body.tipoLocal,
      body.idObra,
      body.idUnidade,
      body.idDiretoria,
      body.tituloTarefa,
      body.descricaoTarefa,
      body.recorrencia,
      body.horarioExecucao,
      body.timezone || 'America/Sao_Paulo',
      body.diaSemana,
      body.diaMes,
      body.responsavelTipo,
      body.idUsuarioResponsavel,
      body.permissaoResponsavel,
      body.geraNotificacao ? 1 : 0,
      body.geraEmail ? 1 : 0,
      body.ativo ? 1 : 0,
      toIsoDateTime(next),
      tenantId,
      id,
    ]
  );
}

export async function listarInstancias(tenantId: number, args?: { status?: AutomacaoTaskStatus; userId?: number; limit?: number }) {
  const where: string[] = [`tenant_id = ?`];
  const params: any[] = [tenantId];
  if (args?.status) {
    where.push(`status_tarefa = ?`);
    params.push(args.status);
  }
  if (args?.userId) {
    where.push(`id_usuario_atribuido = ?`);
    params.push(args.userId);
  }
  const limit = Math.min(Math.max(Number(args?.limit || 50), 5), 200);
  const [rows]: any = await db.query(
    `
    SELECT
      id_automacao_tarefa_instancia AS id,
      id_automacao_tarefa_modelo AS idModelo,
      referencia_periodo AS referenciaPeriodo,
      titulo_tarefa AS tituloTarefa,
      descricao_tarefa AS descricaoTarefa,
      status_tarefa AS status,
      prevista_para AS previstaPara,
      id_usuario_atribuido AS idUsuarioAtribuido,
      atribuido_em AS atribuidaEm,
      iniciada_em AS iniciadaEm,
      concluida_em AS concluidaEm,
      concluida_por_usuario AS concluidaPorUsuario,
      origem_entidade_tipo AS origemEntidadeTipo,
      origem_entidade_id AS origemEntidadeId
    FROM automacoes_tarefas_instancias
    WHERE ${where.join(' AND ')}
    ORDER BY prevista_para DESC, id_automacao_tarefa_instancia DESC
    LIMIT ?
    `,
    [...params, limit]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    idModelo: Number(r.idModelo),
    referenciaPeriodo: String(r.referenciaPeriodo),
    tituloTarefa: String(r.tituloTarefa),
    descricaoTarefa: r.descricaoTarefa ? String(r.descricaoTarefa) : null,
    status: String(r.status) as any,
    previstaPara: new Date(r.previstaPara).toISOString(),
    idUsuarioAtribuido: r.idUsuarioAtribuido !== null ? Number(r.idUsuarioAtribuido) : null,
    atribuidaEm: r.atribuidaEm ? new Date(r.atribuidaEm).toISOString() : null,
    iniciadaEm: r.iniciadaEm ? new Date(r.iniciadaEm).toISOString() : null,
    concluidaEm: r.concluidaEm ? new Date(r.concluidaEm).toISOString() : null,
    concluidaPorUsuario: r.concluidaPorUsuario !== null ? Number(r.concluidaPorUsuario) : null,
    origemEntidadeTipo: r.origemEntidadeTipo ? String(r.origemEntidadeTipo) : null,
    origemEntidadeId: r.origemEntidadeId !== null ? Number(r.origemEntidadeId) : null,
  })) satisfies TarefaInstanciaDTO[];
}

export async function alterarStatusInstancia(args: { tenantId: number; id: number; userId: number; acao: 'INICIAR' | 'CONCLUIR' | 'CANCELAR'; observacao?: string }) {
  const now = nowIso();
  if (args.acao === 'INICIAR') {
    await db.execute(
      `
      UPDATE automacoes_tarefas_instancias
      SET status_tarefa = 'EM_ANDAMENTO', iniciada_em = COALESCE(iniciada_em, ?)
      WHERE tenant_id = ? AND id_automacao_tarefa_instancia = ? AND status_tarefa IN ('PENDENTE','ATRASADA')
      `,
      [now, args.tenantId, args.id]
    );
    return;
  }
  if (args.acao === 'CONCLUIR') {
    await db.execute(
      `
      UPDATE automacoes_tarefas_instancias
      SET status_tarefa = 'CONCLUIDA',
          concluida_em = ?,
          concluida_por_usuario = ?,
          observacao_conclusao = ?
      WHERE tenant_id = ? AND id_automacao_tarefa_instancia = ? AND status_tarefa IN ('PENDENTE','EM_ANDAMENTO','ATRASADA')
      `,
      [now, args.userId, args.observacao || null, args.tenantId, args.id]
    );
    return;
  }
  await db.execute(
    `
    UPDATE automacoes_tarefas_instancias
    SET status_tarefa = 'CANCELADA'
    WHERE tenant_id = ? AND id_automacao_tarefa_instancia = ? AND status_tarefa IN ('PENDENTE','EM_ANDAMENTO','ATRASADA')
    `,
    [args.tenantId, args.id]
  );
}

export async function listarPoliticas(tenantId: number): Promise<SlaPoliticaDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      id_automacao_sla_politica AS id,
      nome_politica AS nome,
      modulo,
      chave_pendencia AS chavePendencia,
      entidade_tipo AS entidadeTipo,
      prazo_minutos AS prazoMinutos,
      alerta_antes_minutos AS alertaAntesMinutos,
      escalonar_apos_minutos AS escalonarAposMinutos,
      max_escalacoes AS maxEscalacoes,
      cria_tarefa_quando_vencer AS criaTarefaQuandoVencer,
      notificar_no_app AS notificarNoApp,
      enviar_email AS enviarEmail,
      ativo
    FROM automacoes_sla_politicas
    WHERE tenant_id = ?
    ORDER BY ativo DESC, modulo ASC, nome_politica ASC
    `,
    [tenantId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    nome: String(r.nome),
    modulo: String(r.modulo),
    chavePendencia: String(r.chavePendencia),
    entidadeTipo: String(r.entidadeTipo),
    prazoMinutos: Number(r.prazoMinutos || 0),
    alertaAntesMinutos: Number(r.alertaAntesMinutos || 0),
    escalonarAposMinutos: r.escalonarAposMinutos !== null ? Number(r.escalonarAposMinutos) : null,
    maxEscalacoes: Number(r.maxEscalacoes || 1),
    criaTarefaQuandoVencer: Boolean(r.criaTarefaQuandoVencer),
    notificarNoApp: Boolean(r.notificarNoApp),
    enviarEmail: Boolean(r.enviarEmail),
    ativo: Boolean(r.ativo),
  }));
}

export async function criarPolitica(tenantId: number, body: Omit<SlaPoliticaDTO, 'id'>) {
  await db.execute(
    `
    INSERT INTO automacoes_sla_politicas
      (tenant_id, nome_politica, modulo, chave_pendencia, entidade_tipo, prazo_minutos, alerta_antes_minutos,
       escalonar_apos_minutos, max_escalacoes, cria_tarefa_quando_vencer, notificar_no_app, enviar_email, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      tenantId,
      body.nome,
      body.modulo,
      body.chavePendencia,
      body.entidadeTipo,
      body.prazoMinutos,
      body.alertaAntesMinutos,
      body.escalonarAposMinutos,
      body.maxEscalacoes,
      body.criaTarefaQuandoVencer ? 1 : 0,
      body.notificarNoApp ? 1 : 0,
      body.enviarEmail ? 1 : 0,
      body.ativo ? 1 : 0,
    ]
  );
  const [[row]]: any = await db.query(
    `SELECT id_automacao_sla_politica AS id FROM automacoes_sla_politicas WHERE tenant_id = ? ORDER BY id_automacao_sla_politica DESC LIMIT 1`,
    [tenantId]
  );
  return Number(row?.id);
}

export async function atualizarPolitica(tenantId: number, id: number, body: Omit<SlaPoliticaDTO, 'id'>) {
  await db.execute(
    `
    UPDATE automacoes_sla_politicas
    SET nome_politica = ?,
        modulo = ?,
        chave_pendencia = ?,
        entidade_tipo = ?,
        prazo_minutos = ?,
        alerta_antes_minutos = ?,
        escalonar_apos_minutos = ?,
        max_escalacoes = ?,
        cria_tarefa_quando_vencer = ?,
        notificar_no_app = ?,
        enviar_email = ?,
        ativo = ?
    WHERE tenant_id = ? AND id_automacao_sla_politica = ?
    `,
    [
      body.nome,
      body.modulo,
      body.chavePendencia,
      body.entidadeTipo,
      body.prazoMinutos,
      body.alertaAntesMinutos,
      body.escalonarAposMinutos,
      body.maxEscalacoes,
      body.criaTarefaQuandoVencer ? 1 : 0,
      body.notificarNoApp ? 1 : 0,
      body.enviarEmail ? 1 : 0,
      body.ativo ? 1 : 0,
      tenantId,
      id,
    ]
  );
}

export async function listarOcorrencias(tenantId: number, args?: { status?: AutomacaoOcorrenciaStatus; modulo?: string; severidade?: string; vencidas?: boolean; limit?: number }) {
  const where: string[] = [`tenant_id = ?`];
  const params: any[] = [tenantId];
  if (args?.status) {
    where.push(`status_ocorrencia = ?`);
    params.push(args.status);
  }
  if (args?.modulo) {
    where.push(`modulo = ?`);
    params.push(args.modulo);
  }
  if (args?.severidade) {
    where.push(`severidade = ?`);
    params.push(args.severidade);
  }
  if (args?.vencidas) {
    where.push(`vencimento_em <= NOW() AND status_ocorrencia IN ('ABERTA','ALERTADA','ESCALADA')`);
  }
  const limit = Math.min(Math.max(Number(args?.limit || 100), 10), 300);
  const [rows]: any = await db.query(
    `
    SELECT
      id_automacao_pendencia_ocorrencia AS id,
      id_automacao_sla_politica AS idPolitica,
      modulo,
      chave_pendencia AS chavePendencia,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      titulo,
      descricao,
      status_ocorrencia AS status,
      severidade,
      referencia_data AS referenciaData,
      vencimento_em AS vencimentoEm,
      total_alertas AS totalAlertas,
      total_escalacoes AS totalEscalacoes,
      id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
      rota
    FROM automacoes_pendencias_ocorrencias
    WHERE ${where.join(' AND ')}
    ORDER BY vencimento_em ASC, severidade DESC, id_automacao_pendencia_ocorrencia DESC
    LIMIT ?
    `,
    [...params, limit]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    idPolitica: Number(r.idPolitica),
    modulo: String(r.modulo),
    chavePendencia: String(r.chavePendencia),
    entidadeTipo: String(r.entidadeTipo),
    entidadeId: Number(r.entidadeId),
    titulo: String(r.titulo),
    descricao: r.descricao ? String(r.descricao) : null,
    status: String(r.status) as any,
    severidade: String(r.severidade) as any,
    referenciaData: r.referenciaData ? new Date(r.referenciaData).toISOString() : null,
    vencimentoEm: new Date(r.vencimentoEm).toISOString(),
    totalAlertas: Number(r.totalAlertas || 0),
    totalEscalacoes: Number(r.totalEscalacoes || 0),
    idUsuarioResponsavelAtual: r.idUsuarioResponsavelAtual !== null ? Number(r.idUsuarioResponsavelAtual) : null,
    rota: r.rota ? String(r.rota) : null,
  })) satisfies PendenciaOcorrenciaDTO[];
}

export async function listarExecucoes(tenantId: number): Promise<AutomacaoExecucaoDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      id_automacao_execucao AS id,
      tipo_execucao AS tipoExecucao,
      status_execucao AS status,
      execucao_manual AS execucaoManual,
      iniciado_em AS iniciadoEm,
      finalizado_em AS finalizadoEm,
      total_processado AS totalProcessado,
      total_criado AS totalCriado,
      total_notificado AS totalNotificado,
      total_escalado AS totalEscalado,
      mensagem_resultado AS mensagemResultado,
      criado_em AS criadoEm
    FROM automacoes_execucoes
    WHERE tenant_id = ?
    ORDER BY id_automacao_execucao DESC
    LIMIT 200
    `,
    [tenantId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    tipoExecucao: String(r.tipoExecucao) as any,
    status: String(r.status) as any,
    execucaoManual: Boolean(r.execucaoManual),
    iniciadoEm: r.iniciadoEm ? new Date(r.iniciadoEm).toISOString() : null,
    finalizadoEm: r.finalizadoEm ? new Date(r.finalizadoEm).toISOString() : null,
    totalProcessado: Number(r.totalProcessado || 0),
    totalCriado: Number(r.totalCriado || 0),
    totalNotificado: Number(r.totalNotificado || 0),
    totalEscalado: Number(r.totalEscalado || 0),
    mensagemResultado: r.mensagemResultado ? String(r.mensagemResultado) : null,
    criadoEm: new Date(r.criadoEm).toISOString(),
  }));
}

export async function gerarInstanciasTarefasRecorrentes(args: { tenantId: number; executorUserId: number | null; manual: boolean }) {
  const execucaoId = await createExecucao({ tenantId: args.tenantId, tipoExecucao: 'TAREFAS', execucaoManual: args.manual, userId: args.executorUserId });
  const totals = { processado: 0, criado: 0, notificado: 0, escalado: 0 };
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_automacao_tarefa_modelo AS id,
        nome_modelo AS nome,
        modulo,
        tipo_local AS tipoLocal,
        id_obra AS idObra,
        id_unidade AS idUnidade,
        id_setor_diretoria AS idDiretoria,
        recorrencia,
        horario_execucao AS horarioExecucao,
        timezone,
        dia_semana AS diaSemana,
        dia_mes AS diaMes,
        titulo_tarefa AS tituloTarefa,
        descricao_tarefa AS descricaoTarefa,
        responsavel_tipo AS responsavelTipo,
        id_usuario_responsavel AS idUsuarioResponsavel,
        permissao_responsavel AS permissaoResponsavel,
        gera_notificacao AS geraNotificacao,
        gera_email AS geraEmail,
        ativo,
        proxima_execucao_em AS proximaExecucaoEm
      FROM automacoes_tarefas_modelos
      WHERE tenant_id = ? AND ativo = 1 AND proxima_execucao_em IS NOT NULL AND proxima_execucao_em <= NOW()
      ORDER BY proxima_execucao_em ASC
      LIMIT 50
      `,
      [args.tenantId]
    );

    for (const m of rows as any[]) {
      totals.processado++;
      const modeloId = Number(m.id);
      const proxima = m.proximaExecucaoEm ? new Date(m.proximaExecucaoEm) : new Date();
      const ref = `${proxima.getFullYear()}-${String(proxima.getMonth() + 1).padStart(2, '0')}-${String(proxima.getDate()).padStart(2, '0')}`;

      const responsaveis = await resolveResponsavelUserIds({
        tenantId: args.tenantId,
        responsavelTipo: String(m.responsavelTipo) as any,
        idUsuarioResponsavel: m.idUsuarioResponsavel !== null ? Number(m.idUsuarioResponsavel) : null,
        permissaoResponsavel: m.permissaoResponsavel ? String(m.permissaoResponsavel) : null,
      });
      const idUsuarioAtribuido = responsaveis.length ? responsaveis[0] : null;

      try {
        await db.execute(
          `
          INSERT INTO automacoes_tarefas_instancias
            (tenant_id, id_automacao_tarefa_modelo, referencia_periodo, titulo_tarefa, descricao_tarefa, status_tarefa, prevista_para,
             id_usuario_atribuido, atribuido_em)
          VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?)
          ON DUPLICATE KEY UPDATE atualizado_em = CURRENT_TIMESTAMP
          `,
          [
            args.tenantId,
            modeloId,
            ref,
            String(m.tituloTarefa),
            m.descricaoTarefa ? String(m.descricaoTarefa) : null,
            toIsoDateTime(proxima),
            idUsuarioAtribuido,
            idUsuarioAtribuido ? nowIso() : null,
          ]
        );
        totals.criado++;
        if (idUsuarioAtribuido && Number(m.geraNotificacao)) {
          const signal: AlertSignal = {
            module: 'ADMIN',
            key: 'AUTOMACAO_TAREFA_GERADA',
            dedupeKey: `automacao.tarefa.modelo.${modeloId}.ref.${ref}`,
            severity: 'INFO',
            titulo: `Tarefa gerada: ${String(m.nome)}`,
            mensagem: String(m.tituloTarefa),
            rota: '/dashboard/admin/automacoes',
            entidadeTipo: 'AUTOMACAO_TAREFA',
            entidadeId: modeloId,
            referenciaData: nowIso(),
            expiresAt: null,
            metadata: { tipo: 'TAREFA', modeloId, referencia: ref },
          };
          const eventId = await upsertNotificationEvent({ tenantId: args.tenantId, userId: idUsuarioAtribuido, signal });
          await assignNotificationRecipient({ tenantId: args.tenantId, eventId, userId: idUsuarioAtribuido });
          totals.notificado++;
        }
      } catch {}

      const next = calcularProximaExecucaoAutomacao({
        recorrencia: String(m.recorrencia) as any,
        horarioExecucao: String(m.horarioExecucao),
        diaSemana: m.diaSemana !== null ? Number(m.diaSemana) : null,
        diaMes: m.diaMes !== null ? Number(m.diaMes) : null,
        from: addDays(proxima, 0),
      });
      await db.execute(
        `
        UPDATE automacoes_tarefas_modelos
        SET ultima_execucao_em = ?, proxima_execucao_em = ?
        WHERE tenant_id = ? AND id_automacao_tarefa_modelo = ?
        `,
        [nowIso(), toIsoDateTime(next), args.tenantId, modeloId]
      );
    }

    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'SUCESSO', totals, mensagem: null });
    return { execucaoId, ...totals };
  } catch (e: any) {
    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'ERRO', totals, mensagem: String(e?.message || 'Erro') });
    return { execucaoId, ...totals };
  }
}

export async function detectarPendenciasSla(args: { tenantId: number; userId: number; manual: boolean }) {
  const execucaoId = await createExecucao({ tenantId: args.tenantId, tipoExecucao: 'SLA', execucaoManual: args.manual, userId: args.userId });
  const totals = { processado: 0, criado: 0, notificado: 0, escalado: 0 };
  try {
    const politicas = await listarPoliticas(args.tenantId);
    const politicasAtivas = politicas.filter((p) => p.ativo);
    const byKey = new Map(politicasAtivas.map((p) => [`${p.modulo}.${p.chavePendencia}`, p] as const));

    const signals: PendenciaSignal[] = [];
    for (const p of PENDENCIA_PROVIDERS) {
      const out = await p.collect({ tenantId: args.tenantId, userId: args.userId });
      signals.push(...out);
    }

    for (const s of signals) {
      totals.processado++;
      const policy = byKey.get(`${s.modulo}.${s.chavePendencia}`);
      if (!policy) continue;
      const venc = new Date(s.vencimentoEm);
      const dedupe = `${policy.id}.${s.entidadeTipo}.${s.entidadeId}`;
      let responsavelUserId = s.responsavelUserId ?? null;
      if (!responsavelUserId) {
        const perm =
          s.modulo === 'ENGENHARIA'
            ? 'dashboard.engenharia.view'
            : s.modulo === 'SUPRIMENTOS'
              ? 'dashboard.suprimentos.view'
              : s.modulo === 'SST'
                ? 'sst.painel.view'
                : s.modulo === 'RH'
                  ? 'dashboard.rh.view'
                  : 'automacoes.view';
        const ids = await findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: perm });
        responsavelUserId = ids.length ? ids[0] : null;
      }
      await db.execute(
        `
        INSERT INTO automacoes_pendencias_ocorrencias
          (tenant_id, id_automacao_sla_politica, chave_deduplicacao, modulo, chave_pendencia, entidade_tipo, entidade_id,
           titulo, descricao, status_ocorrencia, severidade, referencia_data, vencimento_em,
           primeira_deteccao_em, ultima_deteccao_em, id_usuario_responsavel_atual, rota, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          titulo = VALUES(titulo),
          descricao = VALUES(descricao),
          severidade = VALUES(severidade),
          referencia_data = VALUES(referencia_data),
          vencimento_em = VALUES(vencimento_em),
          ultima_deteccao_em = VALUES(ultima_deteccao_em),
          id_usuario_responsavel_atual = COALESCE(VALUES(id_usuario_responsavel_atual), id_usuario_responsavel_atual),
          rota = VALUES(rota),
          metadata_json = VALUES(metadata_json),
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [
          args.tenantId,
          policy.id,
          dedupe,
          s.modulo,
          s.chavePendencia,
          s.entidadeTipo,
          s.entidadeId,
          s.titulo.slice(0, 180),
          s.descricao ? String(s.descricao) : null,
          s.severidade,
          s.referenciaData ? new Date(s.referenciaData) : null,
          toIsoDateTime(venc),
          nowIso(),
          nowIso(),
          responsavelUserId,
          s.rota ?? null,
          s.metadata ? JSON.stringify(s.metadata) : null,
        ]
      );
      totals.criado++;
    }

    await db.execute(
      `
      UPDATE automacoes_pendencias_ocorrencias
      SET status_ocorrencia = 'RESOLVIDA', resolvida_em = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
        AND status_ocorrencia IN ('ABERTA','ALERTADA','ESCALADA')
        AND ultima_deteccao_em < DATE_SUB(NOW(), INTERVAL 12 HOUR)
      `,
      [nowIso(), args.tenantId]
    );

    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'SUCESSO', totals, mensagem: null });
    return { execucaoId, ...totals };
  } catch (e: any) {
    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'ERRO', totals, mensagem: String(e?.message || 'Erro') });
    return { execucaoId, ...totals };
  }
}

export async function processarCobrancasPendentes(args: { tenantId: number; userId: number | null; manual: boolean }) {
  const execucaoId = await createExecucao({ tenantId: args.tenantId, tipoExecucao: 'COBRANCA', execucaoManual: args.manual, userId: args.userId });
  const totals = { processado: 0, criado: 0, notificado: 0, escalado: 0 };
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        o.id_automacao_pendencia_ocorrencia AS id,
        o.id_automacao_sla_politica AS idPolitica,
        o.modulo,
        o.chave_pendencia AS chavePendencia,
        o.titulo,
        o.descricao,
        o.severidade,
        o.status_ocorrencia AS status,
        o.vencimento_em AS vencimentoEm,
        o.total_alertas AS totalAlertas,
        o.total_escalacoes AS totalEscalacoes,
        o.id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
        o.rota
      FROM automacoes_pendencias_ocorrencias o
      INNER JOIN automacoes_sla_politicas p ON p.id_automacao_sla_politica = o.id_automacao_sla_politica
      WHERE o.tenant_id = ?
        AND p.ativo = 1
        AND o.status_ocorrencia IN ('ABERTA','ALERTADA','ESCALADA')
      ORDER BY o.vencimento_em ASC
      LIMIT 200
      `,
      [args.tenantId]
    );

    for (const r of rows as any[]) {
      totals.processado++;
      const id = Number(r.id);
      const venc = new Date(r.vencimentoEm);
      const now = new Date();
      const status: AutomacaoOcorrenciaStatus = String(r.status) as any;
      const totalAlertas = Number(r.totalAlertas || 0);
      const totalEscalacoes = Number(r.totalEscalacoes || 0);
      const idUsuario = r.idUsuarioResponsavelAtual !== null ? Number(r.idUsuarioResponsavelAtual) : null;

      let shouldAlert = false;
      let newStatus: AutomacaoOcorrenciaStatus | null = null;

      if (now >= venc && status === 'ABERTA') {
        shouldAlert = true;
        newStatus = 'ALERTADA';
      } else if (now >= venc && status === 'ALERTADA' && totalAlertas < 3) {
        shouldAlert = true;
        newStatus = 'ALERTADA';
      } else if (now >= venc && status === 'ESCALADA' && totalAlertas < 3) {
        shouldAlert = true;
        newStatus = 'ESCALADA';
      }

      if (!shouldAlert || !newStatus) continue;

      if (idUsuario) {
        const sevRaw = String(r.severidade || 'MEDIA');
        const severity = sevRaw === 'CRITICA' ? 'CRITICAL' : sevRaw === 'ALTA' ? 'DANGER' : sevRaw === 'MEDIA' ? 'WARNING' : 'INFO';
        const signal: AlertSignal = {
          module: normalizeAlertModule(r.modulo),
          key: 'SLA_PENDENCIA',
          dedupeKey: `sla.ocorrencia.${id}`,
          severity,
          titulo: `Pendência: ${String(r.titulo)}`,
          mensagem: String(r.descricao || 'Pendência de SLA detectada'),
          rota: r.rota ? String(r.rota) : '/dashboard/admin/automacoes',
          entidadeTipo: 'SLA_OCORRENCIA',
          entidadeId: id,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { ocorrenciaId: id, chavePendencia: String(r.chavePendencia) },
        };
        const eventId = await upsertNotificationEvent({ tenantId: args.tenantId, userId: idUsuario, signal });
        await assignNotificationRecipient({ tenantId: args.tenantId, eventId, userId: idUsuario });
        totals.notificado++;
      }

      await db.execute(
        `
        UPDATE automacoes_pendencias_ocorrencias
        SET status_ocorrencia = ?,
            ultimo_alerta_em = ?,
            total_alertas = total_alertas + 1,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_automacao_pendencia_ocorrencia = ?
        `,
        [newStatus, nowIso(), args.tenantId, id]
      );
    }

    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'SUCESSO', totals, mensagem: null });
    return { execucaoId, ...totals };
  } catch (e: any) {
    await finishExecucao({ tenantId: args.tenantId, execucaoId, status: 'ERRO', totals, mensagem: String(e?.message || 'Erro') });
    return { execucaoId, ...totals };
  }
}

