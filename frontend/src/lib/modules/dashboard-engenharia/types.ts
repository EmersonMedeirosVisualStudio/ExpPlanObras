export type DashboardEngenhariaResumoDTO = {
  obrasAtivas: number;
  obrasParalisadas: number;
  obrasConcluidasMes: number;
  medicoesPendentes: number;
  medicoesAtrasadas: number;
  contratosVencendo30d: number;
  solicitacoesUrgentesObra: number;
  ncsCriticasObra: number;
  acidentesMes: number;
  checklistsAtrasados: number;
  valorExecutadoMes: number;
  valorMedidoMes: number;
};

export type DashboardEngenhariaAlertaDTO = {
  tipo:
    | 'MEDICAO_PENDENTE'
    | 'MEDICAO_ATRASADA'
    | 'CONTRATO_VENCENDO'
    | 'SOLICITACAO_URGENTE'
    | 'NC_CRITICA'
    | 'ACIDENTE'
    | 'CHECKLIST_ATRASADO';
  titulo: string;
  subtitulo: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  referenciaId: number | null;
  rota: string | null;
};

export type DashboardEngenhariaSerieDTO = {
  referencia: string;
  obrasIniciadas: number;
  obrasConcluidas: number;
  medicoesEmitidas: number;
  ocorrencias: number;
};

export type DashboardEngenhariaObraRiscoDTO = {
  idObra: number;
  nomeObra: string;
  statusObra: string;
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  ncsCriticas: number;
  acidentes90d: number;
  checklistsAtrasados: number;
  scoreRisco: number;
};

export type DashboardEngenhariaMedicaoDTO = {
  idMedicao: number;
  contratoNumero: string | null;
  obraNome: string;
  competencia: string | null;
  status: string;
  dataPrevistaEnvio: string | null;
  dataPrevistaAprovacao: string | null;
  valorMedido: number;
  atrasoDias: number;
};

export type DashboardEngenhariaCronogramaAcompanhamentoMesDTO = {
  competencia: string;
  planejado: {
    percentualMes: number | null;
    percentualAcumulado: number | null;
    quantidadePlanejada: number | null;
    valorPlanejado: number | null;
  };
  executado: {
    valorMedidoMes: number;
    valorMedidoAcumulado: number;
    percentualFinanceiroMes: number | null;
    percentualFinanceiroAcumulado: number | null;
    quantidadeExecutadaMes: number | null;
    quantidadeExecutadaAcumulada: number | null;
    percentualQuantidadeMes: number | null;
    percentualQuantidadeAcumulado: number | null;
  };
};

export type DashboardEngenhariaCronogramaAcompanhamentoDTO = {
  idObra: number;
  idContrato: number;
  numeroContrato: string;
  valorContratado: number;
  criterioAvanco: 'QNT_UN_SERV' | 'HORAS_HOMEM';
  execucaoFinanceiraNivel: 'OBRA' | 'CONTRATO';
  meses: DashboardEngenhariaCronogramaAcompanhamentoMesDTO[];
  warnings: string[];
};
