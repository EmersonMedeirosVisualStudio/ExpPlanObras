export type AutomacaoRecorrencia = 'DIARIA' | 'SEMANAL' | 'MENSAL';
export type AutomacaoTaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'ATRASADA' | 'CANCELADA';
export type AutomacaoOcorrenciaStatus = 'ABERTA' | 'ALERTADA' | 'ESCALADA' | 'RESOLVIDA' | 'CANCELADA';
export type AutomacaoExecucaoStatus = 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'PARCIAL' | 'ERRO';

export type TarefaRecorrenteModeloDTO = {
  id: number;
  nome: string;
  modulo: string;
  tipoLocal: 'OBRA' | 'UNIDADE' | 'DIRETORIA' | 'EMPRESA' | null;
  idObra: number | null;
  idUnidade: number | null;
  idDiretoria: number | null;
  recorrencia: AutomacaoRecorrencia;
  horarioExecucao: string;
  timezone: string;
  diaSemana: number | null;
  diaMes: number | null;
  tituloTarefa: string;
  descricaoTarefa: string | null;
  responsavelTipo: 'USUARIO' | 'PERMISSAO' | 'GESTOR_LOCAL';
  idUsuarioResponsavel: number | null;
  permissaoResponsavel: string | null;
  geraNotificacao: boolean;
  geraEmail: boolean;
  ativo: boolean;
  proximaExecucaoEm: string | null;
  ultimaExecucaoEm: string | null;
};

export type TarefaRecorrenteModeloSaveDTO = Omit<
  TarefaRecorrenteModeloDTO,
  'id' | 'proximaExecucaoEm' | 'ultimaExecucaoEm'
>;

export type TarefaInstanciaDTO = {
  id: number;
  idModelo: number;
  referenciaPeriodo: string;
  tituloTarefa: string;
  descricaoTarefa: string | null;
  status: AutomacaoTaskStatus;
  previstaPara: string;
  idUsuarioAtribuido: number | null;
  atribuidaEm: string | null;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  concluidaPorUsuario: number | null;
  origemEntidadeTipo: string | null;
  origemEntidadeId: number | null;
};

export type SlaPoliticaDTO = {
  id: number;
  nome: string;
  modulo: string;
  chavePendencia: string;
  entidadeTipo: string;
  prazoMinutos: number;
  alertaAntesMinutos: number;
  escalonarAposMinutos: number | null;
  maxEscalacoes: number;
  criaTarefaQuandoVencer: boolean;
  notificarNoApp: boolean;
  enviarEmail: boolean;
  ativo: boolean;
};

export type SlaPoliticaSaveDTO = Omit<SlaPoliticaDTO, 'id'>;

export type PendenciaOcorrenciaDTO = {
  id: number;
  idPolitica: number;
  modulo: string;
  chavePendencia: string;
  entidadeTipo: string;
  entidadeId: number;
  titulo: string;
  descricao: string | null;
  status: AutomacaoOcorrenciaStatus;
  severidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  referenciaData: string | null;
  vencimentoEm: string;
  totalAlertas: number;
  totalEscalacoes: number;
  idUsuarioResponsavelAtual: number | null;
  rota: string | null;
};

export type AutomacaoExecucaoDTO = {
  id: number;
  tipoExecucao: 'TAREFAS' | 'SLA' | 'COBRANCA' | 'CLEANUP';
  status: AutomacaoExecucaoStatus;
  execucaoManual: boolean;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  totalProcessado: number;
  totalCriado: number;
  totalNotificado: number;
  totalEscalado: number;
  mensagemResultado: string | null;
  criadoEm: string;
};

export type PendenciaSignal = {
  modulo: string;
  chavePendencia: string;
  entidadeTipo: string;
  entidadeId: number;
  titulo: string;
  descricao?: string | null;
  severidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  referenciaData?: string | null;
  vencimentoEm: string;
  rota?: string | null;
  responsavelUserId?: number | null;
  metadata?: Record<string, unknown>;
};

