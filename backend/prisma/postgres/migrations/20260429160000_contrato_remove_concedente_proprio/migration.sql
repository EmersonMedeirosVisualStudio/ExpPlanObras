UPDATE "Contrato"
SET "valorTotalInicial" = COALESCE(
  "valorTotalInicial",
  CASE
    WHEN "valorConcedenteInicial" IS NOT NULL OR "valorProprioInicial" IS NOT NULL
      THEN COALESCE("valorConcedenteInicial", 0) + COALESCE("valorProprioInicial", 0)
    ELSE NULL
  END
);

UPDATE "Contrato"
SET "valorTotalAtual" = COALESCE(
  "valorTotalAtual",
  CASE
    WHEN "valorConcedenteAtual" IS NOT NULL OR "valorProprioAtual" IS NOT NULL
      THEN COALESCE("valorConcedenteAtual", 0) + COALESCE("valorProprioAtual", 0)
    WHEN "valorConcedenteInicial" IS NOT NULL OR "valorProprioInicial" IS NOT NULL
      THEN COALESCE("valorConcedenteInicial", 0) + COALESCE("valorProprioInicial", 0)
    ELSE NULL
  END,
  "valorTotalInicial"
);

UPDATE "ContratoAditivo"
SET "valorTotalAdicionado" = CASE
  WHEN "snapshotValorTotalAtual" IS NOT NULL
    THEN "snapshotValorTotalAtual" + COALESCE("valorConcedenteAdicionado", 0) + COALESCE("valorProprioAdicionado", 0)
  ELSE COALESCE("valorConcedenteAdicionado", 0) + COALESCE("valorProprioAdicionado", 0)
END
WHERE ("tipo" = 'VALOR' OR "tipo" = 'AMBOS')
  AND "valorTotalAdicionado" IS NULL
  AND ("valorConcedenteAdicionado" IS NOT NULL OR "valorProprioAdicionado" IS NOT NULL);

ALTER TABLE "Contrato" DROP COLUMN "valorConcedenteInicial";
ALTER TABLE "Contrato" DROP COLUMN "valorProprioInicial";
ALTER TABLE "Contrato" DROP COLUMN "valorConcedenteAtual";
ALTER TABLE "Contrato" DROP COLUMN "valorProprioAtual";

ALTER TABLE "ContratoAditivo" DROP COLUMN "valorConcedenteAdicionado";
ALTER TABLE "ContratoAditivo" DROP COLUMN "valorProprioAdicionado";
ALTER TABLE "ContratoAditivo" DROP COLUMN "snapshotValorConcedenteAtual";
ALTER TABLE "ContratoAditivo" DROP COLUMN "snapshotValorProprioAtual";
