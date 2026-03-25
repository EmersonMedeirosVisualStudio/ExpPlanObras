export type PortalGestorTipoLocal = 'OBRA' | 'UNIDADE';

export type PortalGestorResumoDTO = {
  tipoLocal: PortalGestorTipoLocal;
  localId: number;
  localNome: string;
  dataReferencia: string;
  equipePrevista: number;
  equipePresente: number;
  ausencias: number;
  atrasos: number;
  horasExtrasPendentes: number;
  checklistsPendentes: number;
  ncsCriticasAbertas: number;
  acidentesMes: number;
  solicitacoesUrgentes: number;
  aprovacoesPendentes: number;
};

export type PortalGestorEquipeItemDTO = {
  idFuncionario: number;
  nome: string;
  matricula: string | null;
  cargoNome: string | null;
  setorNome: string | null;
  situacaoPresenca: string | null;
  horaEntrada: string | null;
  horaSaida: string | null;
  assinaturaPendente: boolean;
  treinamentoVencido: boolean;
  epiPendente: boolean;
};

export type PortalGestorPendenciaDTO = {
  tipo: 'PRESENCA' | 'CHECKLIST' | 'NC' | 'ACIDENTE' | 'TREINAMENTO' | 'EPI' | 'SUPRIMENTOS' | 'APROVACAO' | 'WORKFLOW';
  titulo: string;
  subtitulo: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  referenciaId: number | null;
  rota: string | null;
  prazoEm: string | null;
};

export type PortalGestorAgendaDTO = {
  titulo: string;
  tipo: 'CHECKLIST' | 'TREINAMENTO' | 'MEDICAO' | 'TAREFA_RECORRENTE' | 'APROVACAO' | 'INSPECAO';
  horario: string | null;
  prazoEm: string | null;
  rota: string | null;
  status: string | null;
};

export type PortalGestorAtalhoDTO = {
  key: string;
  label: string;
  href: string;
  icon: string | null;
  enabled: boolean;
};

export type PortalGestorSstLocalDTO = {
  checklistsAtrasados: number;
  ncsAbertas: number;
  ncsCriticas: number;
  acidentes90d: number;
  treinamentosVencidos: number;
  episTrocaVencida: number;
};

export type PortalGestorSuprimentosDTO = {
  solicitacoesAbertas: number;
  solicitacoesUrgentes: number;
  entregasAtrasadas: number;
  itensAbaixoMinimo: number;
  ultimaMovimentacaoEm: string | null;
};

