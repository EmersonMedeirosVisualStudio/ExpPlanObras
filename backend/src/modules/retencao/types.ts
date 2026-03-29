export type RetencaoAcaoFinal = 'ARQUIVAR_FRIO' | 'ANONIMIZAR' | 'DELETE_SOFT' | 'DELETE_HARD' | 'RETER_SEM_ACAO' | 'ARQUIVAR_E_EXPURGAR_DEPOIS';

export type RetencaoStatusItem =
  | 'ATIVO'
  | 'ARQUIVADO'
  | 'EM_HOLD'
  | 'ELEGIVEL_DESCARTE'
  | 'EM_DESCARTE'
  | 'ANONIMIZADO'
  | 'DESCARTADO_LOGICO'
  | 'EXPURGADO'
  | 'ERRO';

export type RetencaoEventoBase = 'CRIADO_EM' | 'FINALIZADO_EM' | 'ASSINADO_EM' | 'ENCERRADO_EM' | 'VALIDADE_EM' | 'DESLIGAMENTO_EM' | 'CUSTOM';

export type RetencaoPeriodoUnidade = 'DIAS' | 'MESES' | 'ANOS';

export type RetencaoPoliticaDTO = {
  id: number;
  codigoPolitica: string;
  nomePolitica: string;
  recurso: string;
  categoriaRecurso: string | null;
  eventoBase: RetencaoEventoBase;
  periodoValor: number;
  periodoUnidade: RetencaoPeriodoUnidade;
  acaoFinal: RetencaoAcaoFinal;
  exigeAprovacaoDescarte: boolean;
  ativo: boolean;
  prioridade: number;
};

export type RetencaoItemDTO = {
  id: number;
  recurso: string;
  entidadeId: number;
  categoriaRecurso: string | null;
  statusRetencao: RetencaoStatusItem;
  dataEventoBase: string;
  elegivelDescarteEm: string | null;
  holdAtivo: boolean;
  totalHoldsAtivos: number;
  confidencialidade: string | null;
};

export type LegalHoldDTO = {
  id: number;
  codigoHold: string;
  tituloHold: string;
  motivoHold: string;
  tipoHold: string;
  statusHold: 'ATIVO' | 'LIBERADO' | 'CANCELADO';
  criadoEm: string;
  liberadoEm: string | null;
};

export type DescarteLoteDTO = {
  id: number;
  nomeLote: string;
  tipoExecucao: 'SIMULACAO' | 'REAL';
  statusLote: string;
  totalItens: number;
  totalAnonimizados: number;
  totalDescartados: number;
  totalExpurgados: number;
  totalErros: number;
  criadoEm: string;
  finalizadoEm: string | null;
};

