export type TerceirizadoResumoDTO = {
  id: number;
  nomeCompleto: string;
  funcao?: string | null;
  ativo: boolean;
  idEmpresaParceira: number;
  empresaParceira: string;
};

