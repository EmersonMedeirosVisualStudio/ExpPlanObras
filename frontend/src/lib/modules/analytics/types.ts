export type AnalyticsPipelineNome =
  | 'DIMENSOES_BASE'
  | 'RH'
  | 'SST'
  | 'SUPRIMENTOS'
  | 'ENGENHARIA'
  | 'MARTS'
  | 'REBUILD';

export type AnalyticsExecucaoStatus = 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'PARCIAL' | 'ERRO';

export type AnalyticsCargaExecucaoDTO = {
  id: number;
  tenantId: number | null;
  pipelineNome: AnalyticsPipelineNome | string;
  etapaNome: string;
  statusExecucao: AnalyticsExecucaoStatus;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosIgnorados: number;
  mensagemResultado: string | null;
  criadoEm: string;
};

export type AnalyticsSaudePipelineDTO = {
  pipelineNome: string;
  tenantId: number | null;
  ultimoStatus: AnalyticsExecucaoStatus | null;
  ultimoSucessoEm: string | null;
  ultimoFinalizadoEm: string | null;
  atrasadoMinutos: number | null;
};

export type AnalyticsDatasetScope = 'TENANT' | 'TENANT_LOCAL' | 'TENANT_DIRETORIA';

export type AnalyticsDatasetDef = {
  key: string;
  label: string;
  scope: AnalyticsDatasetScope;
  containsPii: boolean;
  filters: Array<{ key: string; type: 'string' | 'number' | 'date' | 'enum'; required?: boolean; options?: string[] }>;
};

export type AnalyticsQueryRequestDTO = {
  dataset: string;
  filtros?: Record<string, unknown>;
  limit?: number;
};

export type AnalyticsExternalTokenDTO = {
  id: number;
  nome: string;
  datasets: string[];
  ativo: boolean;
  expiraEm: string | null;
  criadoEm: string;
};

