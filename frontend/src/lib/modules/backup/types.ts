export type PeriodicidadeBackup = 'DIARIO' | 'SEMANAL';

export type DiaSemana = 'DOMINGO' | 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO';

export type StatusExecucaoBackup = 'EXECUTANDO' | 'SUCESSO' | 'ERRO' | 'CANCELADO';

export type StatusRestauracao = 'SOLICITADA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA';

export type PoliticaBackupDTO = {
  id?: number;
  periodicidade: PeriodicidadeBackup;
  horaExecucao: string;
  diaSemana: DiaSemana | null;
  retencaoDias: number;
  ativo: boolean;
};

export type ExecucaoBackupDTO = {
  id: number;
  dataHoraInicio: string;
  dataHoraFim: string | null;
  status: StatusExecucaoBackup;
  referenciaArquivo: string | null;
  hashArquivo: string | null;
  tamanhoMb: number | null;
  observacao: string | null;
};

export type SolicitacaoRestauracaoDTO = {
  id: number;
  pontoReferencia: string;
  motivo: string;
  status: StatusRestauracao;
  solicitadoEm: string;
};
