export type AprovacaoStatusSolicitacao =
  | 'RASCUNHO'
  | 'PENDENTE'
  | 'EM_ANALISE'
  | 'APROVADA'
  | 'REJEITADA'
  | 'DEVOLVIDA'
  | 'CANCELADA'
  | 'EXPIRADA';

export type AprovacaoStatusEtapa =
  | 'PENDENTE'
  | 'EM_ANALISE'
  | 'APROVADA'
  | 'REJEITADA'
  | 'DEVOLVIDA'
  | 'PULADA'
  | 'EXPIRADA';

export type AprovacaoDecisaoTipo = 'APROVAR' | 'REJEITAR' | 'DEVOLVER' | 'CANCELAR' | 'REENVIAR';

export type AprovacaoTipoAprovador = 'USUARIO' | 'PERMISSAO' | 'GESTOR_LOCAL' | 'SUPERIOR_HIERARQUICO' | 'DIRETORIA';

export type AprovacaoModeloDTO = {
  id: number;
  nome: string;
  entidadeTipo: string;
  descricaoModelo: string | null;
  ativo: boolean;
  exigeAssinaturaAprovador: boolean;
  permiteDevolucao: boolean;
  permiteReenvio: boolean;
  aplicaAlcadaValor: boolean;
};

export type AprovacaoModeloEtapaDTO = {
  id: number;
  ordem: number;
  nome: string;
  tipoAprovador: AprovacaoTipoAprovador;
  idUsuarioAprovador: number | null;
  permissaoAprovador: string | null;
  exigeTodos: boolean;
  quantidadeMinimaAprovacoes: number | null;
  prazoHoras: number | null;
  valorMinimo: number | null;
  valorMaximo: number | null;
  parecerObrigatorioAprovar: boolean;
  parecerObrigatorioRejeitar: boolean;
  ativo: boolean;
};

export type AprovacaoModeloSaveDTO = {
  nome: string;
  entidadeTipo: string;
  descricaoModelo?: string | null;
  ativo: boolean;
  exigeAssinaturaAprovador: boolean;
  permiteDevolucao: boolean;
  permiteReenvio: boolean;
  aplicaAlcadaValor: boolean;
  etapas: Array<{
    ordem: number;
    nome: string;
    tipoAprovador: AprovacaoTipoAprovador;
    idUsuarioAprovador: number | null;
    permissaoAprovador: string | null;
    exigeTodos: boolean;
    quantidadeMinimaAprovacoes: number | null;
    prazoHoras: number | null;
    valorMinimo: number | null;
    valorMaximo: number | null;
    parecerObrigatorioAprovar: boolean;
    parecerObrigatorioRejeitar: boolean;
    ativo: boolean;
  }>;
};

export type AprovacaoSolicitacaoDTO = {
  id: number;
  idModelo: number;
  entidadeTipo: string;
  entidadeId: number;
  tituloSolicitacao: string;
  descricaoSolicitacao: string | null;
  status: AprovacaoStatusSolicitacao;
  valorReferencia: number | null;
  idUsuarioSolicitante: number;
  idUsuarioResponsavelAtual: number | null;
  enviadaEm: string | null;
  concluidaEm: string | null;
  vencimentoAtualEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type AprovacaoSolicitacaoEtapaDTO = {
  id: number;
  idModeloEtapa: number;
  ordem: number;
  nome: string;
  status: AprovacaoStatusEtapa;
  tipoAprovador: AprovacaoTipoAprovador;
  exigeTodos: boolean;
  quantidadeMinimaAprovacoes: number | null;
  aprovacoesRealizadas: number;
  vencimentoEm: string | null;
  concluidaEm: string | null;
};

export type AprovacaoEtapaAprovadorDTO = {
  id: number;
  idEtapa: number;
  idUsuarioAprovador: number;
  status: 'PENDENTE' | 'APROVOU' | 'REJEITOU' | 'DEVOLVEU' | 'IGNORADO';
  decididoEm: string | null;
};

export type AprovacaoDecisaoDTO = {
  id: number;
  decisao: AprovacaoDecisaoTipo;
  parecer: string | null;
  idUsuarioDecisor: number;
  idAssinaturaRegistro: number | null;
  criadoEm: string;
};

export type AprovacaoHistoricoDTO = {
  id: number;
  statusAnterior: string | null;
  statusNovo: string;
  descricaoEvento: string;
  idUsuarioEvento: number | null;
  criadoEm: string;
};

export type MinhaAprovacaoPendenteDTO = {
  idSolicitacao: number;
  entidadeTipo: string;
  entidadeId: number;
  tituloSolicitacao: string;
  etapaNome: string;
  vencimentoEm: string | null;
  rota: string | null;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
};

export type AprovacaoSolicitacaoDetalheDTO = {
  solicitacao: AprovacaoSolicitacaoDTO;
  etapas: AprovacaoSolicitacaoEtapaDTO[];
  aprovadores: AprovacaoEtapaAprovadorDTO[];
  decisoes: AprovacaoDecisaoDTO[];
  historico: AprovacaoHistoricoDTO[];
  snapshot?: Record<string, unknown> | null;
};

export type AssinaturaInputDTO =
  | { tipo: 'PIN'; pin: string }
  | { tipo: 'ASSINATURA_TELA'; arquivoAssinaturaUrl?: string | null }
  | { tipo: 'QR_CODE'; payload?: string | null };

