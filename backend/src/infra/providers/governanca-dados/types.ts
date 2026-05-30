export type GovernancaAtivoTipo = 'TABELA_OPERACIONAL' | 'DW_DIM' | 'DW_FACT' | 'DW_MART' | 'DATASET' | 'API' | 'RELATORIO';
export type GovernancaClassificacao = 'PUBLICO' | 'INTERNO' | 'SENSIVEL' | 'RESTRITO';

export type GovernancaAtivoDTO = {
  id: number;
  codigoAtivo: string;
  nomeAtivo: string;
  tipoAtivo: GovernancaAtivoTipo;
  dominioNome: string | null;
  classificacaoGlobal: GovernancaClassificacao;
  criticidadeNegocio: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  statusAtivo: 'ATIVO' | 'OBSOLETO' | 'DESCONTINUADO';
  ownerNegocioNome: string | null;
  ownerTecnicoNome: string | null;
  slaFreshnessMinutos: number | null;
};

export type GovernancaCampoDTO = {
  id: number;
  caminhoCampo: string;
  nomeCampoExibicao: string;
  tipoDado: string;
  classificacaoCampo: GovernancaClassificacao;
  pii: boolean;
  campoChave: boolean;
  campoObrigatorio: boolean;
  campoMascaravel: boolean;
  estrategiaMascaraPadrao: string | null;
};

export type GovernancaLineageDTO = {
  ativoOrigemId: number;
  ativoOrigemNome: string;
  ativoDestinoId: number;
  ativoDestinoNome: string;
  tipoRelacao: string;
  nivelRelacao: 'ATIVO' | 'CAMPO';
  campoOrigem: string | null;
  campoDestino: string | null;
};

export type GovernancaQualidadeRegraDTO = {
  id: number;
  nomeRegra: string;
  tipoRegra: string;
  caminhoCampo: string | null;
  severidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  ativo: boolean;
};

export type GovernancaQualidadeIssueDTO = {
  id: number;
  tituloIssue: string;
  severidade: string;
  statusIssue: string;
  ultimaOcorrenciaEm: string;
  responsavelNome: string | null;
};

