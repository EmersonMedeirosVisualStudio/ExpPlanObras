export type SetorDTO = {
  id: number;
  nomeSetor: string;
  tipoSetor: string | null;
  idSetorPai: number | null;
  ativo: boolean;
};

export type CargoDTO = {
  id: number;
  nomeCargo: string;
  ativo: boolean;
};

export type PosicaoDTO = {
  id: number;
  idSetor: number;
  idCargo: number;
  tituloExibicao: string;
  ordemExibicao: number;
  ativo: boolean;
  setorNome?: string;
  cargoNome?: string;
};

export type VinculoDTO = {
  id: number;
  idPosicaoSuperior: number;
  idPosicaoSubordinada: number;
};

export type OcupacaoDTO = {
  id: number;
  idFuncionario: number;
  idPosicao: number;
  funcionarioNome: string;
  dataInicio: string;
  dataFim: string | null;
  vigente: boolean;
};

export type OrganogramaEstruturaDTO = {
  setores: SetorDTO[];
  cargos: CargoDTO[];
  posicoes: PosicaoDTO[];
  vinculos: VinculoDTO[];
  ocupacoes: OcupacaoDTO[];
};

export type FuncionarioSelectDTO = {
  id: number;
  nome: string;
  cargo?: string | null;
};
