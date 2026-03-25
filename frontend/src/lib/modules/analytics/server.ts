import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { AnalyticsCargaExecucaoDTO, AnalyticsExecucaoStatus, AnalyticsPipelineNome, AnalyticsSaudePipelineDTO, AnalyticsExternalTokenDTO } from './types';
import { generateExternalToken, hashExternalToken } from './security';
import { executarPipelineAnalytics } from './etl/pipelines';

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('dw_cargas_') || msg.includes('dw_dim_') || msg.includes('dw_fact_') || msg.includes('analytics_external_tokens') || msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem tabelas da camada Analytics/DW. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

function iso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function criarExecucao(args: { tenantId: number | null; pipelineNome: string; etapaNome: string }) {
  try {
    const [res]: any = await db.query(
      `
      INSERT INTO dw_cargas_execucoes
        (tenant_id, pipeline_nome, etapa_nome, status_execucao, iniciado_em)
      VALUES
        (?, ?, ?, 'PROCESSANDO', NOW())
      `,
      [args.tenantId, args.pipelineNome, args.etapaNome]
    );
    return Number(res.insertId);
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function finalizarExecucao(args: {
  idExecucao: number;
  status: AnalyticsExecucaoStatus;
  mensagem?: string | null;
  registros?: { lidos?: number; inseridos?: number; atualizados?: number; ignorados?: number };
}) {
  try {
    await db.query(
      `
      UPDATE dw_cargas_execucoes
      SET status_execucao = ?,
          finalizado_em = NOW(),
          registros_lidos = ?,
          registros_inseridos = ?,
          registros_atualizados = ?,
          registros_ignorados = ?,
          mensagem_resultado = ?
      WHERE id_dw_carga_execucao = ?
      `,
      [
        args.status,
        Number(args.registros?.lidos || 0),
        Number(args.registros?.inseridos || 0),
        Number(args.registros?.atualizados || 0),
        Number(args.registros?.ignorados || 0),
        args.mensagem || null,
        args.idExecucao,
      ]
    );
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function getWatermark(args: { tenantId: number | null; pipelineNome: string; origemNome: string }) {
  try {
    const [[row]]: any = await db.query(
      `
      SELECT ultimo_updated_at AS ultimoUpdatedAt, ultimo_id AS ultimoId
      FROM dw_cargas_watermarks
      WHERE tenant_id <=> ? AND pipeline_nome = ? AND origem_nome = ?
      LIMIT 1
      `,
      [args.tenantId, args.pipelineNome, args.origemNome]
    );
    return {
      ultimoUpdatedAt: row?.ultimoUpdatedAt ? new Date(row.ultimoUpdatedAt) : null,
      ultimoId: row?.ultimoId !== null && row?.ultimoId !== undefined ? Number(row.ultimoId) : null,
    };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function setWatermark(args: { tenantId: number | null; pipelineNome: string; origemNome: string; ultimoUpdatedAt: Date | null; ultimoId: number | null }) {
  try {
    await db.query(
      `
      INSERT INTO dw_cargas_watermarks
        (tenant_id, pipeline_nome, origem_nome, ultimo_updated_at, ultimo_id)
      VALUES
        (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ultimo_updated_at = VALUES(ultimo_updated_at),
        ultimo_id = VALUES(ultimo_id),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [args.tenantId, args.pipelineNome, args.origemNome, args.ultimoUpdatedAt ? args.ultimoUpdatedAt : null, args.ultimoId]
    );
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarExecucoes(args: { tenantId?: number | null; limit?: number }) {
  const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_dw_carga_execucao AS id,
        tenant_id AS tenantId,
        pipeline_nome AS pipelineNome,
        etapa_nome AS etapaNome,
        status_execucao AS statusExecucao,
        iniciado_em AS iniciadoEm,
        finalizado_em AS finalizadoEm,
        registros_lidos AS registrosLidos,
        registros_inseridos AS registrosInseridos,
        registros_atualizados AS registrosAtualizados,
        registros_ignorados AS registrosIgnorados,
        mensagem_resultado AS mensagemResultado,
        criado_em AS criadoEm
      FROM dw_cargas_execucoes
      WHERE (? IS NULL OR tenant_id = ?)
      ORDER BY id_dw_carga_execucao DESC
      LIMIT ?
      `,
      [args.tenantId ?? null, args.tenantId ?? null, limit]
    );
    return (rows as any[]).map(
      (r) =>
        ({
          id: Number(r.id),
          tenantId: r.tenantId !== null && r.tenantId !== undefined ? Number(r.tenantId) : null,
          pipelineNome: String(r.pipelineNome),
          etapaNome: String(r.etapaNome),
          statusExecucao: String(r.statusExecucao) as any,
          iniciadoEm: iso(r.iniciadoEm),
          finalizadoEm: iso(r.finalizadoEm),
          registrosLidos: Number(r.registrosLidos || 0),
          registrosInseridos: Number(r.registrosInseridos || 0),
          registrosAtualizados: Number(r.registrosAtualizados || 0),
          registrosIgnorados: Number(r.registrosIgnorados || 0),
          mensagemResultado: r.mensagemResultado ? String(r.mensagemResultado) : null,
          criadoEm: iso(r.criadoEm) || new Date().toISOString(),
        }) satisfies AnalyticsCargaExecucaoDTO
    );
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function obterExecucao(args: { tenantId: number; idExecucao: number }) {
  try {
    const [[r]]: any = await db.query(
      `
      SELECT
        id_dw_carga_execucao AS id,
        tenant_id AS tenantId,
        pipeline_nome AS pipelineNome,
        etapa_nome AS etapaNome,
        status_execucao AS statusExecucao,
        iniciado_em AS iniciadoEm,
        finalizado_em AS finalizadoEm,
        registros_lidos AS registrosLidos,
        registros_inseridos AS registrosInseridos,
        registros_atualizados AS registrosAtualizados,
        registros_ignorados AS registrosIgnorados,
        mensagem_resultado AS mensagemResultado,
        criado_em AS criadoEm
      FROM dw_cargas_execucoes
      WHERE tenant_id = ? AND id_dw_carga_execucao = ?
      LIMIT 1
      `,
      [args.tenantId, args.idExecucao]
    );
    if (!r) throw new ApiError(404, 'Execução não encontrada.');
    return {
      id: Number(r.id),
      tenantId: r.tenantId !== null && r.tenantId !== undefined ? Number(r.tenantId) : null,
      pipelineNome: String(r.pipelineNome),
      etapaNome: String(r.etapaNome),
      statusExecucao: String(r.statusExecucao) as any,
      iniciadoEm: iso(r.iniciadoEm),
      finalizadoEm: iso(r.finalizadoEm),
      registrosLidos: Number(r.registrosLidos || 0),
      registrosInseridos: Number(r.registrosInseridos || 0),
      registrosAtualizados: Number(r.registrosAtualizados || 0),
      registrosIgnorados: Number(r.registrosIgnorados || 0),
      mensagemResultado: r.mensagemResultado ? String(r.mensagemResultado) : null,
      criadoEm: iso(r.criadoEm) || new Date().toISOString(),
    } satisfies AnalyticsCargaExecucaoDTO;
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

function defaultPipelineList() {
  return ['DIMENSOES_BASE', 'RH', 'SST', 'SUPRIMENTOS', 'ENGENHARIA', 'MARTS', 'REBUILD'];
}

export async function listarPipelines(args: { tenantId: number }) {
  try {
    const [latestRows]: any = await db.query(
      `
      SELECT e.*
      FROM dw_cargas_execucoes e
      INNER JOIN (
        SELECT pipeline_nome, MAX(id_dw_carga_execucao) AS maxId
        FROM dw_cargas_execucoes
        WHERE tenant_id = ?
        GROUP BY pipeline_nome
      ) x ON x.pipeline_nome = e.pipeline_nome AND x.maxId = e.id_dw_carga_execucao
      WHERE e.tenant_id = ?
      `,
      [args.tenantId, args.tenantId]
    );

    const [wmRows]: any = await db.query(
      `
      SELECT pipeline_nome AS pipelineNome, origem_nome AS origemNome, ultimo_updated_at AS ultimoUpdatedAt, ultimo_id AS ultimoId
      FROM dw_cargas_watermarks
      WHERE tenant_id = ?
      ORDER BY pipeline_nome, origem_nome
      `,
      [args.tenantId]
    );

    const latestByPipeline = new Map<string, any>();
    for (const r of latestRows as any[]) latestByPipeline.set(String(r.pipeline_nome), r);

    const wmsByPipeline = new Map<string, any[]>();
    for (const w of wmRows as any[]) {
      const p = String(w.pipelineNome);
      if (!wmsByPipeline.has(p)) wmsByPipeline.set(p, []);
      wmsByPipeline.get(p)!.push({
        origemNome: String(w.origemNome),
        ultimoUpdatedAt: iso(w.ultimoUpdatedAt),
        ultimoId: w.ultimoId !== null && w.ultimoId !== undefined ? Number(w.ultimoId) : null,
      });
    }

    const pipelines = defaultPipelineList();
    const out: any[] = [];
    for (const p of pipelines) {
      const e = latestByPipeline.get(p) || null;
      const iniciadoEm = e?.iniciado_em ? iso(e.iniciado_em) : null;
      const finalizadoEm = e?.finalizado_em ? iso(e.finalizado_em) : null;
      let duracaoSeg: number | null = null;
      if (iniciadoEm && finalizadoEm) {
        const a = new Date(iniciadoEm).getTime();
        const b = new Date(finalizadoEm).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) duracaoSeg = Math.floor((b - a) / 1000);
      }

      out.push({
        pipelineNome: p,
        ultimoExecucaoId: e ? Number(e.id_dw_carga_execucao) : null,
        ultimoStatus: e ? String(e.status_execucao) : null,
        ultimoInicio: iniciadoEm,
        ultimoFim: finalizadoEm,
        duracaoSeg,
        watermarks: wmsByPipeline.get(p) || [],
      });
    }

    return out;
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

function pipelineOrigins(pipelineNome: string) {
  const p = String(pipelineNome || '').toUpperCase();
  if (p === 'RH') return ['PRESENCAS'];
  if (p === 'SST') return ['NC'];
  if (p === 'SUPRIMENTOS') return ['SOLICITACOES'];
  return [];
}

export async function resetWatermarks(args: { tenantId: number; pipelineNome: string; origemNome?: string | null }) {
  const pipelineNome = String(args.pipelineNome || '').trim().toUpperCase();
  const origemNome = args.origemNome ? String(args.origemNome).trim().toUpperCase() : null;
  const origins = origemNome ? [origemNome] : pipelineOrigins(pipelineNome);
  if (!origins.length) return { ok: true };

  try {
    for (const o of origins) {
      await db.query(
        `
        INSERT INTO dw_cargas_watermarks
          (tenant_id, pipeline_nome, origem_nome, ultimo_updated_at, ultimo_id)
        VALUES
          (?, ?, ?, NULL, 0)
        ON DUPLICATE KEY UPDATE
          ultimo_updated_at = NULL,
          ultimo_id = 0,
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [args.tenantId, pipelineNome, o]
      );
    }
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function obterSaudePipelines(args: { tenantId?: number | null }): Promise<AnalyticsSaudePipelineDTO[]> {
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        pipeline_nome AS pipelineNome,
        tenant_id AS tenantId,
        MAX(finalizado_em) AS ultimoFinalizadoEm,
        MAX(CASE WHEN status_execucao = 'SUCESSO' THEN finalizado_em END) AS ultimoSucessoEm,
        SUBSTRING_INDEX(GROUP_CONCAT(status_execucao ORDER BY id_dw_carga_execucao DESC), ',', 1) AS ultimoStatus
      FROM dw_cargas_execucoes
      WHERE (? IS NULL OR tenant_id = ?)
      GROUP BY pipeline_nome, tenant_id
      ORDER BY pipeline_nome
      `,
      [args.tenantId ?? null, args.tenantId ?? null]
    );

    const now = Date.now();
    return (rows as any[]).map((r) => {
      const ultimoSucesso = r.ultimoSucessoEm ? new Date(r.ultimoSucessoEm).getTime() : null;
      const atrasadoMinutos = ultimoSucesso ? Math.floor((now - ultimoSucesso) / 60000) : null;
      return {
        pipelineNome: String(r.pipelineNome),
        tenantId: r.tenantId !== null && r.tenantId !== undefined ? Number(r.tenantId) : null,
        ultimoStatus: r.ultimoStatus ? (String(r.ultimoStatus) as any) : null,
        ultimoSucessoEm: iso(r.ultimoSucessoEm),
        ultimoFinalizadoEm: iso(r.ultimoFinalizadoEm),
        atrasadoMinutos,
      } satisfies AnalyticsSaudePipelineDTO;
    });
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function executarPipeline(args: { tenantId: number | null; pipelineNome: AnalyticsPipelineNome | string; modo?: string | null }) {
  const pipelineNome = String(args.pipelineNome || '').trim().toUpperCase();
  if (!pipelineNome) throw new ApiError(422, 'pipelineNome obrigatório');
  const tenantId = args.tenantId ?? null;

  const execId = await criarExecucao({ tenantId, pipelineNome, etapaNome: 'PIPELINE' });
  try {
    const out = await executarPipelineAnalytics({ tenantId, pipelineNome });
    await finalizarExecucao({
      idExecucao: execId,
      status: out.ok ? 'SUCESSO' : 'PARCIAL',
      mensagem: out.message,
      registros: out.registros,
    });
    return { idExecucao: execId, ...out };
  } catch (e: any) {
    await finalizarExecucao({
      idExecucao: execId,
      status: 'ERRO',
      mensagem: e?.message ? String(e.message) : 'Erro',
    });
    throw e;
  }
}

export async function reprocessarPipeline(args: { tenantId: number; pipelineNome: string; dataInicial?: string | null; dataFinal?: string | null; full?: boolean }) {
  const pipelineNome = String(args.pipelineNome || '').trim().toUpperCase();
  if (!pipelineNome) throw new ApiError(422, 'pipelineNome obrigatório');
  if (args.full) await resetWatermarks({ tenantId: args.tenantId, pipelineNome });
  return executarPipeline({ tenantId: args.tenantId, pipelineNome });
}

export async function criarExternalToken(args: { tenantId: number; nome: string; datasets: string[]; expiraEm?: string | null }) {
  const nome = String(args.nome || '').trim();
  if (!nome) throw new ApiError(422, 'nome obrigatório');
  if (!Array.isArray(args.datasets) || !args.datasets.length) throw new ApiError(422, 'datasets obrigatório');

  const token = generateExternalToken();
  const tokenHash = hashExternalToken(token);

  try {
    const [res]: any = await db.query(
      `
      INSERT INTO analytics_external_tokens
        (tenant_id, nome, token_hash, datasets_json, ativo, expira_em)
      VALUES
        (?, ?, ?, ?, 1, ?)
      `,
      [args.tenantId, nome.slice(0, 180), tokenHash, JSON.stringify(args.datasets), args.expiraEm || null]
    );
    return { id: Number(res.insertId), token };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarExternalTokens(args: { tenantId: number; limit?: number }): Promise<AnalyticsExternalTokenDTO[]> {
  const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_analytics_external_token AS id,
        nome,
        datasets_json AS datasetsJson,
        ativo,
        expira_em AS expiraEm,
        criado_em AS criadoEm
      FROM analytics_external_tokens
      WHERE tenant_id = ?
      ORDER BY id_analytics_external_token DESC
      LIMIT ?
      `,
      [args.tenantId, limit]
    );
    return (rows as any[]).map((r) => {
      const datasets = r.datasetsJson ? (typeof r.datasetsJson === 'string' ? JSON.parse(r.datasetsJson) : r.datasetsJson) : [];
      return {
        id: Number(r.id),
        nome: String(r.nome),
        datasets: Array.isArray(datasets) ? datasets.map((d) => String(d)) : [],
        ativo: Boolean(r.ativo),
        expiraEm: iso(r.expiraEm),
        criadoEm: iso(r.criadoEm) || new Date().toISOString(),
      } satisfies AnalyticsExternalTokenDTO;
    });
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function desativarExternalToken(args: { tenantId: number; tokenId: number }) {
  try {
    await db.query(`UPDATE analytics_external_tokens SET ativo = 0 WHERE tenant_id = ? AND id_analytics_external_token = ?`, [args.tenantId, args.tokenId]);
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

