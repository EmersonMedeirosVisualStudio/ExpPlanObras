export type ApprovalEntityScope = {
  tipoLocal?: 'OBRA' | 'UNIDADE' | null;
  idObra?: number | null;
  idUnidade?: number | null;
  idDiretoria?: number | null;
};

export type ApprovalEntityHandler = {
  entidadeTipo: string;
  obterSnapshot: (tenantId: number, entidadeId: number) => Promise<Record<string, unknown>>;
  obterTitulo: (tenantId: number, entidadeId: number) => Promise<string>;
  obterDescricao?: (tenantId: number, entidadeId: number) => Promise<string | null>;
  obterValorReferencia?: (tenantId: number, entidadeId: number) => Promise<number | null>;
  obterScope?: (tenantId: number, entidadeId: number) => Promise<ApprovalEntityScope>;
  validarPodeSolicitar: (tenantId: number, entidadeId: number, userId: number) => Promise<void>;
  aplicarAprovacaoFinal: (tenantId: number, entidadeId: number, solicitacaoId: number) => Promise<void>;
  aplicarRejeicaoFinal?: (tenantId: number, entidadeId: number, solicitacaoId: number) => Promise<void>;
  rotaDetalhe?: (entidadeId: number) => string;
};

