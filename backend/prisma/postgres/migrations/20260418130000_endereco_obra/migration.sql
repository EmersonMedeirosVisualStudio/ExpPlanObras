CREATE TABLE "EnderecoObra" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "obraId" INTEGER NOT NULL,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "origemEndereco" TEXT NOT NULL DEFAULT 'MANUAL',
    "origemCoordenada" TEXT NOT NULL DEFAULT 'MANUAL',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnderecoObra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnderecoObra_obraId_key" ON "EnderecoObra"("obraId");
CREATE UNIQUE INDEX "EnderecoObra_tenantId_obraId_key" ON "EnderecoObra"("tenantId", "obraId");
CREATE INDEX "EnderecoObra_tenantId_idx" ON "EnderecoObra"("tenantId");

ALTER TABLE "EnderecoObra" ADD CONSTRAINT "EnderecoObra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnderecoObra" ADD CONSTRAINT "EnderecoObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EnderecoObra" ("tenantId", "obraId", "logradouro", "numero", "bairro", "cidade", "uf", "latitude", "longitude", "origemEndereco", "origemCoordenada", "criadoEm", "atualizadoEm")
SELECT
  "tenantId",
  "id" AS "obraId",
  "street" AS "logradouro",
  "number" AS "numero",
  "neighborhood" AS "bairro",
  "city" AS "cidade",
  "state" AS "uf",
  "latitude",
  "longitude",
  'MANUAL' AS "origemEndereco",
  'MANUAL' AS "origemCoordenada",
  "createdAt" AS "criadoEm",
  "updatedAt" AS "atualizadoEm"
FROM "Obra"
WHERE
  "street" IS NOT NULL OR
  "number" IS NOT NULL OR
  "neighborhood" IS NOT NULL OR
  "city" IS NOT NULL OR
  "state" IS NOT NULL OR
  "latitude" IS NOT NULL OR
  "longitude" IS NOT NULL
ON CONFLICT ("obraId") DO NOTHING;

ALTER TABLE "Obra" DROP COLUMN IF EXISTS "street";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "number";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "neighborhood";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "city";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "state";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "Obra" DROP COLUMN IF EXISTS "longitude";

