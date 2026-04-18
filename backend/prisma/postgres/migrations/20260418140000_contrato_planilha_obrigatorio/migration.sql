CREATE TABLE "Contrato" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "valorContratado" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contrato_tenantId_numeroContrato_key" ON "Contrato"("tenantId", "numeroContrato");
CREATE INDEX "Contrato_tenantId_idx" ON "Contrato"("tenantId");
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Obra" ADD COLUMN "contratoId" INTEGER;

INSERT INTO "Contrato" ("tenantId", "numeroContrato", "descricao", "status", "createdAt", "updatedAt")
SELECT
  t."id" AS "tenantId",
  'PENDENTE' AS "numeroContrato",
  'Contrato pendente de definição' AS "descricao",
  'PENDENTE' AS "status",
  CURRENT_TIMESTAMP AS "createdAt",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "Tenant" t
ON CONFLICT ("tenantId", "numeroContrato") DO NOTHING;

UPDATE "Obra" o
SET "contratoId" = c."id"
FROM "Contrato" c
WHERE c."tenantId" = o."tenantId" AND c."numeroContrato" = 'PENDENTE' AND o."contratoId" IS NULL;

ALTER TABLE "Obra" ALTER COLUMN "contratoId" SET NOT NULL;

CREATE INDEX "Obra_contratoId_idx" ON "Obra"("contratoId");
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ObraPlanilhaContratada" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "obraId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Planilha contratada',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ObraPlanilhaContratada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObraPlanilhaContratada_tenantId_obraId_key" ON "ObraPlanilhaContratada"("tenantId", "obraId");
CREATE INDEX "ObraPlanilhaContratada_tenantId_idx" ON "ObraPlanilhaContratada"("tenantId");
CREATE INDEX "ObraPlanilhaContratada_contratoId_idx" ON "ObraPlanilhaContratada"("contratoId");
CREATE INDEX "ObraPlanilhaContratada_obraId_idx" ON "ObraPlanilhaContratada"("obraId");

ALTER TABLE "ObraPlanilhaContratada" ADD CONSTRAINT "ObraPlanilhaContratada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObraPlanilhaContratada" ADD CONSTRAINT "ObraPlanilhaContratada_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObraPlanilhaContratada" ADD CONSTRAINT "ObraPlanilhaContratada_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ObraPlanilhaContratadaItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planilhaId" INTEGER NOT NULL,
    "codigoServico" TEXT NOT NULL,
    "descricao" TEXT,
    "unidade" TEXT,
    "quantidade" DECIMAL,
    "precoUnitario" DECIMAL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObraPlanilhaContratadaItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObraPlanilhaContratadaItem_planilhaId_codigoServico_key" ON "ObraPlanilhaContratadaItem"("planilhaId", "codigoServico");
CREATE INDEX "ObraPlanilhaContratadaItem_tenantId_idx" ON "ObraPlanilhaContratadaItem"("tenantId");
CREATE INDEX "ObraPlanilhaContratadaItem_planilhaId_idx" ON "ObraPlanilhaContratadaItem"("planilhaId");

ALTER TABLE "ObraPlanilhaContratadaItem" ADD CONSTRAINT "ObraPlanilhaContratadaItem_planilhaId_fkey" FOREIGN KEY ("planilhaId") REFERENCES "ObraPlanilhaContratada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
