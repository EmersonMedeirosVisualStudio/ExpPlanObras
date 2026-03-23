export type SstProfissionalDTO = {
  id: number;
  idFuncionario: number;
  funcionarioNome: string;
  tipoProfissional: string;
  registroNumero: string | null;
  registroUf: string | null;
  conselhoSigla: string | null;
  ativo: boolean;
};

export type SstChecklistModeloDTO = {
  id: number;
  codigo: string | null;
  nomeModelo: string;
  tipoLocalPermitido: string;
  periodicidade: string;
  abrangeTerceirizados: boolean;
  exigeAssinaturaExecutor: boolean;
  exigeCienciaResponsavel: boolean;
  ativo: boolean;
};

export type SstChecklistExecucaoDTO = {
  id: number;
  idModeloChecklist: number;
  nomeModelo: string;
  tipoLocal: string;
  idObra: number | null;
  idUnidade: number | null;
  dataReferencia: string;
  statusExecucao: string;
  executorNome: string;
  abrangeTerceirizados: boolean;
};

export type SstChecklistExecucaoItemDTO = {
  idModeloItem: number;
  ordemItem: number;
  grupoItem: string | null;
  descricaoItem: string;
  tipoResposta: string;
  obrigatorio: boolean;
  geraNcQuandoReprovado: boolean;
  respostaValor: string | null;
  conformeFlag: number | null;
  observacao: string | null;
  geraNc: boolean;
};

export type SstChecklistExecucaoDetalheDTO = {
  id: number;
  idModeloChecklist: number;
  nomeModelo: string;
  tipoLocal: string;
  idObra: number | null;
  idUnidade: number | null;
  dataReferencia: string;
  statusExecucao: string;
  abrangeTerceirizados: boolean;
  executorNome: string;
  exigeAssinaturaExecutor: boolean;
  exigeCienciaResponsavel: boolean;
  idAssinaturaExecutor: number | null;
  observacao: string | null;
  itens: SstChecklistExecucaoItemDTO[];
};

