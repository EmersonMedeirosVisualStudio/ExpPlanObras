export type NotificationStatusLeitura = 'NAO_LIDA' | 'LIDA';

export type NotificacaoDTO = {
  id: number;
  modulo: string;
  severidade: string;
  titulo: string;
  mensagem: string;
  rota: string | null;
  entidadeTipo: string | null;
  entidadeId: number | null;
  criadaEm: string;
  lida: boolean;
};

export type NotificacaoPreferenciaDTO = {
  modulo: string;
  recebeNoApp: boolean;
  recebeEmail: boolean;
  modoEmail?: 'NUNCA' | 'IMEDIATO' | 'DIGESTO_DIARIO' | 'DIGESTO_SEMANAL';
  somenteCriticasEmail: boolean;
  horarioDigesto?: string | null;
  timezone?: string | null;
  ativo: boolean;
};

export type NotificacaoPreferenciaSaveDTO = NotificacaoPreferenciaDTO;
