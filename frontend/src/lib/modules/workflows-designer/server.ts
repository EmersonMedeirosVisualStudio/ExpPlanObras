import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { WorkflowModeloDTO } from '@/lib/modules/workflows/types';
import { criarModelo, obterModeloDetalhe } from '@/lib/modules/workflows/server';
import type { WorkflowDesignerGraphDTO, WorkflowDesignerRascunhoDTO, WorkflowDesignerSimulationResult, WorkflowDesignerValidationResult } from './types';
import { compileDesignerGraphToWorkflowModeloSave } from './compiler';
import { simulateDesignerGraph } from './simulator';
import { normalizeGraph, validateDesignerGraph } from './validator';

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

function buildDefaultGraph(args: { codigo: string; nomeModelo: string; entidadeTipo: string; descricaoModelo?: string | null }): WorkflowDesignerGraphDTO {
  const startId = 'n_start';
  const stepId = 'n_step_1';
  const endId = 'n_end_success';
  return {
    metadata: { codigo: args.codigo, nomeModelo: args.nomeModelo, entidadeTipo: args.entidadeTipo, descricaoModelo: args.descricaoModelo ?? null },
    nodes: [
      { id: startId, type: 'START', position: { x: 50, y: 80 }, data: { key: 'INICIO', label: 'Início' } },
      { id: stepId, type: 'STEP', position: { x: 300, y: 80 }, data: { key: 'EM_ANALISE', label: 'Em análise', exigeResponsavel: true } },
      { id: endId, type: 'END_SUCCESS', position: { x: 560, y: 80 }, data: { key: 'FINAL_SUCESSO', label: 'Final (Sucesso)' } },
    ],
    edges: [
      { id: 'e1', source: startId, target: stepId, data: { key: 'INICIAR', label: 'Iniciar', tipoExecutor: 'SOLICITANTE', exigeParecer: false, exigeAssinatura: false } },
      {
        id: 'e2',
        source: stepId,
        target: endId,
        data: { key: 'CONCLUIR', label: 'Concluir', tipoExecutor: 'RESPONSAVEL_ATUAL', exigeParecer: false, exigeAssinatura: false },
      },
    ],
  };
}

function normalizeStatus(v: any) {
  const s = String(v || 'RASCUNHO').toUpperCase();
  return (['RASCUNHO', 'VALIDADO', 'PUBLICADO', 'ARQUIVADO'].includes(s) ? s : 'RASCUNHO') as WorkflowDesignerRascunhoDTO['statusRascunho'];
}

function assertSqlReady(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (msg.toLowerCase().includes('workflows_modelos_rascunhos') || msg.toLowerCase().includes('unknown column') || msg.toLowerCase().includes('doesn\'t exist')) {
    throw new ApiError(501, 'Banco sem tabelas/colunas do Designer de Workflow. Aplique o SQL desta etapa para habilitar.');
  }
  throw err;
}

