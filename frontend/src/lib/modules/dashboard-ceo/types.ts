export type DashboardCeoResumoDTO = {
  contratosAtivos: number;
  contratosAguardandoConfirmacao: number;
  obrasAtivas: number;
  obrasParalisadas: number;
  medicoesPendentes: number;
  solicitacoesUrgentes: number;
  funcionariosAtivos: number;
  presencasPendentesRh: number;
  horasExtrasPendentes: number;
  ncsCriticasAbertas: number;
  catsPendentes: number;
  treinamentosVencidos: number;
};

export type DashboardCeoFinanceiroDTO = {
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
  saldoContrato: number;
};

export type DashboardCeoAlertaDTO = {
  tipo: string;
  titulo: string;
  subtitulo: string;
  referenciaId?: number | null;
  rota?: string | null;
};

