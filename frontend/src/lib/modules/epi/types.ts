export type TipoDestinatario = 'FUNCIONARIO' | 'TERCEIRIZADO';
export type TipoLocal = 'OBRA' | 'UNIDADE';
export type StatusFichaEpi = 'EM_PREENCHIMENTO' | 'ATIVA' | 'ENCERRADA' | 'CANCELADA';
export type StatusItemEpi = 'ENTREGUE' | 'DEVOLVIDO' | 'SUBSTITUIDO' | 'EXTRAVIADO' | 'DANIFICADO' | 'DESCARTADO';
export type ResultadoInspecao = 'APROVADO' | 'REPROVADO';

export type EpiCatalogoDTO = {
  id: number;
  codigo: string | null;
  nomeEpi: string;
  categoriaEpi: string;
  caNumero: string | null;
  caValidade: string | null;
  fabricante: string | null;
  tamanhoControlado: boolean;
  vidaUtilDias: number | null;
  periodicidadeInspecaoDias: number | null;
  ativo: boolean;
};

export type EpiFichaResumoDTO = {
  id: number;
  tipoDestinatario: TipoDestinatario;
  idFuncionario: number | null;
  idTerceirizadoTrabalhador: number | null;
  destinatarioNome: string | null;
  tipoLocal: TipoLocal;
  idObra: number | null;
  idUnidade: number | null;
  statusFicha: StatusFichaEpi;
  dataEmissao: string;
  observacao: string | null;
};

export type EpiFichaItemDTO = {
  id: number;
  idEpi: number;
  nomeEpi: string;
  categoriaEpi: string;
  caNumero: string | null;
  caValidade: string | null;
  quantidadeEntregue: number;
  tamanho: string | null;
  dataEntrega: string;
  dataPrevistaTroca: string | null;
  statusItem: StatusItemEpi;
  dataDevolucao: string | null;
  quantidadeDevolvida: number | null;
  condicaoDevolucao: string | null;
  higienizado: boolean;
  motivoMovimentacao: string | null;
  idAssinaturaEntrega: number | null;
  idAssinaturaDevolucao: number | null;
  observacao: string | null;
};

export type EpiFichaDetalheDTO = EpiFichaResumoDTO & {
  entregaOrientada: boolean;
  assinaturaDestinatarioObrigatoria: boolean;
  idAssinaturaDestinatario: number | null;
  itens: EpiFichaItemDTO[];
};

