ALTER TABLE "EnderecoObra" ADD COLUMN IF NOT EXISTS "nomeEndereco" TEXT NOT NULL DEFAULT 'Principal';
ALTER TABLE "EnderecoObra" ADD COLUMN IF NOT EXISTS "principal" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS "EnderecoObra_obraId_key";
DROP INDEX IF EXISTS "EnderecoObra_tenantId_obraId_key";

UPDATE "EnderecoObra"
SET "principal" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("obraId") "id"
  FROM "EnderecoObra"
  ORDER BY "obraId", "id"
);

CREATE INDEX IF NOT EXISTS "EnderecoObra_tenantId_obraId_idx" ON "EnderecoObra"("tenantId", "obraId");
CREATE INDEX IF NOT EXISTS "EnderecoObra_tenantId_obraId_principal_idx" ON "EnderecoObra"("tenantId", "obraId", "principal");
CREATE UNIQUE INDEX IF NOT EXISTS "EnderecoObra_obraId_principal_key" ON "EnderecoObra"("obraId") WHERE "principal" = true;
