export type RelatorioAgendadoContexto = 'CEO' | 'DIRETOR' | 'GERENTE' | 'RH' | 'SST' | 'SUPRIMENTOS' | 'ENGENHARIA';

export type RelatorioAgendadoFormato = 'PDF' | 'XLSX' | 'AMBOS';

export type RelatorioAgendadoRecorrencia = 'DIARIO' | 'SEMANAL' | 'MENSAL';

export type RelatorioAgendadoStatus = 'ATIVO' | 'PAUSADO' | 'ERRO';

export type RelatorioAgendadoDTO = {
  id: number;
  nome: string;
  contexto: RelatorioAgendadoContexto;
  formato: RelatorioAgendadoFormato;
  recorrencia: RelatorioAgendadoRecorrencia;
  horarioExecucao: string;
  timezone: string;
  diaSemana: number | null;
  diaMes: number | null;
  filtros: Record<string, unknown> | null;
  widgets: string[] | null;
  ativo: boolean;
  status: RelatorioAgendadoStatus;
  proximaExecucaoEm: string | null;
  ultimaExecucaoEm: string | null;
  ultimaExecucaoStatus: string | null;
};

export type RelatorioAgendadoDestinatarioDTO = {
  id: number;
  tipo: 'USUARIO' | 'EMAIL';
  idUsuario: number | null;
  emailDestino: string | null;
  nomeDestinatario: string | null;
  ativo: boolean;
};

export type RelatorioAgendadoExecucaoDTO = {
  id: number;
  status: string;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  mensagemResultado: string | null;
  totalDestinatarios: number;
  totalEmailsEnfileirados: number;
  totalArquivos: number;
  execucaoManual: boolean;
  arquivos?: RelatorioAgendadoArquivoDTO[];
};

export type RelatorioAgendadoArquivoDTO = {
  id: number;
  formato: 'PDF' | 'XLSX';
  nomeArquivo: string;
  storagePath: string;
  tamanhoBytes: number | null;
};

export type RelatorioAgendadoSaveDTO = {
  nome: string;
  contexto: RelatorioAgendadoContexto;
  formato: RelatorioAgendadoFormato;
  recorrencia: RelatorioAgendadoRecorrencia;
  horarioExecucao: string;
  timezone: string;
  diaSemana?: number | null;
  diaMes?: number | null;
  filtros?: Record<string, unknown> | null;
  widgets?: string[] | null;
  destinatarios: { tipo: 'USUARIO' | 'EMAIL'; idUsuario?: number; emailDestino?: string; nomeDestinatario?: string }[];
  assuntoEmailTemplate?: string | null;
  corpoEmailTemplate?: string | null;
  ativo: boolean;
};