export async function listarRascunhos(tenantId: number, args: { limit?: number | null } = {}): Promise<Array<Omit<WorkflowDesignerRascunhoDTO, 'graph' | 'validation'>>> {
  const limit = Math.min(200, Math.max(1, Number(args.limit || 80)));
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_workflow_modelo_rascunho AS id,
        codigo,
        nome_modelo AS nomeModelo,
        entidade_tipo AS entidadeTipo,
        descricao_modelo AS descricaoModelo,
        status_rascunho AS statusRascunho,
        id_modelo_base AS idModeloBase,
        changelog_text AS changelogText,
        bloqueado_por_usuario AS lockedByUserId,
        bloqueio_expira_em AS lockExpiresAt,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM workflows_modelos_rascunhos
      WHERE tenant_id = ?
      ORDER BY atualizado_em DESC, id_workflow_modelo_rascunho DESC
      LIMIT ?
      `,
      [tenantId, limit]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      codigo: String(r.codigo),
      nomeModelo: String(r.nomeModelo),
      entidadeTipo: String(r.entidadeTipo),
      descricaoModelo: r.descricaoModelo ? String(r.descricaoModelo) : null,
      statusRascunho: normalizeStatus(r.statusRascunho),
      idModeloBase: r.idModeloBase !== null ? Number(r.idModeloBase) : null,
      changelogText: r.changelogText ? String(r.changelogText) : null,
      lockedByUserId: r.lockedByUserId !== null ? Number(r.lockedByUserId) : null,
      lockExpiresAt: toIso(r.lockExpiresAt),
      criadoEm: toIso(r.criadoEm) || nowIso(),
      atualizadoEm: toIso(r.atualizadoEm) || nowIso(),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function criarRascunho(tenantId: number, userId: number, body: { codigo: string; nomeModelo: string; entidadeTipo: string; descricaoModelo?: string | null }) {
  const codigo = String(body.codigo || '').trim();
  const nomeModelo = String(body.nomeModelo || '').trim();
  const entidadeTipo = String(body.entidadeTipo || '').trim().toUpperCase();
  if (!codigo) throw new ApiError(422, 'codigo obrigatório');
  if (!nomeModelo) throw new ApiError(422, 'nomeModelo obrigatório');
  if (!entidadeTipo) throw new ApiError(422, 'entidadeTipo obrigatório');

  const graph = buildDefaultGraph({ codigo, nomeModelo, entidadeTipo, descricaoModelo: body.descricaoModelo ?? null });
  try {
    const [res]: any = await db.execute(
      `
      INSERT INTO workflows_modelos_rascunhos
        (tenant_id, codigo, nome_modelo, entidade_tipo, descricao_modelo, id_modelo_base, status_rascunho,
         graph_json, validation_json, changelog_text, bloqueado_por_usuario, bloqueado_em, bloqueio_expira_em,
         criado_por_usuario, atualizado_por_usuario)
      VALUES
        (?, ?, ?, ?, ?, NULL, 'RASCUNHO', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
      `,
      [tenantId, codigo, nomeModelo.slice(0, 150), entidadeTipo, body.descricaoModelo ?? null, JSON.stringify(graph), userId, userId]
    );
    return { id: Number(res.insertId) };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function obterRascunho(tenantId: number, id: number): Promise<WorkflowDesignerRascunhoDTO> {
  try {
    const [[row]]: any = await db.query(
      `
      SELECT
        id_workflow_modelo_rascunho AS id,
        codigo,
        nome_modelo AS nomeModelo,
        entidade_tipo AS entidadeTipo,
        descricao_modelo AS descricaoModelo,
        status_rascunho AS statusRascunho,
        id_modelo_base AS idModeloBase,
        graph_json AS graphJson,
        validation_json AS validationJson,
        changelog_text AS changelogText,
        bloqueado_por_usuario AS lockedByUserId,
        bloqueio_expira_em AS lockExpiresAt,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM workflows_modelos_rascunhos
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      LIMIT 1
      `,
      [tenantId, id]
    );
    if (!row) throw new ApiError(404, 'Rascunho não encontrado.');

    const graph = normalizeGraph(parseJsonMaybe(row.graphJson));
    const validation = parseJsonMaybe(row.validationJson) as WorkflowDesignerValidationResult | null;

    return {
      id: Number(row.id),
      codigo: String(row.codigo),
      nomeModelo: String(row.nomeModelo),
      entidadeTipo: String(row.entidadeTipo),
      descricaoModelo: row.descricaoModelo ? String(row.descricaoModelo) : null,
      statusRascunho: normalizeStatus(row.statusRascunho),
      idModeloBase: row.idModeloBase !== null ? Number(row.idModeloBase) : null,
      graph,
      validation: validation && typeof validation === 'object' ? validation : null,
      changelogText: row.changelogText ? String(row.changelogText) : null,
      lockedByUserId: row.lockedByUserId !== null ? Number(row.lockedByUserId) : null,
      lockExpiresAt: toIso(row.lockExpiresAt),
      criadoEm: toIso(row.criadoEm) || nowIso(),
      atualizadoEm: toIso(row.atualizadoEm) || nowIso(),
    };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function salvarRascunho(tenantId: number, id: number, userId: number, body: { graph: unknown; changelogText?: string | null }) {
  const graph = normalizeGraph(body.graph);
  if (!graph.metadata.codigo || !graph.metadata.entidadeTipo || !graph.metadata.nomeModelo) throw new ApiError(422, 'graph.metadata inválido.');

  try {
    const [res]: any = await db.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET
        codigo = ?,
        nome_modelo = ?,
        entidade_tipo = ?,
        descricao_modelo = ?,
        graph_json = ?,
        changelog_text = ?,
        atualizado_por_usuario = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      `,
      [
        graph.metadata.codigo,
        graph.metadata.nomeModelo.slice(0, 150),
        graph.metadata.entidadeTipo,
        graph.metadata.descricaoModelo ?? null,
        JSON.stringify(graph),
        body.changelogText ?? null,
        userId,
        tenantId,
        id,
      ]
    );
    if (Number(res.affectedRows || 0) === 0) throw new ApiError(404, 'Rascunho não encontrado.');
    return { status: 'ok' };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function lockRascunho(tenantId: number, id: number, userId: number, args: { force?: boolean } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]]: any = await conn.query(
      `
      SELECT bloqueado_por_usuario AS lockedByUserId, bloqueio_expira_em AS lockExpiresAt
      FROM workflows_modelos_rascunhos
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tenantId, id]
    );
    if (!row) throw new ApiError(404, 'Rascunho não encontrado.');

    const lockedBy = row.lockedByUserId !== null ? Number(row.lockedByUserId) : null;
    const expiresAt = row.lockExpiresAt ? new Date(row.lockExpiresAt).getTime() : 0;
    const expired = !expiresAt || expiresAt < Date.now();

    if (lockedBy && lockedBy !== userId && !expired && !args.force) throw new ApiError(423, `Rascunho está bloqueado pelo usuário #${lockedBy}.`);

    await conn.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET bloqueado_por_usuario = ?, bloqueado_em = NOW(), bloqueio_expira_em = DATE_ADD(NOW(), INTERVAL 20 MINUTE)
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      `,
      [userId, tenantId, id]
    );

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    return assertSqlReady(e) as any;
  } finally {
    conn.release();
  }
}

export async function unlockRascunho(tenantId: number, id: number, userId: number, args: { force?: boolean } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]]: any = await conn.query(
      `
      SELECT bloqueado_por_usuario AS lockedByUserId
      FROM workflows_modelos_rascunhos
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tenantId, id]
    );
    if (!row) throw new ApiError(404, 'Rascunho não encontrado.');

    const lockedBy = row.lockedByUserId !== null ? Number(row.lockedByUserId) : null;
    if (lockedBy && lockedBy !== userId && !args.force) throw new ApiError(423, `Rascunho está bloqueado pelo usuário #${lockedBy}.`);

    await conn.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET bloqueado_por_usuario = NULL, bloqueado_em = NULL, bloqueio_expira_em = NULL
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      `,
      [tenantId, id]
    );

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    return assertSqlReady(e) as any;
  } finally {
    conn.release();
  }
}

export async function heartbeatRascunho(tenantId: number, id: number, userId: number) {
  try {
    const [res]: any = await db.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET bloqueio_expira_em = DATE_ADD(NOW(), INTERVAL 20 MINUTE)
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ? AND bloqueado_por_usuario = ?
      `,
      [tenantId, id, userId]
    );
    if (Number(res.affectedRows || 0) === 0) throw new ApiError(423, 'Sem lock ativo para este usuário.');
    return { status: 'ok' };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function validarRascunho(tenantId: number, id: number, userId: number): Promise<WorkflowDesignerValidationResult> {
  const r = await obterRascunho(tenantId, id);
  const validation = validateDesignerGraph(r.graph);

  try {
    await db.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET validation_json = ?, status_rascunho = ?, atualizado_por_usuario = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      `,
      [JSON.stringify(validation), validation.ok ? 'VALIDADO' : 'RASCUNHO', userId, tenantId, id]
    );
  } catch (e) {
    return assertSqlReady(e) as any;
  }
  return validation;
}

export async function simularRascunho(tenantId: number, id: number, contexto: Record<string, unknown> | null | undefined): Promise<WorkflowDesignerSimulationResult> {
  const r = await obterRascunho(tenantId, id);
  return simulateDesignerGraph(r.graph, contexto);
}

async function disablePreviousPublished(conn: any, tenantId: number, codigo: string, keepId: number) {
  await conn.execute(
    `
    UPDATE workflows_modelos
    SET ativo = 0
    WHERE tenant_id = ? AND codigo = ? AND id_workflow_modelo <> ? AND ativo = 1
    `,
    [tenantId, codigo, keepId]
  );
  try {
    await conn.execute(
      `
      UPDATE workflows_modelos
      SET status_modelo = 'SUBSTITUIDO'
      WHERE tenant_id = ? AND codigo = ? AND id_workflow_modelo <> ? AND status_modelo = 'PUBLICADO'
      `,
      [tenantId, codigo, keepId]
    );
  } catch {}
}

export async function publicarRascunho(tenantId: number, id: number, userId: number, body: { changelogText?: string | null } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]]: any = await conn.query(
      `
      SELECT
        r.id_workflow_modelo_rascunho AS id,
        r.codigo,
        r.nome_modelo AS nomeModelo,
        r.entidade_tipo AS entidadeTipo,
        r.descricao_modelo AS descricaoModelo,
        r.status_rascunho AS statusRascunho,
        r.graph_json AS graphJson,
        r.validation_json AS validationJson,
        r.changelog_text AS changelogText
      FROM workflows_modelos_rascunhos r
      WHERE r.tenant_id = ? AND r.id_workflow_modelo_rascunho = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tenantId, id]
    );
    if (!row) throw new ApiError(404, 'Rascunho não encontrado.');

    const graph = normalizeGraph(parseJsonMaybe(row.graphJson));
    const existingValidation = parseJsonMaybe(row.validationJson) as WorkflowDesignerValidationResult | null;
    const validation = existingValidation && typeof existingValidation === 'object' ? existingValidation : validateDesignerGraph(graph);
    if (!validation.ok) throw new ApiError(422, 'Rascunho inválido. Valide e corrija antes de publicar.');

    const { modelo } = compileDesignerGraphToWorkflowModeloSave(graph);
    const created = await criarModelo(tenantId, modelo);

    const idModeloPublicado = Number((created as any).id);
    if (!idModeloPublicado) throw new ApiError(500, 'Falha ao publicar modelo.');

    await disablePreviousPublished(conn, tenantId, modelo.codigo, idModeloPublicado);

    try {
      await conn.execute(
        `
        UPDATE workflows_modelos
        SET status_modelo = 'PUBLICADO', publicado_em = NOW(), id_usuario_publicador = ?, changelog_text = ?, designer_json = ?
        WHERE tenant_id = ? AND id_workflow_modelo = ?
        `,
        [userId, body.changelogText ?? row.changelogText ?? null, JSON.stringify(graph), tenantId, idModeloPublicado]
      );
    } catch {}

    await conn.execute(
      `
      UPDATE workflows_modelos_rascunhos
      SET status_rascunho = 'PUBLICADO', validation_json = ?, changelog_text = ?, atualizado_por_usuario = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_workflow_modelo_rascunho = ?
      `,
      [JSON.stringify(validation), body.changelogText ?? row.changelogText ?? null, userId, tenantId, id]
    );

    try {
      await conn.execute(
        `
        INSERT INTO workflows_modelos_publicacoes
          (tenant_id, id_workflow_modelo_rascunho, id_workflow_modelo_publicado, versao_publicada, changelog_text, publicado_por_usuario)
        SELECT
          ?, ?, m.id_workflow_modelo, m.versao, ?, ?
        FROM workflows_modelos m
        WHERE m.tenant_id = ? AND m.id_workflow_modelo = ?
        LIMIT 1
        `,
        [tenantId, id, body.changelogText ?? row.changelogText ?? null, userId, tenantId, idModeloPublicado]
      );
    } catch {}

    await conn.commit();
    return { idModeloPublicado };
  } catch (e) {
    await conn.rollback();
    return assertSqlReady(e) as any;
  } finally {
    conn.release();
  }
}

