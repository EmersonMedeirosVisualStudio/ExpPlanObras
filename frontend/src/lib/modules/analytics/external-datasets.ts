import type { AnalyticsDatasetDef } from './types';

export type DatasetSql = { sql: string; params: any[] };

export type ExternalDatasetHandler = {
  def: AnalyticsDatasetDef;
  buildSql: (args: { tenantId: number; filtros: Record<string, unknown>; limit: number }) => DatasetSql;
};

function clampLimit(v: number) {
  return Math.min(Math.max(v, 1), 5000);
}

function toInt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateStr(v: unknown) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export const EXTERNAL_DATASETS: ExternalDatasetHandler[] = [
  {
    def: {
      key: 'rh_presencas_diarias',
      label: 'RH — Presenças diárias (fato)',
      scope: 'TENANT_LOCAL',
      containsPii: false,
      filters: [
        { key: 'dataInicio', type: 'date', required: false },
        { key: 'dataFim', type: 'date', required: false },
        { key: 'tipoLocal', type: 'enum', required: false, options: ['OBRA', 'UNIDADE'] },
        { key: 'localId', type: 'number', required: false },
      ],
    },
    buildSql({ tenantId, filtros, limit }) {
      const dataInicio = toDateStr(filtros.dataInicio);
      const dataFim = toDateStr(filtros.dataFim);
      const tipoLocal = String(filtros.tipoLocal || '').toUpperCase();
      const localId = toInt(filtros.localId);

      const parts: string[] = [];
      const params: any[] = [tenantId];

      if (dataInicio) {
        parts.push(`t.data_calendario >= ?`);
        params.push(dataInicio);
      }
      if (dataFim) {
        parts.push(`t.data_calendario <= ?`);
        params.push(dataFim);
      }
      if ((tipoLocal === 'OBRA' || tipoLocal === 'UNIDADE') && localId) {
        parts.push(`l.tipo_local = ? AND l.local_id = ?`);
        params.push(tipoLocal, localId);
      }

      const where = parts.length ? ` AND ${parts.join(' AND ')}` : '';
      const lim = clampLimit(limit);

      return {
        sql: `
          SELECT
            f.tenant_id AS tenantId,
            t.data_calendario AS dataReferencia,
            l.tipo_local AS tipoLocal,
            l.local_id AS localId,
            l.nome_local AS localNome,
            f.situacao_presenca AS situacaoPresenca,
            SUM(CASE WHEN f.situacao_presenca = 'PRESENTE' THEN 1 ELSE 0 END) AS presentes,
            SUM(CASE WHEN f.situacao_presenca <> 'PRESENTE' THEN 1 ELSE 0 END) AS ausentes,
            SUM(COALESCE(f.minutos_atraso, 0)) AS minutosAtraso,
            SUM(COALESCE(f.minutos_hora_extra, 0)) AS minutosHoraExtra
          FROM dw_fact_presencas_diarias f
          INNER JOIN dw_dim_tempo t ON t.sk_tempo = f.sk_tempo
          LEFT JOIN dw_dim_local l ON l.sk_local = f.sk_local
          WHERE f.tenant_id = ?
            ${where}
          GROUP BY
            f.tenant_id, t.data_calendario, l.tipo_local, l.local_id, l.nome_local, f.situacao_presenca
          ORDER BY t.data_calendario DESC
          LIMIT ${lim}
        `,
        params,
      };
    },
  },
  {
    def: {
      key: 'sst_nc',
      label: 'SST — Não conformidades (fato)',
      scope: 'TENANT_LOCAL',
      containsPii: false,
      filters: [
        { key: 'dataInicio', type: 'date', required: false },
        { key: 'dataFim', type: 'date', required: false },
        { key: 'tipoLocal', type: 'enum', required: false, options: ['OBRA', 'UNIDADE'] },
        { key: 'localId', type: 'number', required: false },
        { key: 'somenteCriticas', type: 'enum', required: false, options: ['0', '1'] },
      ],
    },
    buildSql({ tenantId, filtros, limit }) {
      const dataInicio = toDateStr(filtros.dataInicio);
      const dataFim = toDateStr(filtros.dataFim);
      const tipoLocal = String(filtros.tipoLocal || '').toUpperCase();
      const localId = toInt(filtros.localId);
      const somenteCriticas = String(filtros.somenteCriticas || '') === '1';

      const parts: string[] = [];
      const params: any[] = [tenantId];

      if (dataInicio) {
        parts.push(`t.data_calendario >= ?`);
        params.push(dataInicio);
      }
      if (dataFim) {
        parts.push(`t.data_calendario <= ?`);
        params.push(dataFim);
      }
      if ((tipoLocal === 'OBRA' || tipoLocal === 'UNIDADE') && localId) {
        parts.push(`l.tipo_local = ? AND l.local_id = ?`);
        params.push(tipoLocal, localId);
      }
      if (somenteCriticas) {
        parts.push(`f.critica = 1`);
      }

      const where = parts.length ? ` AND ${parts.join(' AND ')}` : '';
      const lim = clampLimit(limit);

      return {
        sql: `
          SELECT
            f.tenant_id AS tenantId,
            t.data_calendario AS dataAbertura,
            l.tipo_local AS tipoLocal,
            l.local_id AS localId,
            l.nome_local AS localNome,
            f.severidade,
            f.status_nc AS statusNc,
            COUNT(*) AS total
          FROM dw_fact_sst_nc f
          INNER JOIN dw_dim_tempo t ON t.sk_tempo = f.sk_tempo_abertura
          LEFT JOIN dw_dim_local l ON l.sk_local = f.sk_local
          WHERE f.tenant_id = ?
            ${where}
          GROUP BY f.tenant_id, t.data_calendario, l.tipo_local, l.local_id, l.nome_local, f.severidade, f.status_nc
          ORDER BY t.data_calendario DESC
          LIMIT ${lim}
        `,
        params,
      };
    },
  },
  {
    def: {
      key: 'suprimentos_solicitacoes',
      label: 'Suprimentos — Solicitações (fato)',
      scope: 'TENANT_LOCAL',
      containsPii: false,
      filters: [
        { key: 'dataInicio', type: 'date', required: false },
        { key: 'dataFim', type: 'date', required: false },
        { key: 'tipoLocal', type: 'enum', required: false, options: ['OBRA', 'UNIDADE'] },
        { key: 'localId', type: 'number', required: false },
        { key: 'somenteUrgentes', type: 'enum', required: false, options: ['0', '1'] },
      ],
    },
    buildSql({ tenantId, filtros, limit }) {
      const dataInicio = toDateStr(filtros.dataInicio);
      const dataFim = toDateStr(filtros.dataFim);
      const tipoLocal = String(filtros.tipoLocal || '').toUpperCase();
      const localId = toInt(filtros.localId);
      const somenteUrgentes = String(filtros.somenteUrgentes || '') === '1';

      const parts: string[] = [];
      const params: any[] = [tenantId];

      if (dataInicio) {
        parts.push(`t.data_calendario >= ?`);
        params.push(dataInicio);
      }
      if (dataFim) {
        parts.push(`t.data_calendario <= ?`);
        params.push(dataFim);
      }
      if ((tipoLocal === 'OBRA' || tipoLocal === 'UNIDADE') && localId) {
        parts.push(`l.tipo_local = ? AND l.local_id = ?`);
        params.push(tipoLocal, localId);
      }
      if (somenteUrgentes) {
        parts.push(`f.urgente = 1`);
      }

      const where = parts.length ? ` AND ${parts.join(' AND ')}` : '';
      const lim = clampLimit(limit);

      return {
        sql: `
          SELECT
            f.tenant_id AS tenantId,
            t.data_calendario AS dataReferencia,
            l.tipo_local AS tipoLocal,
            l.local_id AS localId,
            l.nome_local AS localNome,
            f.status_solicitacao AS statusSolicitacao,
            SUM(CASE WHEN f.urgente = 1 THEN 1 ELSE 0 END) AS urgentes,
            COUNT(*) AS totalSolicitacoes,
            SUM(COALESCE(f.itens_total, 0)) AS itensTotal,
            SUM(COALESCE(f.valor_estimado, 0)) AS valorEstimado
          FROM dw_fact_suprimentos_solicitacoes f
          INNER JOIN dw_dim_tempo t ON t.sk_tempo = f.sk_tempo
          LEFT JOIN dw_dim_local l ON l.sk_local = f.sk_local
          WHERE f.tenant_id = ?
            ${where}
          GROUP BY f.tenant_id, t.data_calendario, l.tipo_local, l.local_id, l.nome_local, f.status_solicitacao
          ORDER BY t.data_calendario DESC
          LIMIT ${lim}
        `,
        params,
      };
    },
  },
];

export function getExternalDatasetHandler(datasetKey: string) {
  const key = String(datasetKey || '').trim();
  return EXTERNAL_DATASETS.find((d) => d.def.key === key) || null;
}

