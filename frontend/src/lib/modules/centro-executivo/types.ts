export type CentroExecutivoFiltrosDTO = {
  idDiretoria?: number;
  idObra?: number;
  idUnidade?: number;
  periodo?: 'MES_ATUAL' | 'ULTIMOS_3_MESES' | 'ULTIMOS_6_MESES' | 'ANO_ATUAL' | 'PERSONALIZADO';
  dataInicial?: string;
  dataFinal?: string;
  recorte?: 'DIRETORIA' | 'OBRA' | 'UNIDADE';
};

export type CentroExecutivoResumoDTO = {
  contratosAtivos: number;
  obrasAtivas: number;
  obrasParalisadas: number;
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  funcionariosAtivos: number;
  horasExtrasPendentes: number;
  ncsCriticas: number;
  acidentesMes: number;
  treinamentosVencidos: number;
  itensEstoqueCritico: number;
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
  saldoFinanceiro: number;
};

export type CentroExecutivoAlertaDTO = {
  tipo:
    | 'CONTRATO_VENCENDO'
    | 'MEDICAO_ATRASADA'
    | 'SOLICITACAO_URGENTE'
    | 'NC_CRITICA'
    | 'ACIDENTE'
    | 'TREINAMENTO_VENCIDO'
    | 'ESTOQUE_CRITICO';
  titulo: string;
  subtitulo: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  referenciaId: number | null;
  rota: string | null;
  modulo: 'RH' | 'SST' | 'SUPRIMENTOS' | 'ENGENHARIA' | 'FINANCEIRO';
};

export type CentroExecutivoSerieDTO = {
  referencia: string;
  valorExecutado: number;
  medicoes: number;
  ncsCriticas: number;
  acidentes: number;
  solicitacoesUrgentes: number;
};

export type CentroExecutivoComparativoDTO = {
  recorte: 'DIRETORIA' | 'OBRA' | 'UNIDADE';
  referenciaId: number;
  nome: string;
  contratosAtivos: number;
  obrasAtivas: number;
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  funcionariosAtivos: number;
  ncsCriticas: number;
  acidentes90d: number;
  estoqueCritico: number;
  valorExecutado: number;
  scoreSaude: number;
};

export type CentroExecutivoMatrizLinhaDTO = {
  recorte: 'DIRETORIA' | 'OBRA' | 'UNIDADE';
  referenciaId: number;
  nome: string;
  rhScore: number;
  sstScore: number;
  suprimentosScore: number;
  engenhariaScore: number;
  financeiroScore: number;
  scoreGlobal: number;
};

export type CentroExecutivoRankingObraDTO = {
  idObra: number;
  nomeObra: string;
  diretoriaNome: string | null;
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  ncsCriticas: number;
  acidentes90d: number;
  treinamentosVencidos: number;
  estoqueCritico: number;
  scoreRisco: number;
};

export type DashboardFiltrosExecutivosDTO = {
  empresaTotal: boolean;
  diretorias: { id: number; nome: string }[];
  obras: { id: number; nome: string }[];
  unidades: { id: number; nome: string }[];
};

