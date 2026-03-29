export type ImportPreviewErrorDTO = {
  linha: number;
  campo?: string | null;
  codigo: string;
  mensagem: string;
};

export type ImportPreviewResultDTO = {
  totalLinhas: number;
  validas: number;
  invalidas: number;
  erros: ImportPreviewErrorDTO[];
  avisos: ImportPreviewErrorDTO[];
};

export type ImportConfirmResultDTO = {
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
};

