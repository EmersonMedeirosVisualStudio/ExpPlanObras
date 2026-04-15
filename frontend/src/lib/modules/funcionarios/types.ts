export type FuncionarioResumoDTO = {
  id: number;
  matricula: string;
  nomeCompleto: string;
  cpf: string;
  cargoContratual: string | null;
  funcaoPrincipal: string | null;
  statusFuncional: string;
  statusCadastroRh: string;
  dataAdmissao: string;
  ativo: boolean;
};

export type FuncionarioLotacaoDTO = {
  id: number;
  tipoLotacao: 'OBRA' | 'UNIDADE';
  idObra: number | null;
  idUnidade: number | null;
  dataInicio: string;
  dataFim: string | null;
  atual: boolean;
  observacao: string | null;
};

export type FuncionarioSupervisaoDTO = {
  id: number;
  idSupervisorFuncionario: number;
  supervisorNome: string;
  dataInicio: string;
  dataFim: string | null;
  atual: boolean;
  observacao: string | null;
};

export type FuncionarioJornadaDTO = {
  id: number;
  tipoJornada: string;
  horasSemanais: number;
  horaEntrada: string | null;
  horaSaida: string | null;
  intervaloMinutos: number;
  bancoHorasAtivo: boolean;
  dataInicio: string;
  dataFim: string | null;
  atual: boolean;
  observacao: string | null;
};

export type FuncionarioHoraExtraDTO = {
  id: number;
  idFuncionario: number;
  dataReferencia: string;
  quantidadeMinutos: number;
  tipoHoraExtra: string;
  motivo: string | null;
  statusHe: string;
  idObra: number | null;
  idUnidade: number | null;
  observacao: string | null;
};

export type FuncionarioDetalheDTO = FuncionarioResumoDTO & {
  nomeSocial: string | null;
  rg: string | null;
  orgaoEmissorRg: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  estadoCivil: string | null;
  pisPasep: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  cnhNumero: string | null;
  cnhCategoria: string | null;
  cboCodigo: string | null;
  tipoVinculo: string;
  dataDesligamento: string | null;
  salarioBase: number | null;
  emailPessoal: string | null;
  telefonePrincipal: string | null;
  contatoEmergenciaNome: string | null;
  contatoEmergenciaTelefone: string | null;
  lotacoes: FuncionarioLotacaoDTO[];
  supervisoes: FuncionarioSupervisaoDTO[];
  jornadas: FuncionarioJornadaDTO[];
  horasExtras: FuncionarioHoraExtraDTO[];
};

export type FuncionarioHistoricoEventoDTO = {
  id: number;
  createdAt: string;
  entidade: string;
  idRegistro: string;
  acao: string;
  idUsuario: number | null;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
};

export type FuncionarioEventoDTO = {
  id: number;
  tipoEvento: string;
  dataEvento: string;
  descricao: string | null;
  valorAnterior: unknown;
  valorNovo: unknown;
  idDocumentoRegistro: number | null;
  idUsuarioCriador: number | null;
  createdAt: string;
};
