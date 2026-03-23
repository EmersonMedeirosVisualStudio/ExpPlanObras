export type SstNcDTO = {
  id: number;
  codigoNc: string | null;
  tipoLocal: string;
  idObra: number | null;
  idUnidade: number | null;
  origemTipo: string;
  titulo: string;
  descricao: string;
  severidade: string;
  riscoPotencial: string | null;
  statusNc: string;
  exigeInterdicao: boolean;
  interdicaoAplicada: boolean;
  envolveTerceirizada: boolean;
  idEmpresaParceira: number | null;
  dataIdentificacao: string;
  prazoCorrecao: string | null;
  observacao: string | null;
};

export type SstNcAcaoDTO = {
  id: number;
  idNc: number;
  ordemAcao: number;
  descricaoAcao: string;
  tipoResponsavel: string;
  idResponsavelFuncionario: number | null;
  idEmpresaParceira: number | null;
  idTerceirizadoTrabalhador: number | null;
  prazoAcao: string | null;
  statusAcao: string;
  dataConclusao: string | null;
  observacaoExecucao: string | null;
};

export type SstNcDetalheDTO = SstNcDTO & { acoes: SstNcAcaoDTO[] };

