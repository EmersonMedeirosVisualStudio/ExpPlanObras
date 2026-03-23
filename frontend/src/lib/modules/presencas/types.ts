export type TipoLocalPresenca = 'OBRA' | 'UNIDADE';

export type StatusPresenca = 'EM_PREENCHIMENTO' | 'FECHADA' | 'ENVIADA_RH' | 'RECEBIDA_RH' | 'REJEITADA_RH';

export type SituacaoPresenca = 'PRESENTE' | 'FALTA' | 'ATESTADO' | 'FOLGA' | 'FERIAS' | 'AFASTADO';

export type PresencaCabecalhoDTO = {
  id: number;
  tipoLocal: TipoLocalPresenca;
  idObra: number | null;
  idUnidade: number | null;
  dataReferencia: string;
  turno: string;
  statusPresenca: StatusPresenca;
  idSupervisorLancamento: number;
  observacao: string | null;
  motivoRejeicaoRh?: string | null;
};

export type PresencaItemDTO = {
  id: number;
  idFuncionario: number;
  funcionarioNome: string;
  situacaoPresenca: SituacaoPresenca;
  horaEntrada: string | null;
  horaSaida: string | null;
  minutosAtraso: number;
  minutosHoraExtra: number;
  idTarefaPlanejamento: number | null;
  idSubitemOrcamentario: number | null;
  descricaoTarefaDia: string | null;
  requerAssinaturaFuncionario: boolean;
  assinadoFuncionario: boolean;
  motivoSemAssinatura: string | null;
  observacao: string | null;
};

export type PresencaDetalheDTO = PresencaCabecalhoDTO & { itens: PresencaItemDTO[] };
