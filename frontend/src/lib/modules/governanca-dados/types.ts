export type GovernancaAtivoTipo = 'TABELA_OPERACIONAL' | 'DW_DIM' | 'DW_FACT' | 'DW_MART' | 'DATASET' | 'API' | 'RELATORIO';
export type GovernancaClassificacao = 'PUBLICO' | 'INTERNO' | 'SENSIVEL' | 'RESTRITO';

export type GovernancaDominioDTO = {
  id: number;
  tenantId: number;
  codigoDominio: string;
  nomeDominio: string;
  descricaoDominio: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

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
  ativoId: number;
  caminhoCampo: string;
  nomeCampoExibicao: string;
  tipoDado: string;
  descricaoCampo: string | null;
  classificacaoCampo: GovernancaClassificacao;
  pii: boolean;
  campoChave: boolean;
  campoObrigatorio: boolean;
  campoMascaravel: boolean;
  estrategiaMascaraPadrao: string | null;
  origemCampo: string | null;
  ativo: boolean;
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
  tenantId: number;
  ativoId: number;
  caminhoCampo: string | null;
  nomeRegra: string;
  tipoRegra: string;
  severidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  ativo: boolean;
  configuracaoJson: unknown;
  thresholdOk: number | null;
  thresholdAlerta: number | null;
};

export type GovernancaQualidadeIssueDTO = {
  id: number;
  ativoId: number;
  ativoNome: string | null;
  ativoCodigo: string | null;
  regraId: number | null;
  tituloIssue: string;
  severidade: string;
  statusIssue: string;
  ultimaOcorrenciaEm: string;
  responsavelNome: string | null;
};

