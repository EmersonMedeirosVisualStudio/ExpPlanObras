ALTER TABLE "Contrato"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "objeto" TEXT,
  ADD COLUMN "tipoContratante" TEXT NOT NULL DEFAULT 'PRIVADO',
  ADD COLUMN "empresaParceiraNome" TEXT,
  ADD COLUMN "empresaParceiraDocumento" TEXT,
  ADD COLUMN "dataAssinatura" TIMESTAMP(3),
  ADD COLUMN "dataOS" TIMESTAMP(3),
  ADD COLUMN "prazoDias" INTEGER,
  ADD COLUMN "vigenciaInicial" TIMESTAMP(3),
  ADD COLUMN "vigenciaAtual" TIMESTAMP(3),
  ADD COLUMN "valorConcedenteInicial" DECIMAL,
  ADD COLUMN "valorProprioInicial" DECIMAL,
  ADD COLUMN "valorTotalInicial" DECIMAL,
  ADD COLUMN "valorConcedenteAtual" DECIMAL,
  ADD COLUMN "valorProprioAtual" DECIMAL,
  ADD COLUMN "valorTotalAtual" DECIMAL;

UPDATE "Contrato"
SET
  "nome" = COALESCE("nome", "descricao"),
  "dataAssinatura" = COALESCE("dataAssinatura", "dataInicio"),
  "dataOS" = COALESCE("dataOS", NULL),
  "prazoDias" = COALESCE(
    "prazoDias",
    CASE
      WHEN "dataInicio" IS NOT NULL AND "dataFim" IS NOT NULL THEN GREATEST(1, CAST(("dataFim"::date - "dataInicio"::date) AS INTEGER))
      ELSE NULL
    END
  ),
  "vigenciaInicial" = COALESCE("vigenciaInicial", "dataFim"),
  "vigenciaAtual" = COALESCE("vigenciaAtual", "dataFim"),
  "valorTotalInicial" = COALESCE("valorTotalInicial", "valorContratado"),
  "valorTotalAtual" = COALESCE("valorTotalAtual", "valorContratado");

CREATE INDEX "Contrato_tenantId_tipoContratante_idx" ON "Contrato"("tenantId", "tipoContratante");

