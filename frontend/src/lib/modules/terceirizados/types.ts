export type TerceirizadoResumoDTO = {
  id: number;
  nomeCompleto: string;
  cpf?: string | null;
  funcao?: string | null;
  ativo: boolean;
  idEmpresaParceira: number;
  empresaParceira: string;
  tipoLocal?: 'OBRA' | 'UNIDADE' | null;
  idObra?: number | null;
  idUnidade?: number | null;
  localNome?: string | null;
  contratoId?: number | null;
  contratoNumero?: string | null;
};
