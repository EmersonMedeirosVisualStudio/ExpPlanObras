export type EmpresaParceiraDTO = {
  id: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  emailPrincipal: string | null;
  telefonePrincipal: string | null;
  statusEmpresa: 'ATIVA' | 'BLOQUEADA' | 'INATIVA';
};

export type ParceiroUsuarioDTO = {
  idUsuario: number;
  nome: string;
  email: string;
  papelExterno: 'GESTOR_EMPRESA' | 'RH_EMPRESA' | 'SST_EMPRESA' | 'DOCUMENTOS_EMPRESA';
  principal: boolean;
  ativo: boolean;
};

export type ParceiroRequisitoDocumentalDTO = {
  id: number;
  tipoDestinatario: 'EMPRESA' | 'TRABALHADOR';
  categoriaDocumento: string;
  tituloRequisito: string;
  tipoLocal: 'OBRA' | 'UNIDADE' | null;
  idObra: number | null;
  idUnidade: number | null;
  validadeDias: number | null;
  obrigatorio: boolean;
};

export type ParceiroEntregaDocumentoDTO = {
  id: number;
  idRequisito: number;
  idDocumentoRegistro: number;
  idTerceirizadoTrabalhador: number | null;
  statusEntrega: 'ENVIADO' | 'EM_ANALISE' | 'APROVADO' | 'REJEITADO' | 'VENCIDO' | 'SUBSTITUIDO';
  dataValidade: string | null;
  motivoRejeicao: string | null;
  enviadoEm: string;
  validadoEm: string | null;
};
