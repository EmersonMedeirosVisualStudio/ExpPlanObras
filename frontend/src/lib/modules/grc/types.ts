export type GrcRiskCategory =
  | 'OPERACIONAL'
  | 'SEGURANCA_INFORMACAO'
  | 'PRIVACIDADE_LGPD'
  | 'REGULATORIO'
  | 'FINANCEIRO'
  | 'JURIDICO'
  | 'TERCEIROS'
  | 'CONTINUIDADE'
  | 'TECNOLOGIA'
  | 'DOCUMENTAL'
  | 'FRAUDE';

export type GrcImpact = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type GrcProbability = 'RARO' | 'IMPROVAVEL' | 'POSSIVEL' | 'PROVAVEL' | 'QUASE_CERTO';
export type GrcRiskStatus = 'ABERTO' | 'MONITORANDO' | 'MITIGADO' | 'ACEITO' | 'ENCERRADO';

export type GrcRiskDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  titulo: string;
  descricao?: string | null;
  categoriaRisco: string;
  modulo?: string | null;
  processoNegocio?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: number | null;
  ownerUserId?: number | null;
  statusRisco: string;
  impactoInerente: string;
  probabilidadeInerente: string;
  scoreInerente: number;
  impactoResidual?: string | null;
  probabilidadeResidual?: string | null;
  scoreResidual?: number | null;
  apetiteScore?: number | null;
  toleranciaScore?: number | null;
  origemRisco?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GrcControlDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoriaControle?: string | null;
  tipoControle: string;
  automacaoControle: string;
  frequenciaExecucao?: string | null;
  ownerUserId?: number | null;
  evidenciaObrigatoria: boolean;
  ativo: boolean;
  criticidade: string;
  createdAt: string;
  updatedAt: string;
};

export type GrcAuditDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  nome: string;
  tipoAuditoria: string;
  statusAuditoria: string;
  escopoDescricao?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GrcFindingDTO = {
  id: number;
  tenantId: number;
  auditoriaId?: number | null;
  riscoId?: number | null;
  controleId?: number | null;
  incidenteId?: number | null;
  criseId?: number | null;
  titulo: string;
  descricao?: string | null;
  gravidade: string;
  statusAchado: string;
  prazoTratativaEm?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GrcActionPlanDTO = {
  id: number;
  tenantId: number;
  origemTipo: string;
  origemId: number;
  titulo: string;
  descricao?: string | null;
  statusPlano: string;
  criticidade: string;
  ownerUserId?: number | null;
  aprovadorUserId?: number | null;
  dataLimite?: string | null;
  concluidoEm?: string | null;
  createdAt: string;
  updatedAt: string;
};
