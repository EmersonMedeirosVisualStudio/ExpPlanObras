export type PortalParceiroResumoDTO = {
  empresaId: number;
  empresaNome: string;
  trabalhadoresAtivos: number;
  trabalhadoresBloqueados: number;
  documentosPendentes: number;
  documentosRejeitados: number;
  treinamentosVencidos: number;
  integracoesAgendadas: number;
  episPendentes: number;
};

export type PortalParceiroTrabalhadorDTO = {
  id: number;
  nome: string;
  cpfMascarado: string | null;
  funcao: string | null;
  tipoLocalAtual: 'OBRA' | 'UNIDADE' | null;
  localNomeAtual: string | null;
  integracaoPendente: boolean;
  treinamentoVencido: boolean;
  epiPendente: boolean;
  bloqueado: boolean;
};

export type PortalParceiroPendenciaDTO = {
  tipo: 'DOCUMENTO' | 'TREINAMENTO' | 'INTEGRACAO' | 'EPI' | 'SST';
  titulo: string;
  subtitulo: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  rota: string | null;
  referenciaId: number | null;
};
