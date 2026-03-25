export type DocumentoStatus = 'RASCUNHO' | 'ATIVO' | 'EM_ASSINATURA' | 'ASSINADO' | 'CANCELADO' | 'INVALIDADO';

export type DocumentoVersaoStatus = 'ATIVA' | 'EM_ASSINATURA' | 'ASSINADA' | 'SUBSTITUIDA' | 'INVALIDADA';

export type DocumentoFluxoStatus = 'PENDENTE' | 'DISPONIVEL' | 'ASSINADO' | 'REJEITADO' | 'EXPIRADO' | 'IGNORADO';

export type DocumentoDecisaoTipo = 'ASSINAR' | 'APROVAR' | 'CIENTE' | 'REJEITAR';

export type DocumentoRegistroDTO = {
  id: number;
  entidadeTipo: string | null;
  entidadeId: number | null;
  categoriaDocumento: string;
  tituloDocumento: string;
  descricaoDocumento: string | null;
  statusDocumento: DocumentoStatus;
  idVersaoAtual: number | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type DocumentoVersaoDTO = {
  id: number;
  idDocumentoRegistro: number;
  numeroVersao: number;
  nomeArquivoOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  hashSha256Original: string;
  hashSha256PdfCarimbado: string | null;
  statusVersao: DocumentoVersaoStatus;
  finalizadaEm: string | null;
  criadoEm: string;
};

export type DocumentoFluxoAssinaturaDTO = {
  id: number;
  ordemAssinatura: number;
  papelSignatario: string;
  tipoSignatario: 'USUARIO' | 'PERMISSAO';
  idUsuarioSignatario: number | null;
  permissaoSignatario: string | null;
  assinaturaObrigatoria: boolean;
  parecerObrigatorio: boolean;
  statusFluxo: DocumentoFluxoStatus;
  vencimentoEm: string | null;
  decididoEm: string | null;
};

export type DocumentoAssinaturaDTO = {
  id: number;
  tipoDecisao: DocumentoDecisaoTipo;
  nomeExibicaoSignatario: string;
  papelSignatario: string;
  parecer: string | null;
  codigoVerificacao: string;
  criadoEm: string;
};

export type DocumentoHistoricoDTO = {
  id: number;
  tipoEvento: string;
  descricaoEvento: string;
  criadoEm: string;
};

export type DocumentoDetalheDTO = {
  documento: DocumentoRegistroDTO;
  versoes: DocumentoVersaoDTO[];
};

export type DocumentoVersaoDetalheDTO = {
  versao: DocumentoVersaoDTO;
  documento: DocumentoRegistroDTO;
  fluxo: DocumentoFluxoAssinaturaDTO[];
  assinaturas: DocumentoAssinaturaDTO[];
  historico: DocumentoHistoricoDTO[];
  verificacaoToken: string | null;
};

export type DocumentoVerificacaoDTO = {
  valido: boolean;
  tituloDocumento: string;
  numeroVersao: number;
  hashConferido: string | null;
  hashEsperado: string | null;
  assinado: boolean;
  signatarios: { nome: string; papel: string; dataHora: string; decisao: string; codigo: string }[];
};

export type DocumentoCriarDTO = {
  entidadeTipo?: string | null;
  entidadeId?: number | null;
  categoriaDocumento: string;
  tituloDocumento: string;
  descricaoDocumento?: string | null;
};

export type DocumentoNovaVersaoDTO = {
  nomeArquivoOriginal: string;
  mimeType: string;
  conteudoBase64: string;
};

export type DocumentoFluxoUpsertDTO = {
  itens: Array<{
    ordemAssinatura: number;
    papelSignatario: string;
    tipoSignatario: 'USUARIO' | 'PERMISSAO';
    idUsuarioSignatario: number | null;
    permissaoSignatario: string | null;
    assinaturaObrigatoria: boolean;
    parecerObrigatorio: boolean;
    vencimentoEm?: string | null;
  }>;
};

export type DocumentoAcaoDTO =
  | { acao: 'ENVIAR_ASSINATURA' }
  | { acao: 'GERAR_PDF_FINAL' }
  | { acao: 'ASSINAR' | 'APROVAR' | 'CIENTE' | 'REJEITAR'; parecer?: string | null; assinatura: { tipo: 'PIN'; pin: string } };

