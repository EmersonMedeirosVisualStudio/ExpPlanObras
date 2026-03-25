export type WorkflowEntityScope = {
  tipoLocal?: 'OBRA' | 'UNIDADE' | null;
  idObra?: number | null;
  idUnidade?: number | null;
  idDiretoria?: number | null;
};

export type WorkflowEntityHandler = {
  entidadeTipo: string;
  obterTitulo: (tenantId: number, entidadeId: number) => Promise<string>;
  obterContexto: (tenantId: number, entidadeId: number) => Promise<Record<string, unknown>>;
  obterScope?: (tenantId: number, entidadeId: number) => Promise<WorkflowEntityScope>;
  validarPodeIniciar: (tenantId: number, entidadeId: number, userId: number) => Promise<void>;
  validarTransicao?: (args: {
    tenantId: number;
    entidadeId: number;
    chaveTransicao: string;
    formulario?: Record<string, unknown>;
    userId: number;
  }) => Promise<void>;
  aplicarEstadoNaEntidade?: (args: { tenantId: number; entidadeId: number; chaveEstado: string; userId: number }) => Promise<void>;
  rotaDetalhe?: (entidadeId: number) => string;
};

