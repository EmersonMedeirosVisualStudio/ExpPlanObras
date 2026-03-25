export function shouldIncludeEtapaByValor(args: {
  aplicaAlcadaValor: boolean;
  valorReferencia: number | null;
  valorMinimo: number | null;
  valorMaximo: number | null;
}): boolean {
  if (!args.aplicaAlcadaValor) return true;
  if (args.valorReferencia === null) return true;
  if (args.valorMinimo !== null && args.valorReferencia < args.valorMinimo) return false;
  if (args.valorMaximo !== null && args.valorReferencia > args.valorMaximo) return false;
  return true;
}