export async function duplicarModeloComoRascunho(tenantId: number, userId: number, modeloId: number) {
  let designerGraph: WorkflowDesignerGraphDTO | null = null;
  let modelo: WorkflowModeloDTO | null = null;

  try {
    const [[row]]: any = await db.query(
      `
      SELECT designer_json AS designerJson
      FROM workflows_modelos
      WHERE tenant_id = ? AND id_workflow_modelo = ?
      LIMIT 1
      `,
      [tenantId, modeloId]
    );
    const g = parseJsonMaybe(row?.designerJson);
    if (g) designerGraph = normalizeGraph(g);
  } catch {}

  try {
    const detalhe = await obterModeloDetalhe(tenantId, modeloId);
    modelo = detalhe.modelo;
    if (!designerGraph) {
      const nodes = detalhe.estados.map((e, idx) => ({
        id: `n_${e.chaveEstado}`,
        type:
          e.tipoEstado === 'INICIAL'
            ? 'START'
            : e.tipoEstado === 'FINAL_SUCESSO'
              ? 'END_SUCCESS'
              : e.tipoEstado === 'FINAL_ERRO'
                ? 'END_ERROR'
                : e.tipoEstado === 'CANCELADO'
                  ? 'CANCEL'
                  : 'STEP',
        position: { x: 60 + idx * 220, y: 120 },
        data: { key: e.chaveEstado, label: e.nomeEstado, color: e.corHex ?? null, slaHoras: e.slaHoras ?? null, exigeResponsavel: e.exigeResponsavel },
      })) as any[];

      const byKeyToId = new Map(nodes.map((n) => [String(n.data.key).toUpperCase(), String(n.id)] as const));
      const edges = detalhe.transicoes.map((t, idx) => ({
        id: `e_${idx + 1}_${t.chaveTransicao}`,
        source: byKeyToId.get(String((t as any).estadoOrigemChave || '').toUpperCase()) || nodes[0]?.id,
        target: byKeyToId.get(String((t as any).estadoDestinoChave || '').toUpperCase()) || nodes[nodes.length - 1]?.id,
        data: {
          key: t.chaveTransicao,
          label: t.nomeTransicao,
          tipoExecutor: t.tipoExecutor,
          idUsuarioExecutor: t.idUsuarioExecutor,
          permissaoExecutor: t.permissaoExecutor,
          exigeParecer: t.exigeParecer,
          exigeAssinatura: t.exigeAssinatura,
          permiteEmLote: t.permiteEmLote,
          condition: t.condicao || null,
          fields: (t.campos || []).map((c) => ({
            key: c.chaveCampo,
            label: c.labelCampo,
            type:
              c.tipoCampo === 'TEXTO'
                ? 'TEXT'
                : c.tipoCampo === 'TEXTO_LONGO'
                  ? 'TEXTAREA'
                  : c.tipoCampo === 'NUMERO'
                    ? 'NUMBER'
                    : c.tipoCampo === 'DATA'
                      ? 'DATE'
                      : c.tipoCampo === 'BOOLEAN'
                        ? 'BOOLEAN'
                        : c.tipoCampo === 'SELECT'
                          ? 'SELECT'
                          : 'JSON',
            required: c.obrigatorio,
            order: c.ordemExibicao,
            options: (c.opcoes as any) || undefined,
            validation: (c.validacao as any) || undefined,
            defaultValue: (c.valorPadrao as any) || undefined,
          })),
          actions: (t.acoes || []).map((a: any) => ({
            type:
              a.tipoAcao === 'NOTIFICAR'
                ? 'NOTIFY'
                : a.tipoAcao === 'EMAIL'
                  ? 'EMAIL'
                  : a.tipoAcao === 'REALTIME'
                    ? 'REALTIME'
                    : a.tipoAcao === 'CRIAR_APROVACAO'
                      ? 'CREATE_APPROVAL'
                      : a.tipoAcao === 'CRIAR_TAREFA'
                        ? 'CREATE_TASK'
                        : a.tipoAcao === 'ATUALIZAR_CAMPO_ENTIDADE'
                          ? 'UPDATE_ENTITY_FIELD'
                          : 'CALL_HANDLER',
            order: a.ordemExecucao || 0,
            config: a.configuracao || undefined,
          })),
        },
      }));

      designerGraph = {
        metadata: { codigo: modelo.codigo, nomeModelo: modelo.nome, entidadeTipo: modelo.entidadeTipo, descricaoModelo: modelo.descricaoModelo },
        nodes,
        edges,
      };
    }
  } catch (e) {
    throw e;
  }

  if (!modelo) throw new ApiError(404, 'Modelo não encontrado.');
  if (!designerGraph) throw new ApiError(500, 'Falha ao construir grafo do modelo.');

  try {
    const [res]: any = await db.execute(
      `
      INSERT INTO workflows_modelos_rascunhos
        (tenant_id, codigo, nome_modelo, entidade_tipo, descricao_modelo, id_modelo_base, status_rascunho,
         graph_json, validation_json, changelog_text, bloqueado_por_usuario, bloqueado_em, bloqueio_expira_em,
         criado_por_usuario, atualizado_por_usuario)
      VALUES
        (?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
      `,
      [tenantId, modelo.codigo, modelo.nome.slice(0, 150), modelo.entidadeTipo, modelo.descricaoModelo ?? null, modeloId, JSON.stringify(designerGraph), userId, userId]
    );
    return { id: Number(res.insertId) };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarPublicacoes(tenantId: number, modeloId: number) {
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_workflow_modelo_publicacao AS id,
        id_workflow_modelo_rascunho AS idRascunho,
        id_workflow_modelo_publicado AS idModeloPublicado,
        versao_publicada AS versaoPublicada,
        changelog_text AS changelogText,
        publicado_por_usuario AS publicadoPorUsuario,
        publicado_em AS publicadoEm
      FROM workflows_modelos_publicacoes
      WHERE tenant_id = ? AND id_workflow_modelo_publicado = ?
      ORDER BY publicado_em DESC, id_workflow_modelo_publicacao DESC
      LIMIT 200
      `,
      [tenantId, modeloId]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      idRascunho: Number(r.idRascunho),
      idModeloPublicado: Number(r.idModeloPublicado),
      versaoPublicada: Number(r.versaoPublicada),
      changelogText: r.changelogText ? String(r.changelogText) : null,
      publicadoPorUsuario: Number(r.publicadoPorUsuario),
      publicadoEm: toIso(r.publicadoEm) || nowIso(),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

