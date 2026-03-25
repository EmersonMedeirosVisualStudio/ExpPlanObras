import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type {
  WorkflowAcaoExecuteDTO,
  WorkflowEstadoDTO,
  WorkflowHistoricoDTO,
  WorkflowInstanciaDTO,
  WorkflowInstanciaDetalheDTO,
  WorkflowModeloDTO,
  WorkflowModeloSaveDTO,
  WorkflowTransicaoDTO,
  WorkflowTransicaoDisponivelDTO,
  WorkflowTransicaoCampoDTO,
  WorkflowTarefaDTO,
} from './types';
import { getWorkflowHandler } from './registry';
import { evaluateCondition } from './conditions';
import { canExecuteTransition, resolveDefaultResponsavel } from './resolve-executor';
import { executeWorkflowAction } from './actions';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function toIso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseJsonMaybe(v: any): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function normalizeBool(v: any, def: boolean) {
  if (v === undefined || v === null) return def;
  return Boolean(v);
}

function normalizeNumber(v: any, def: number | null = null) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function buildVencimentoFromSla(slaHoras: number | null) {
  if (!slaHoras || slaHoras <= 0) return null;
  return new Date(Date.now() + slaHoras * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

async function addHistorico(conn: any, args: { tenantId: number; instanciaId: number; estadoAnterior: string | null; estadoNovo: string; acao: string | null; parecer: string | null; userId: number | null; idAssinaturaRegistro: number | null; ip?: string | null; userAgent?: string | null; formulario?: any }) {
  await conn.execute(
    `
    INSERT INTO workflows_instancias_historico
      (tenant_id, id_workflow_instancia, id_transicao_modelo, chave_estado_anterior, chave_estado_novo, acao_executada, parecer,
       dados_formulario_json, id_usuario_evento, id_assinatura_registro, ip_origem, user_agent)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      args.tenantId,
      args.instanciaId,
      args.estadoAnterior,
      args.estadoNovo,
      args.acao,
      args.parecer,
      args.formulario ? JSON.stringify(args.formulario) : null,
      args.userId,
      args.idAssinaturaRegistro,
      args.ip ?? null,
      args.userAgent ?? null,
    ]
  );
}

async function createSignatureForTransition(args: { conn: any; tenantId: number; userId: number; instanciaId: number; transicaoChave: string; assinatura: NonNullable<WorkflowAcaoExecuteDTO['assinatura']>; ip?: string | null; userAgent?: string | null }) {
  const tipo = String(args.assinatura.tipo || '').toUpperCase();
  if (tipo !== 'PIN') throw new ApiError(422, 'Assinatura inválida. Use PIN.');
  const pin = String(args.assinatura.pin || '');
  if (!pin || pin.length < 4) throw new ApiError(422, 'PIN inválido.');

  const [[pinRow]]: any = await args.conn.query(
    `
    SELECT pin_hash
    FROM usuarios_assinatura_habilitacoes
    WHERE tenant_id = ? AND id_usuario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!pinRow?.pin_hash) throw new ApiError(422, 'Usuário sem PIN habilitado.');
  const okPin = await bcrypt.compare(pin, String(pinRow.pin_hash));
  if (!okPin) throw new ApiError(422, 'PIN inválido.');

  const [res]: any = await args.conn.query(
    `
    INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, id_usuario_captura, tipo_assinatura, ip_origem, user_agent, observacao, metadata_json)
    VALUES
      (?, 'WORKFLOW_TRANSICAO', ?, ?, 'PIN', ?, ?, ?, ?)
    `,
    [
      args.tenantId,
      args.instanciaId,
      args.userId,
      args.ip ?? null,
      args.userAgent ?? null,
      `Workflow transição ${args.transicaoChave}`,
      JSON.stringify({ workflowInstanciaId: args.instanciaId, chaveTransicao: args.transicaoChave, idUsuarioSignatario: args.userId }),
    ]
  );
  return Number(res.insertId);
}

export async function listarModelos(tenantId: number): Promise<WorkflowModeloDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      id_workflow_modelo AS id,
      codigo,
      nome_modelo AS nome,
      entidade_tipo AS entidadeTipo,
      descricao_modelo AS descricaoModelo,
      ativo,
      versao,
      permite_multiplas_instancias AS permiteMultiplasInstancias,
      inicia_automaticamente AS iniciaAutomaticamente
    FROM workflows_modelos
    WHERE tenant_id = ?
    ORDER BY codigo ASC, versao DESC
    LIMIT 200
    `,
    [tenantId]
  );

  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    codigo: String(r.codigo),
    nome: String(r.nome),
    entidadeTipo: String(r.entidadeTipo),
    descricaoModelo: r.descricaoModelo ? String(r.descricaoModelo) : null,
    ativo: Boolean(r.ativo),
    versao: Number(r.versao),
    permiteMultiplasInstancias: Boolean(r.permiteMultiplasInstancias),
    iniciaAutomaticamente: Boolean(r.iniciaAutomaticamente),
  }));
}

export async function obterModeloDetalhe(tenantId: number, idModelo: number): Promise<{ modelo: WorkflowModeloDTO; estados: WorkflowEstadoDTO[]; transicoes: WorkflowTransicaoDTO[] }> {
  const [[m]]: any = await db.query(
    `
    SELECT
      id_workflow_modelo AS id,
      codigo,
      nome_modelo AS nome,
      entidade_tipo AS entidadeTipo,
      descricao_modelo AS descricaoModelo,
      ativo,
      versao,
      permite_multiplas_instancias AS permiteMultiplasInstancias,
      inicia_automaticamente AS iniciaAutomaticamente
    FROM workflows_modelos
    WHERE tenant_id = ? AND id_workflow_modelo = ?
    LIMIT 1
    `,
    [tenantId, idModelo]
  );
  if (!m) throw new ApiError(404, 'Modelo não encontrado.');

  const [estadosRows]: any = await db.query(
    `
    SELECT
      id_workflow_modelo_estado AS id,
      chave_estado AS chaveEstado,
      nome_estado AS nomeEstado,
      tipo_estado AS tipoEstado,
      cor_hex AS corHex,
      ordem_exibicao AS ordemExibicao,
      editavel_entidade AS editavelEntidade,
      bloqueia_entidade AS bloqueiaEntidade,
      exige_responsavel AS exigeResponsavel,
      sla_horas AS slaHoras,
      ativo
    FROM workflows_modelos_estados
    WHERE id_workflow_modelo = ?
    ORDER BY ordem_exibicao ASC, id_workflow_modelo_estado ASC
    `,
    [idModelo]
  );

  const [transRows]: any = await db.query(
    `
    SELECT
      t.id_workflow_modelo_transicao AS id,
      t.chave_transicao AS chaveTransicao,
      t.nome_transicao AS nomeTransicao,
      t.id_estado_origem AS estadoOrigemId,
      t.id_estado_destino AS estadoDestinoId,
      t.tipo_executor AS tipoExecutor,
      t.id_usuario_executor AS idUsuarioExecutor,
      t.permissao_executor AS permissaoExecutor,
      t.exige_parecer AS exigeParecer,
      t.exige_assinatura AS exigeAssinatura,
      t.visivel_no_ui AS visivelNoUi,
      t.permite_em_lote AS permiteEmLote,
      t.condicao_json AS condicao,
      t.ativo
    FROM workflows_modelos_transicoes t
    WHERE t.id_workflow_modelo = ?
    ORDER BY t.id_workflow_modelo_transicao ASC
    `,
    [idModelo]
  );

  const transIds = (transRows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const fieldsByTrans = new Map<number, WorkflowTransicaoCampoDTO[]>();
  const actionsByTrans = new Map<number, any[]>();

  if (transIds.length) {
    const [campos]: any = await db.query(
      `
      SELECT
        id_workflow_transicao_campo AS id,
        id_workflow_modelo_transicao AS idTransicao,
        chave_campo AS chaveCampo,
        label_campo AS labelCampo,
        tipo_campo AS tipoCampo,
        obrigatorio,
        ordem_exibicao AS ordemExibicao,
        opcoes_json AS opcoes,
        validacao_json AS validacao,
        valor_padrao_json AS valorPadrao,
        ativo
      FROM workflows_modelos_transicoes_campos
      WHERE id_workflow_modelo_transicao IN (${transIds.map(() => '?').join(',')})
      ORDER BY id_workflow_modelo_transicao ASC, ordem_exibicao ASC, id_workflow_transicao_campo ASC
      `,
      transIds
    );
    for (const c of campos as any[]) {
      const idTrans = Number(c.idTransicao);
      if (!fieldsByTrans.has(idTrans)) fieldsByTrans.set(idTrans, []);
      fieldsByTrans.get(idTrans)!.push({
        id: Number(c.id),
        chaveCampo: String(c.chaveCampo),
        labelCampo: String(c.labelCampo),
        tipoCampo: String(c.tipoCampo) as any,
        obrigatorio: Boolean(c.obrigatorio),
        ordemExibicao: Number(c.ordemExibicao || 0),
        opcoes: parseJsonMaybe(c.opcoes),
        validacao: parseJsonMaybe(c.validacao),
        valorPadrao: parseJsonMaybe(c.valorPadrao),
        ativo: Boolean(c.ativo),
      });
    }

    const [acoes]: any = await db.query(
      `
      SELECT
        id_workflow_transicao_acao AS id,
        id_workflow_modelo_transicao AS idTransicao,
        ordem_execucao AS ordemExecucao,
        tipo_acao AS tipoAcao,
        configuracao_json AS configuracao,
        ativo
      FROM workflows_modelos_transicoes_acoes
      WHERE id_workflow_modelo_transicao IN (${transIds.map(() => '?').join(',')})
      ORDER BY id_workflow_modelo_transicao ASC, ordem_execucao ASC, id_workflow_transicao_acao ASC
      `,
      transIds
    );
    for (const a of acoes as any[]) {
      const idTrans = Number(a.idTransicao);
      if (!actionsByTrans.has(idTrans)) actionsByTrans.set(idTrans, []);
      actionsByTrans.get(idTrans)!.push({
        id: Number(a.id),
        ordemExecucao: Number(a.ordemExecucao || 0),
        tipoAcao: String(a.tipoAcao),
        configuracao: parseJsonMaybe(a.configuracao),
        ativo: Boolean(a.ativo),
      });
    }
  }

  const estados = (estadosRows as any[]).map((r) => ({
    id: Number(r.id),
    chaveEstado: String(r.chaveEstado),
    nomeEstado: String(r.nomeEstado),
    tipoEstado: String(r.tipoEstado) as any,
    corHex: r.corHex ? String(r.corHex) : null,
    ordemExibicao: Number(r.ordemExibicao || 0),
    editavelEntidade: Boolean(r.editavelEntidade),
    bloqueiaEntidade: Boolean(r.bloqueiaEntidade),
    exigeResponsavel: Boolean(r.exigeResponsavel),
    slaHoras: r.slaHoras !== null ? Number(r.slaHoras) : null,
    ativo: Boolean(r.ativo),
  })) satisfies WorkflowEstadoDTO[];

  const transicoes = (transRows as any[]).map((r) => {
    const id = Number(r.id);
    return {
      id,
      chaveTransicao: String(r.chaveTransicao),
      nomeTransicao: String(r.nomeTransicao),
      estadoOrigemId: Number(r.estadoOrigemId),
      estadoDestinoId: Number(r.estadoDestinoId),
      tipoExecutor: String(r.tipoExecutor) as any,
      idUsuarioExecutor: r.idUsuarioExecutor !== null ? Number(r.idUsuarioExecutor) : null,
      permissaoExecutor: r.permissaoExecutor ? String(r.permissaoExecutor) : null,
      exigeParecer: Boolean(r.exigeParecer),
      exigeAssinatura: Boolean(r.exigeAssinatura),
      visivelNoUi: Boolean(r.visivelNoUi),
      permiteEmLote: Boolean(r.permiteEmLote),
      condicao: parseJsonMaybe(r.condicao),
      ativo: Boolean(r.ativo),
      campos: (fieldsByTrans.get(id) || []).filter((c) => c.ativo),
      acoes: (actionsByTrans.get(id) || []).filter((a) => a.ativo),
    };
  }) satisfies WorkflowTransicaoDTO[];

  return {
    modelo: {
      id: Number(m.id),
      codigo: String(m.codigo),
      nome: String(m.nome),
      entidadeTipo: String(m.entidadeTipo),
      descricaoModelo: m.descricaoModelo ? String(m.descricaoModelo) : null,
      ativo: Boolean(m.ativo),
      versao: Number(m.versao),
      permiteMultiplasInstancias: Boolean(m.permiteMultiplasInstancias),
      iniciaAutomaticamente: Boolean(m.iniciaAutomaticamente),
    },
    estados,
    transicoes,
  };
}

async function getLatestActiveModeloId(conn: any, args: { tenantId: number; entidadeTipo: string }) {
  const [[row]]: any = await conn.query(
    `
    SELECT id_workflow_modelo AS id
    FROM workflows_modelos
    WHERE tenant_id = ? AND entidade_tipo = ? AND ativo = 1
    ORDER BY versao DESC, id_workflow_modelo DESC
    LIMIT 1
    `,
    [args.tenantId, args.entidadeTipo]
  );
  return row?.id ? Number(row.id) : null;
}

export async function criarModelo(tenantId: number, body: WorkflowModeloSaveDTO) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const codigo = String(body.codigo || '').trim();
    const entidadeTipo = String(body.entidadeTipo || '').trim().toUpperCase();
    if (!codigo) throw new ApiError(422, 'codigo obrigatório');
    if (!entidadeTipo) throw new ApiError(422, 'entidadeTipo obrigatório');

    const [[rowVersao]]: any = await conn.query(
      `SELECT COALESCE(MAX(versao), 0) AS v FROM workflows_modelos WHERE tenant_id = ? AND codigo = ?`,
      [tenantId, codigo]
    );
    const nextVersao = Number(rowVersao?.v || 0) + 1;

    const [res]: any = await conn.execute(
      `
      INSERT INTO workflows_modelos
        (tenant_id, codigo, nome_modelo, entidade_tipo, descricao_modelo, ativo, versao, permite_multiplas_instancias, inicia_automaticamente)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tenantId,
        codigo,
        String(body.nome || '').trim().slice(0, 150),
        entidadeTipo,
        body.descricaoModelo ?? null,
        body.ativo ? 1 : 0,
        nextVersao,
        body.permiteMultiplasInstancias ? 1 : 0,
        body.iniciaAutomaticamente ? 1 : 0,
      ]
    );
    const idModelo = Number(res.insertId);

    const estadoIdsByChave = new Map<string, number>();
    for (const e of body.estados || []) {
      const chave = String(e.chaveEstado || '').trim();
      if (!chave) continue;
      const [rEst]: any = await conn.execute(
        `
        INSERT INTO workflows_modelos_estados
          (id_workflow_modelo, chave_estado, nome_estado, tipo_estado, cor_hex, ordem_exibicao, editavel_entidade, bloqueia_entidade, exige_responsavel, sla_horas, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          idModelo,
          chave,
          String(e.nomeEstado || chave).trim().slice(0, 120),
          String(e.tipoEstado || 'INTERMEDIARIO'),
          e.corHex ?? null,
          Number(e.ordemExibicao || 0),
          normalizeBool(e.editavelEntidade, false) ? 1 : 0,
          normalizeBool(e.bloqueiaEntidade, false) ? 1 : 0,
          normalizeBool(e.exigeResponsavel, false) ? 1 : 0,
          e.slaHoras !== undefined && e.slaHoras !== null ? Number(e.slaHoras) : null,
          normalizeBool(e.ativo, true) ? 1 : 0,
        ]
      );
      estadoIdsByChave.set(chave, Number(rEst.insertId));
    }

    const estadosValues = Array.from(estadoIdsByChave.values());
    if (!estadosValues.length) throw new ApiError(422, 'estados obrigatório');
    const [initRows]: any = await conn.query(
      `SELECT COUNT(*) AS total FROM workflows_modelos_estados WHERE id_workflow_modelo = ? AND tipo_estado = 'INICIAL' AND ativo = 1`,
      [idModelo]
    );
    const hasInicial = Number((initRows as any[])[0]?.total || 0) > 0;
    if (!hasInicial) throw new ApiError(422, 'Modelo precisa de 1 estado INICIAL ativo.');

    for (const t of body.transicoes || []) {
      const chave = String(t.chaveTransicao || '').trim();
      if (!chave) continue;
      const origemId = estadoIdsByChave.get(String(t.estadoOrigemChave || '').trim());
      const destinoId = estadoIdsByChave.get(String(t.estadoDestinoChave || '').trim());
      if (!origemId || !destinoId) throw new ApiError(422, `Transição ${chave} referencia estados inexistentes.`);

      const [rTrans]: any = await conn.execute(
        `
        INSERT INTO workflows_modelos_transicoes
          (id_workflow_modelo, chave_transicao, nome_transicao, id_estado_origem, id_estado_destino, tipo_executor, id_usuario_executor, permissao_executor,
           exige_parecer, exige_assinatura, visivel_no_ui, permite_em_lote, condicao_json, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          idModelo,
          chave,
          String(t.nomeTransicao || chave).trim().slice(0, 120),
          origemId,
          destinoId,
          String(t.tipoExecutor),
          t.idUsuarioExecutor ?? null,
          t.permissaoExecutor ?? null,
          normalizeBool(t.exigeParecer, false) ? 1 : 0,
          normalizeBool(t.exigeAssinatura, false) ? 1 : 0,
          normalizeBool(t.visivelNoUi, true) ? 1 : 0,
          normalizeBool(t.permiteEmLote, false) ? 1 : 0,
          t.condicao ? JSON.stringify(t.condicao) : null,
          normalizeBool(t.ativo, true) ? 1 : 0,
        ]
      );
      const idTrans = Number(rTrans.insertId);

      for (const c of t.campos || []) {
        await conn.execute(
          `
          INSERT INTO workflows_modelos_transicoes_campos
            (id_workflow_modelo_transicao, chave_campo, label_campo, tipo_campo, obrigatorio, ordem_exibicao, opcoes_json, validacao_json, valor_padrao_json, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            idTrans,
            String(c.chaveCampo).trim(),
            String(c.labelCampo || c.chaveCampo).trim().slice(0, 120),
            String(c.tipoCampo),
            normalizeBool(c.obrigatorio, false) ? 1 : 0,
            Number(c.ordemExibicao || 0),
            c.opcoes !== undefined ? JSON.stringify(c.opcoes) : null,
            c.validacao !== undefined ? JSON.stringify(c.validacao) : null,
            c.valorPadrao !== undefined ? JSON.stringify(c.valorPadrao) : null,
            normalizeBool(c.ativo, true) ? 1 : 0,
          ]
        );
      }

      for (const a of t.acoes || []) {
        await conn.execute(
          `
          INSERT INTO workflows_modelos_transicoes_acoes
            (id_workflow_modelo_transicao, ordem_execucao, tipo_acao, configuracao_json, ativo)
          VALUES (?, ?, ?, ?, ?)
          `,
          [idTrans, Number(a.ordemExecucao || 0), String(a.tipoAcao), a.configuracao !== undefined ? JSON.stringify(a.configuracao) : null, normalizeBool(a.ativo, true) ? 1 : 0]
        );
      }
    }

    await conn.commit();
    return { id: idModelo };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function criarInstanciaWorkflow(args: { tenantId: number; entidadeTipo: string; entidadeId: number; userId: number; idModelo?: number | null }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const entidadeTipo = String(args.entidadeTipo || '').trim().toUpperCase();
    const handler = getWorkflowHandler(entidadeTipo);
    if (!handler) throw new ApiError(422, `Entidade não suportada para workflow: ${entidadeTipo}`);
    await handler.validarPodeIniciar(args.tenantId, args.entidadeId, args.userId);

    const idModelo = args.idModelo ?? (await getLatestActiveModeloId(conn, { tenantId: args.tenantId, entidadeTipo }));
    if (!idModelo) throw new ApiError(422, 'Nenhum modelo ativo de workflow configurado para esta entidade.');

    const [[m]]: any = await conn.query(
      `
      SELECT codigo, versao, permite_multiplas_instancias AS permiteMultiplasInstancias
      FROM workflows_modelos
      WHERE tenant_id = ? AND id_workflow_modelo = ?
      LIMIT 1
      `,
      [args.tenantId, idModelo]
    );
    if (!m) throw new ApiError(422, 'Modelo de workflow não encontrado.');

    if (!Boolean(m.permiteMultiplasInstancias)) {
      const [[ex]]: any = await conn.query(
        `
        SELECT id_workflow_instancia AS id
        FROM workflows_instancias
        WHERE tenant_id = ? AND id_workflow_modelo = ? AND entidade_tipo = ? AND entidade_id = ?
        LIMIT 1
        `,
        [args.tenantId, idModelo, entidadeTipo, args.entidadeId]
      );
      if (ex?.id) {
        await conn.commit();
        return { id: Number(ex.id) };
      }
    }

    const [[estadoInicial]]: any = await conn.query(
      `
      SELECT id_workflow_modelo_estado AS id, chave_estado AS chaveEstado, sla_horas AS slaHoras, exige_responsavel AS exigeResponsavel
      FROM workflows_modelos_estados
      WHERE id_workflow_modelo = ? AND tipo_estado = 'INICIAL' AND ativo = 1
      ORDER BY ordem_exibicao ASC
      LIMIT 1
      `,
      [idModelo]
    );
    if (!estadoInicial) throw new ApiError(422, 'Modelo sem estado inicial.');

    const titulo = await handler.obterTitulo(args.tenantId, args.entidadeId);
    const contexto = await handler.obterContexto(args.tenantId, args.entidadeId);
    const scope = handler.obterScope ? await handler.obterScope(args.tenantId, args.entidadeId) : null;

    const vencimento = buildVencimentoFromSla(estadoInicial.slaHoras !== null ? Number(estadoInicial.slaHoras) : null);
    const responsavel = Boolean(estadoInicial.exigeResponsavel) ? args.userId : null;

    const [res]: any = await conn.execute(
      `
      INSERT INTO workflows_instancias
        (tenant_id, id_workflow_modelo, id_workflow_modelo_versao, entidade_tipo, entidade_id, titulo_instancia, status_instancia,
         chave_estado_atual, id_estado_atual, id_usuario_solicitante, id_usuario_responsavel_atual, vencimento_etapa_em, dados_contexto_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 'ATIVA', ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        args.tenantId,
        idModelo,
        Number(m.versao),
        entidadeTipo,
        args.entidadeId,
        String(titulo).slice(0, 180),
        String(estadoInicial.chaveEstado),
        Number(estadoInicial.id),
        args.userId,
        responsavel,
        vencimento ? new Date(vencimento) : null,
        JSON.stringify(contexto || {}),
        scope ? JSON.stringify({ scope }) : null,
      ]
    );
    const instanciaId = Number(res.insertId);

    await addHistorico(conn, {
      tenantId: args.tenantId,
      instanciaId,
      estadoAnterior: null,
      estadoNovo: String(estadoInicial.chaveEstado),
      acao: 'INICIAR',
      parecer: null,
      userId: args.userId,
      idAssinaturaRegistro: null,
      formulario: null,
    });

    if (handler.aplicarEstadoNaEntidade) await handler.aplicarEstadoNaEntidade({ tenantId: args.tenantId, entidadeId: args.entidadeId, chaveEstado: String(estadoInicial.chaveEstado), userId: args.userId });

    await conn.commit();
    return { id: instanciaId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function obterInstanciaWorkflow(tenantId: number, instanciaId: number): Promise<WorkflowInstanciaDetalheDTO> {
  const [[i]]: any = await db.query(
    `
    SELECT
      id_workflow_instancia AS id,
      id_workflow_modelo AS idModelo,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      titulo_instancia AS tituloInstancia,
      status_instancia AS statusInstancia,
      chave_estado_atual AS chaveEstadoAtual,
      id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
      vencimento_etapa_em AS vencimentoEtapaEm,
      iniciado_em AS iniciadoEm,
      finalizado_em AS finalizadoEm,
      dados_contexto_json AS contextoJson
    FROM workflows_instancias
    WHERE tenant_id = ? AND id_workflow_instancia = ?
    LIMIT 1
    `,
    [tenantId, instanciaId]
  );
  if (!i) throw new ApiError(404, 'Instância não encontrada.');

  const detalheModelo = await obterModeloDetalhe(tenantId, Number(i.idModelo));

  const [histRows]: any = await db.query(
    `
    SELECT
      id_workflow_instancia_historico AS id,
      chave_estado_anterior AS chaveEstadoAnterior,
      chave_estado_novo AS chaveEstadoNovo,
      acao_executada AS acaoExecutada,
      parecer,
      id_usuario_evento AS idUsuarioEvento,
      id_assinatura_registro AS idAssinaturaRegistro,
      criado_em AS criadoEm
    FROM workflows_instancias_historico
    WHERE tenant_id = ? AND id_workflow_instancia = ?
    ORDER BY id_workflow_instancia_historico ASC
    `,
    [tenantId, instanciaId]
  );

  const [tRows]: any = await db.query(
    `
    SELECT
      id_workflow_instancia_tarefa AS id,
      tipo_tarefa AS tipoTarefa,
      titulo_tarefa AS tituloTarefa,
      descricao_tarefa AS descricaoTarefa,
      id_usuario_responsavel AS idUsuarioResponsavel,
      status_tarefa AS statusTarefa,
      prazo_em AS prazoEm,
      concluida_em AS concluidaEm,
      criado_em AS criadoEm
    FROM workflows_instancias_tarefas
    WHERE tenant_id = ? AND id_workflow_instancia = ?
    ORDER BY id_workflow_instancia_tarefa DESC
    LIMIT 200
    `,
    [tenantId, instanciaId]
  );

  return {
    instancia: {
      id: Number(i.id),
      entidadeTipo: String(i.entidadeTipo),
      entidadeId: Number(i.entidadeId),
      tituloInstancia: String(i.tituloInstancia),
      statusInstancia: String(i.statusInstancia) as any,
      chaveEstadoAtual: String(i.chaveEstadoAtual),
      idUsuarioResponsavelAtual: i.idUsuarioResponsavelAtual !== null ? Number(i.idUsuarioResponsavelAtual) : null,
      vencimentoEtapaEm: toIso(i.vencimentoEtapaEm),
      iniciadoEm: toIso(i.iniciadoEm) || nowIso(),
      finalizadoEm: toIso(i.finalizadoEm),
    } satisfies WorkflowInstanciaDTO,
    modelo: detalheModelo.modelo,
    estados: detalheModelo.estados,
    transicoes: detalheModelo.transicoes,
    historico: (histRows as any[]).map((r) => ({
      id: Number(r.id),
      chaveEstadoAnterior: r.chaveEstadoAnterior ? String(r.chaveEstadoAnterior) : null,
      chaveEstadoNovo: String(r.chaveEstadoNovo),
      acaoExecutada: r.acaoExecutada ? String(r.acaoExecutada) : null,
      parecer: r.parecer ? String(r.parecer) : null,
      idUsuarioEvento: r.idUsuarioEvento !== null ? Number(r.idUsuarioEvento) : null,
      idAssinaturaRegistro: r.idAssinaturaRegistro !== null ? Number(r.idAssinaturaRegistro) : null,
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })) satisfies WorkflowHistoricoDTO[],
    tarefas: (tRows as any[]).map((r) => ({
      id: Number(r.id),
      tipoTarefa: String(r.tipoTarefa) as any,
      tituloTarefa: String(r.tituloTarefa),
      descricaoTarefa: r.descricaoTarefa ? String(r.descricaoTarefa) : null,
      idUsuarioResponsavel: r.idUsuarioResponsavel !== null ? Number(r.idUsuarioResponsavel) : null,
      statusTarefa: String(r.statusTarefa) as any,
      prazoEm: toIso(r.prazoEm),
      concluidaEm: toIso(r.concluidaEm),
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })) satisfies WorkflowTarefaDTO[],
    contexto: parseJsonMaybe(i.contextoJson),
  };
}

function validateFormulario(campos: WorkflowTransicaoCampoDTO[], formulario: Record<string, unknown> | undefined) {
  const f = formulario || {};
  for (const c of campos) {
    if (!c.ativo) continue;
    const key = String(c.chaveCampo);
    const v = (f as any)[key];
    if (c.obrigatorio && (v === undefined || v === null || v === '')) throw new ApiError(422, `Campo obrigatório: ${key}`);
  }
}

export async function listarTransicoesDisponiveis(args: { tenantId: number; instanciaId: number; userId: number }): Promise<WorkflowTransicaoDisponivelDTO[]> {
  const detalhe = await obterInstanciaWorkflow(args.tenantId, args.instanciaId);
  if (detalhe.instancia.statusInstancia !== 'ATIVA') return [];

  const handler = getWorkflowHandler(detalhe.instancia.entidadeTipo);
  const rota = handler?.rotaDetalhe ? handler.rotaDetalhe(detalhe.instancia.entidadeId) : '/dashboard/workflows';
  const ctx = {
    instancia: detalhe.instancia,
    entidade: detalhe.contexto || {},
    rota,
  };

  const meta = parseJsonMaybe((await db.query(`SELECT metadata_json AS meta FROM workflows_instancias WHERE tenant_id = ? AND id_workflow_instancia = ? LIMIT 1`, [args.tenantId, args.instanciaId]) as any)[0]?.[0]?.meta) || {};
  const scope = meta?.scope ?? null;

  const currentEstado = detalhe.estados.find((e) => e.chaveEstado === detalhe.instancia.chaveEstadoAtual);
  if (!currentEstado) return [];

  const out: WorkflowTransicaoDisponivelDTO[] = [];
  for (const t of detalhe.transicoes) {
    if (!t.ativo || !t.visivelNoUi) continue;
    if (t.estadoOrigemId !== currentEstado.id) continue;
    if (t.condicao && !evaluateCondition(t.condicao, ctx as any)) continue;
    const okExec = await canExecuteTransition({
      tenantId: args.tenantId,
      tipoExecutor: t.tipoExecutor,
      userId: args.userId,
      solicitanteUserId: null,
      responsavelAtualUserId: detalhe.instancia.idUsuarioResponsavelAtual,
      idUsuarioExecutor: t.idUsuarioExecutor,
      permissaoExecutor: t.permissaoExecutor,
      scope,
    });
    if (!okExec) continue;
    out.push({
      chaveTransicao: t.chaveTransicao,
      nomeTransicao: t.nomeTransicao,
      exigeParecer: t.exigeParecer,
      exigeAssinatura: t.exigeAssinatura,
      campos: (t.campos || []).filter((c) => c.ativo),
    });
  }
  return out;
}

export async function executarTransicaoWorkflow(args: { tenantId: number; instanciaId: number; userId: number; acao: WorkflowAcaoExecuteDTO; ip?: string | null; userAgent?: string | null }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[i]]: any = await conn.query(
      `
      SELECT
        id_workflow_instancia AS id,
        id_workflow_modelo AS idModelo,
        entidade_tipo AS entidadeTipo,
        entidade_id AS entidadeId,
        status_instancia AS statusInstancia,
        chave_estado_atual AS chaveEstadoAtual,
        id_estado_atual AS idEstadoAtual,
        id_usuario_solicitante AS idUsuarioSolicitante,
        id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
        dados_contexto_json AS contextoJson,
        metadata_json AS metadataJson
      FROM workflows_instancias
      WHERE tenant_id = ? AND id_workflow_instancia = ?
      LIMIT 1
      `,
      [args.tenantId, args.instanciaId]
    );
    if (!i) throw new ApiError(404, 'Instância não encontrada.');
    if (String(i.statusInstancia) !== 'ATIVA') throw new ApiError(422, 'Instância não está ativa.');

    const detalheModelo = await obterModeloDetalhe(args.tenantId, Number(i.idModelo));
    const estadoAtual = detalheModelo.estados.find((e) => e.id === Number(i.idEstadoAtual));
    if (!estadoAtual) throw new ApiError(422, 'Estado atual inválido.');

    const chaveTransicao = String(args.acao.chaveTransicao || '').trim();
    const transicao = detalheModelo.transicoes.find((t) => t.chaveTransicao === chaveTransicao && t.ativo);
    if (!transicao) throw new ApiError(404, 'Transição não encontrada.');
    if (transicao.estadoOrigemId !== estadoAtual.id) throw new ApiError(422, 'Transição não é válida para o estado atual.');

    const meta = parseJsonMaybe(i.metadataJson) || {};
    const scope = meta?.scope ?? null;

    const okExec = await canExecuteTransition({
      tenantId: args.tenantId,
      tipoExecutor: transicao.tipoExecutor,
      userId: args.userId,
      solicitanteUserId: i.idUsuarioSolicitante !== null ? Number(i.idUsuarioSolicitante) : null,
      responsavelAtualUserId: i.idUsuarioResponsavelAtual !== null ? Number(i.idUsuarioResponsavelAtual) : null,
      idUsuarioExecutor: transicao.idUsuarioExecutor,
      permissaoExecutor: transicao.permissaoExecutor,
      scope,
    });
    if (!okExec) throw new ApiError(403, 'Usuário não pode executar esta transição.');

    const contexto = parseJsonMaybe(i.contextoJson) || {};
    const ctx = { instancia: { ...i }, entidade: contexto, formulario: args.acao.formulario || {} };
    if (transicao.condicao && !evaluateCondition(transicao.condicao, ctx as any)) throw new ApiError(422, 'Condição da transição não atendida.');

    const parecer = args.acao.parecer ? String(args.acao.parecer).trim() : '';
    if (transicao.exigeParecer && !parecer) throw new ApiError(422, 'Parecer obrigatório.');

    validateFormulario(transicao.campos || [], args.acao.formulario);

    let idAssinaturaRegistro: number | null = null;
    if (transicao.exigeAssinatura) {
      if (!args.acao.assinatura) throw new ApiError(422, 'Assinatura obrigatória.');
      idAssinaturaRegistro = await createSignatureForTransition({
        conn,
        tenantId: args.tenantId,
        userId: args.userId,
        instanciaId: args.instanciaId,
        transicaoChave: transicao.chaveTransicao,
        assinatura: args.acao.assinatura,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
      });
    }

    const estadoDestino = detalheModelo.estados.find((e) => e.id === transicao.estadoDestinoId);
    if (!estadoDestino) throw new ApiError(422, 'Estado destino inválido.');

    const handler = getWorkflowHandler(String(i.entidadeTipo));
    if (handler?.validarTransicao) {
      await handler.validarTransicao({
        tenantId: args.tenantId,
        entidadeId: Number(i.entidadeId),
        chaveTransicao: transicao.chaveTransicao,
        formulario: args.acao.formulario,
        userId: args.userId,
      });
    }

    const vencimento = buildVencimentoFromSla(estadoDestino.slaHoras);

    let responsavelAtual: number | null = i.idUsuarioResponsavelAtual !== null ? Number(i.idUsuarioResponsavelAtual) : null;
    if (estadoDestino.exigeResponsavel) {
      responsavelAtual =
        (await resolveDefaultResponsavel({
          tenantId: args.tenantId,
          tipoExecutor: transicao.tipoExecutor,
          solicitanteUserId: i.idUsuarioSolicitante !== null ? Number(i.idUsuarioSolicitante) : null,
          responsavelAtualUserId: responsavelAtual,
          idUsuarioExecutor: transicao.idUsuarioExecutor,
          permissaoExecutor: transicao.permissaoExecutor,
          scope,
        })) ?? responsavelAtual;
    } else {
      responsavelAtual = null;
    }

    let statusInstancia: any = 'ATIVA';
    let finalizadoEm: string | null = null;
    if (estadoDestino.tipoEstado === 'FINAL_SUCESSO') {
      statusInstancia = 'CONCLUIDA';
      finalizadoEm = nowIso();
    } else if (estadoDestino.tipoEstado === 'FINAL_ERRO') {
      statusInstancia = 'ERRO';
      finalizadoEm = nowIso();
    } else if (estadoDestino.tipoEstado === 'CANCELADO') {
      statusInstancia = 'CANCELADA';
      finalizadoEm = nowIso();
    }

    await conn.execute(
      `
      UPDATE workflows_instancias
      SET chave_estado_atual = ?,
          id_estado_atual = ?,
          status_instancia = ?,
          id_usuario_responsavel_atual = ?,
          vencimento_etapa_em = ?,
          finalizado_em = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_workflow_instancia = ?
      `,
      [
        estadoDestino.chaveEstado,
        estadoDestino.id,
        statusInstancia,
        responsavelAtual,
        vencimento ? new Date(vencimento) : null,
        finalizadoEm ? new Date(finalizadoEm) : null,
        args.tenantId,
        args.instanciaId,
      ]
    );

    await addHistorico(conn, {
      tenantId: args.tenantId,
      instanciaId: args.instanciaId,
      estadoAnterior: estadoAtual.chaveEstado,
      estadoNovo: estadoDestino.chaveEstado,
      acao: transicao.chaveTransicao,
      parecer: parecer || null,
      userId: args.userId,
      idAssinaturaRegistro,
      ip: args.ip ?? null,
      userAgent: args.userAgent ?? null,
      formulario: args.acao.formulario || null,
    });

    if (handler?.aplicarEstadoNaEntidade) {
      await handler.aplicarEstadoNaEntidade({ tenantId: args.tenantId, entidadeId: Number(i.entidadeId), chaveEstado: estadoDestino.chaveEstado, userId: args.userId });
    }

    for (const a of (transicao.acoes || []).slice().sort((x: any, y: any) => Number(x.ordemExecucao || 0) - Number(y.ordemExecucao || 0))) {
      await executeWorkflowAction({
        tenantId: args.tenantId,
        workflowInstanciaId: args.instanciaId,
        entidadeTipo: String(i.entidadeTipo),
        entidadeId: Number(i.entidadeId),
        userId: args.userId,
        tipoAcao: String(a.tipoAcao) as any,
        configuracao: a.configuracao,
        contexto: { ...ctx, formulario: args.acao.formulario || {} },
      });
    }

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listarMinhasTarefasWorkflow(tenantId: number, userId: number) {
  const [rows]: any = await db.query(
    `
    SELECT
      t.id_workflow_instancia_tarefa AS id,
      t.id_workflow_instancia AS idWorkflowInstancia,
      i.entidade_tipo AS entidadeTipo,
      i.entidade_id AS entidadeId,
      i.titulo_instancia AS tituloInstancia,
      i.chave_estado_atual AS chaveEstadoAtual,
      i.vencimento_etapa_em AS vencimentoEtapaEm,
      t.tipo_tarefa AS tipoTarefa,
      t.titulo_tarefa AS tituloTarefa,
      t.descricao_tarefa AS descricaoTarefa,
      t.status_tarefa AS statusTarefa,
      t.prazo_em AS prazoEm,
      t.criado_em AS criadoEm
    FROM workflows_instancias_tarefas t
    INNER JOIN workflows_instancias i ON i.id_workflow_instancia = t.id_workflow_instancia
    WHERE t.tenant_id = ?
      AND t.id_usuario_responsavel = ?
      AND t.status_tarefa = 'PENDENTE'
    ORDER BY t.prazo_em IS NULL, t.prazo_em ASC, t.id_workflow_instancia_tarefa DESC
    LIMIT 200
    `,
    [tenantId, userId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    idWorkflowInstancia: Number(r.idWorkflowInstancia),
    entidadeTipo: String(r.entidadeTipo),
    entidadeId: Number(r.entidadeId),
    tituloInstancia: String(r.tituloInstancia),
    chaveEstadoAtual: String(r.chaveEstadoAtual),
    vencimentoEtapaEm: toIso(r.vencimentoEtapaEm),
    tipoTarefa: String(r.tipoTarefa),
    tituloTarefa: String(r.tituloTarefa),
    descricaoTarefa: r.descricaoTarefa ? String(r.descricaoTarefa) : null,
    statusTarefa: String(r.statusTarefa),
    prazoEm: toIso(r.prazoEm),
    criadoEm: toIso(r.criadoEm) || nowIso(),
  }));
}

export async function expirarEtapasWorkflow(args: { tenantId: number }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `
      SELECT id_workflow_instancia AS id, chave_estado_atual AS estado
      FROM workflows_instancias
      WHERE tenant_id = ?
        AND status_instancia = 'ATIVA'
        AND vencimento_etapa_em IS NOT NULL
        AND vencimento_etapa_em < NOW()
      ORDER BY vencimento_etapa_em ASC
      LIMIT 200
      `,
      [args.tenantId]
    );

    let expiradas = 0;
    for (const r of rows as any[]) {
      const id = Number(r.id);
      if (!id) continue;
      const estadoAnterior = r.estado ? String(r.estado) : null;
      await conn.execute(
        `
        UPDATE workflows_instancias
        SET status_instancia = 'EXPIRADA', finalizado_em = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_workflow_instancia = ?
        `,
        [nowIso(), args.tenantId, id]
      );
      await addHistorico(conn, {
        tenantId: args.tenantId,
        instanciaId: id,
        estadoAnterior,
        estadoNovo: estadoAnterior || 'EXPIRADA',
        acao: 'EXPIRAR',
        parecer: null,
        userId: null,
        idAssinaturaRegistro: null,
        formulario: null,
      });
      expiradas++;
    }

    await conn.commit();
    return { expiradas };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listarInstanciasWorkflow(
  tenantId: number,
  args: { status?: string | null; entidadeTipo?: string | null; limit?: number | null; minhas?: boolean; userId?: number | null }
): Promise<WorkflowInstanciaDTO[]> {
  const where: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];

  if (args.status) {
    where.push('status_instancia = ?');
    params.push(String(args.status));
  }
  if (args.entidadeTipo) {
    where.push('entidade_tipo = ?');
    params.push(String(args.entidadeTipo).toUpperCase());
  }
  if (args.minhas && args.userId) {
    where.push('(id_usuario_solicitante = ? OR id_usuario_responsavel_atual = ?)');
    params.push(Number(args.userId), Number(args.userId));
  }

  const limit = Math.min(200, Math.max(1, Number(args.limit || 50)));
  const [rows]: any = await db.query(
    `
    SELECT
      id_workflow_instancia AS id,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      titulo_instancia AS tituloInstancia,
      status_instancia AS statusInstancia,
      chave_estado_atual AS chaveEstadoAtual,
      id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
      vencimento_etapa_em AS vencimentoEtapaEm,
      iniciado_em AS iniciadoEm,
      finalizado_em AS finalizadoEm
    FROM workflows_instancias
    WHERE ${where.join(' AND ')}
    ORDER BY id_workflow_instancia DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    entidadeTipo: String(r.entidadeTipo),
    entidadeId: Number(r.entidadeId),
    tituloInstancia: String(r.tituloInstancia),
    statusInstancia: String(r.statusInstancia) as any,
    chaveEstadoAtual: String(r.chaveEstadoAtual),
    idUsuarioResponsavelAtual: r.idUsuarioResponsavelAtual !== null ? Number(r.idUsuarioResponsavelAtual) : null,
    vencimentoEtapaEm: toIso(r.vencimentoEtapaEm),
    iniciadoEm: toIso(r.iniciadoEm) || nowIso(),
    finalizadoEm: toIso(r.finalizadoEm),
  }));
}

export async function atualizarModelo(tenantId: number, idModelo: number, body: WorkflowModeloSaveDTO) {
  const [[m]]: any = await db.query(
    `SELECT codigo FROM workflows_modelos WHERE tenant_id = ? AND id_workflow_modelo = ? LIMIT 1`,
    [tenantId, idModelo]
  );
  if (!m) throw new ApiError(404, 'Modelo não encontrado.');
  const codigoAtual = String(m.codigo || '').trim();
  const codigoBody = String(body.codigo || '').trim();
  if (codigoAtual && codigoBody && codigoAtual !== codigoBody) throw new ApiError(422, 'codigo do modelo não pode ser alterado.');
  return criarModelo(tenantId, { ...body, codigo: codigoAtual || codigoBody });
}

