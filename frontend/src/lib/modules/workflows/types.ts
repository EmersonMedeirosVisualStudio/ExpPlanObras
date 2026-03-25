export type WorkflowTipoEstado = 'INICIAL' | 'INTERMEDIARIO' | 'FINAL_SUCESSO' | 'FINAL_ERRO' | 'CANCELADO';

export type WorkflowStatusInstancia = 'ATIVA' | 'CONCLUIDA' | 'CANCELADA' | 'EXPIRADA' | 'ERRO';

export type WorkflowTipoExecutor = 'SOLICITANTE' | 'RESPONSAVEL_ATUAL' | 'USUARIO' | 'PERMISSAO' | 'GESTOR_LOCAL' | 'APROVADOR';

export type WorkflowTipoCampo = 'TEXTO' | 'TEXTO_LONGO' | 'NUMERO' | 'DATA' | 'BOOLEAN' | 'SELECT' | 'JSON';

export type WorkflowTipoAcao =
  | 'NOTIFICAR'
  | 'EMAIL'
  | 'REALTIME'
  | 'CRIAR_APROVACAO'
  | 'CRIAR_TAREFA'
  | 'CHAMAR_HANDLER'
  | 'ATUALIZAR_CAMPO_ENTIDADE';

export type WorkflowModeloDTO = {
  id: number;
  codigo: string;
  nome: string;
  entidadeTipo: string;
  descricaoModelo: string | null;
  ativo: boolean;
  versao: number;
  permiteMultiplasInstancias: boolean;
  iniciaAutomaticamente: boolean;
};

export type WorkflowEstadoDTO = {
  id: number;
  chaveEstado: string;
  nomeEstado: string;
  tipoEstado: WorkflowTipoEstado;
  corHex: string | null;
  ordemExibicao: number;
  editavelEntidade: boolean;
  bloqueiaEntidade: boolean;
  exigeResponsavel: boolean;
  slaHoras: number | null;
  ativo: boolean;
};

export type WorkflowTransicaoCampoDTO = {
  id: number;
  chaveCampo: string;
  labelCampo: string;
  tipoCampo: WorkflowTipoCampo;
  obrigatorio: boolean;
  ordemExibicao: number;
  opcoes: unknown;
  validacao: unknown;
  valorPadrao: unknown;
  ativo: boolean;
};

export type WorkflowTransicaoAcaoDTO = {
  id: number;
  ordemExecucao: number;
  tipoAcao: WorkflowTipoAcao;
  configuracao: unknown;
  ativo: boolean;
};

export type WorkflowTransicaoDTO = {
  id: number;
  chaveTransicao: string;
  nomeTransicao: string;
  estadoOrigemId: number;
  estadoDestinoId: number;
  tipoExecutor: WorkflowTipoExecutor;
  idUsuarioExecutor: number | null;
  permissaoExecutor: string | null;
  exigeParecer: boolean;
  exigeAssinatura: boolean;
  visivelNoUi: boolean;
  permiteEmLote: boolean;
  condicao: unknown;
  ativo: boolean;
  campos: WorkflowTransicaoCampoDTO[];
  acoes: WorkflowTransicaoAcaoDTO[];
};

export type WorkflowInstanciaDTO = {
  id: number;
  entidadeTipo: string;
  entidadeId: number;
  tituloInstancia: string;
  statusInstancia: WorkflowStatusInstancia;
  chaveEstadoAtual: string;
  idUsuarioResponsavelAtual: number | null;
  vencimentoEtapaEm: string | null;
  iniciadoEm: string;
  finalizadoEm: string | null;
};

export type WorkflowHistoricoDTO = {
  id: number;
  chaveEstadoAnterior: string | null;
  chaveEstadoNovo: string;
  acaoExecutada: string | null;
  parecer: string | null;
  idUsuarioEvento: number | null;
  idAssinaturaRegistro: number | null;
  criadoEm: string;
};

export type WorkflowTarefaDTO = {
  id: number;
  tipoTarefa: 'ACAO_MANUAL' | 'APROVACAO' | 'CONFERENCIA' | 'AJUSTE';
  tituloTarefa: string;
  descricaoTarefa: string | null;
  idUsuarioResponsavel: number | null;
  statusTarefa: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA';
  prazoEm: string | null;
  concluidaEm: string | null;
  criadoEm: string;
};

export type WorkflowAcaoExecuteDTO = {
  chaveTransicao: string;
  parecer?: string | null;
  formulario?: Record<string, unknown>;
  assinatura?: { tipo: 'PIN' | 'ASSINATURA_TELA'; pin?: string };
};

export type WorkflowModeloSaveDTO = {
  codigo: string;
  nome: string;
  entidadeTipo: string;
  descricaoModelo?: string | null;
  ativo: boolean;
  permiteMultiplasInstancias: boolean;
  iniciaAutomaticamente: boolean;
  estados: Array<{
    chaveEstado: string;
    nomeEstado: string;
    tipoEstado: WorkflowTipoEstado;
    corHex?: string | null;
    ordemExibicao?: number;
    editavelEntidade?: boolean;
    bloqueiaEntidade?: boolean;
    exigeResponsavel?: boolean;
    slaHoras?: number | null;
    ativo?: boolean;
  }>;
  transicoes: Array<{
    chaveTransicao: string;
    nomeTransicao: string;
    estadoOrigemChave: string;
    estadoDestinoChave: string;
    tipoExecutor: WorkflowTipoExecutor;
    idUsuarioExecutor?: number | null;
    permissaoExecutor?: string | null;
    exigeParecer?: boolean;
    exigeAssinatura?: boolean;
    visivelNoUi?: boolean;
    permiteEmLote?: boolean;
    condicao?: unknown;
    ativo?: boolean;
    campos?: Array<{
      chaveCampo: string;
      labelCampo: string;
      tipoCampo: WorkflowTipoCampo;
      obrigatorio?: boolean;
      ordemExibicao?: number;
      opcoes?: unknown;
      validacao?: unknown;
      valorPadrao?: unknown;
      ativo?: boolean;
    }>;
    acoes?: Array<{
      ordemExecucao?: number;
      tipoAcao: WorkflowTipoAcao;
      configuracao?: unknown;
      ativo?: boolean;
    }>;
  }>;
};

export type WorkflowInstanciaDetalheDTO = {
  instancia: WorkflowInstanciaDTO;
  modelo: WorkflowModeloDTO;
  estados: WorkflowEstadoDTO[];
  transicoes: WorkflowTransicaoDTO[];
  historico: WorkflowHistoricoDTO[];
  tarefas: WorkflowTarefaDTO[];
  contexto?: Record<string, unknown> | null;
};

export type WorkflowTransicaoDisponivelDTO = {
  chaveTransicao: string;
  nomeTransicao: string;
  exigeParecer: boolean;
  exigeAssinatura: boolean;
  campos: WorkflowTransicaoCampoDTO[];
};

