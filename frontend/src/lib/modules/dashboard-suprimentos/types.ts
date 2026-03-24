export type DashboardFiltroOptionDTO = {
  id: number;
  nome: string;
};

export type DashboardFiltrosDTO = {
  empresaTotal: boolean;
  obras: DashboardFiltroOptionDTO[];
  unidades: DashboardFiltroOptionDTO[];
  almoxarifados?: DashboardFiltroOptionDTO[];
};

export type DashboardSuprimentosResumoDTO = {
  solicitacoesAbertas: number;
  solicitacoesUrgentes: number;
  aprovacoesPendentes: number;
  ordensCompraAbertas: number;
  entregasAtrasadas: number;
  itensAbaixoMinimo: number;
  itensSemGiro60d: number;
  recebimentosPendentes: number;
  divergenciasRecebimento: number;
  valorComprasMes: number;
  valorRecebidoMes: number;
};

export type DashboardSuprimentosAlertaDTO = {
  tipo: 'SOLICITACAO_URGENTE' | 'ESTOQUE_MINIMO' | 'ENTREGA_ATRASADA' | 'APROVACAO_PENDENTE' | 'DIVERGENCIA_RECEBIMENTO';
  titulo: string;
  subtitulo: string;
  referenciaId: number | null;
  rota: string | null;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
};

export type DashboardSuprimentosSerieDTO = {
  referencia: string;
  solicitacoes: number;
  comprasAprovadas: number;
  recebimentos: number;
  rupturas: number;
};

export type DashboardSuprimentosEstoqueCriticoDTO = {
  idItem: number;
  codigo: string;
  descricao: string;
  unidadeMedida: string | null;
  saldoAtual: number;
  estoqueMinimo: number;
  deficit: number;
  tipoLocal: 'OBRA' | 'UNIDADE' | 'ALMOXARIFADO';
  localNome: string;
};

export type DashboardSuprimentosCompraAndamentoDTO = {
  idPedido: number;
  numeroPedido: string;
  fornecedorNome: string;
  status: string;
  dataPrevistaEntrega: string | null;
  valorTotal: number;
  atrasoDias: number;
};

