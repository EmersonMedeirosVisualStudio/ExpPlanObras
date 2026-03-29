export type BcpPlanoTipo = 'BCP' | 'DR' | 'CRISE';
export type BcpCriticidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type BcpTesteTipo = 'TABLETOP' | 'RESTAURACAO' | 'FAILOVER' | 'SIMULACAO' | 'COMUNICACAO';
export type BcpTesteStatus = 'AGENDADO' | 'EXECUTANDO' | 'CONCLUIDO' | 'FALHA' | 'CANCELADO';
export type DrTipoRecuperacao = 'RESTORE_TOTAL' | 'RESTORE_PARCIAL' | 'VALIDACAO_RESTORE' | 'FAILOVER' | 'ROLLBACK';
export type DrStatusExecucao = 'PENDENTE_APROVACAO' | 'EXECUTANDO' | 'CONCLUIDO' | 'FALHA' | 'CANCELADO';
export type CriseStatus = 'ABERTA' | 'EM_AVALIACAO' | 'ATIVA' | 'MITIGADA' | 'RECUPERACAO' | 'ENCERRADA';
export type CriseSeveridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export type ContinuidadePlanoDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  tipoPlano: BcpPlanoTipo;
  modulo?: string | null;
  criticidade: BcpCriticidade;
  rtoMinutos: number;
  rpoMinutos: number;
  ownerUserId?: number | null;
  aprovadoPor?: number | null;
  aprovadoEm?: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReadinessScoreDTO = {
  score: number;
  class: 'SAUDAVEL' | 'ATENCAO' | 'RISCO' | 'CRITICO';
  componentes: Record<string, boolean | number | string | null>;
};

export type DrExecucaoDTO = {
  id: number;
  tenantId: number;
  planoId: number;
  origemTipo: string;
  referenciaOrigem?: string | null;
  tipoRecuperacao: DrTipoRecuperacao;
  statusExecucao: DrStatusExecucao;
  aprovacaoExigida: boolean;
  aprovadoPor?: number | null;
  iniciadoEm?: string | null;
  finalizadoEm?: string | null;
  resultadoResumoJson?: unknown | null;
  rtoRealMinutos?: number | null;
  rpoRealMinutos?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CriseDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  titulo: string;
  descricao?: string | null;
  tipoCrise: string;
  severidade: CriseSeveridade;
  statusCrise: CriseStatus;
  incidenteOrigemId?: number | null;
  planoAcionadoId?: number | null;
  comandanteUserId?: number | null;
  abertaEm?: string | null;
  encerradaEm?: string | null;
  impactoJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
};
