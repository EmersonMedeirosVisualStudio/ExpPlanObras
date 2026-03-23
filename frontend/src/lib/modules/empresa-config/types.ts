export type RepresentanteEmpresaDTO = {
  id: number;
  idFuncionario?: number | null;
  nome: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  dataInicio: string;
};

export type EncarregadoSistemaDTO = {
  id: number;
  idFuncionario: number;
  nome: string;
  idUsuario?: number | null;
  usuario?: string | null;
  dataInicio: string;
  ativo: boolean;
  solicitouSaida: boolean;
  dataSolicitacaoSaida?: string | null;
  motivoSolicitacaoSaida?: string | null;
};

export type ConfiguracaoEmpresaDTO = {
  representante: RepresentanteEmpresaDTO | null;
  encarregadoSistema: EncarregadoSistemaDTO | null;
};

export type FuncionarioSelectDTO = {
  id: number;
  nome: string;
  cargo?: string | null;
};
