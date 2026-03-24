export type NotificationEmailMode = 'NUNCA' | 'IMEDIATO' | 'DIGESTO_DIARIO' | 'DIGESTO_SEMANAL';

export type NotificationEmailTemplateKey = 'ALERTA_IMEDIATO' | 'DIGESTO_DIARIO' | 'DIGESTO_SEMANAL' | 'RELATORIO_AGENDADO';

export type NotificationEmailJobDTO = {
  id: number;
  templateKey: NotificationEmailTemplateKey;
  assunto: string;
  emailDestino: string;
  statusEnvio: 'PENDENTE' | 'PROCESSANDO' | 'ENVIADO' | 'ERRO' | 'CANCELADO';
  tentativas: number;
  proximaTentativaEm: string;
  enviadoEm: string | null;
  ultimoErro: string | null;
};

export type NotificationEmailPreferenceDTO = {
  modulo: string;
  recebeNoApp: boolean;
  recebeEmail: boolean;
  modoEmail: NotificationEmailMode;
  somenteCriticasEmail: boolean;
  horarioDigesto: string | null;
  timezone: string | null;
};

export type EmailTemplateBuildInput = {
  tenantId: number;
  usuario: { id: number; nome: string; email: string };
  notificacao: {
    idEvento: number | null;
    titulo: string;
    mensagem: string;
    severidade: string;
    rota: string | null;
    modulo: string;
    metadata?: Record<string, unknown>;
  };
  itensDigesto?: { titulo: string; mensagem: string; rota: string | null; modulo: string; severidade: string }[];
};

export type EmailTemplateBuildOutput = { assunto: string; html: string; text: string };
