ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "valorAtual" DECIMAL;

UPDATE "Obra"
SET "valorAtual" = COALESCE("valorPrevisto", 0)
WHERE "valorAtual" IS NULL;
