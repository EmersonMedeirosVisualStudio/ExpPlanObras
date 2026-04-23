ALTER TABLE "Contrato" ADD COLUMN "tipoPapel" TEXT NOT NULL DEFAULT 'CONTRATADO';

UPDATE "Contrato" SET "tipoPapel" = 'CONTRATANTE' WHERE "contratoPrincipalId" IS NOT NULL;

CREATE INDEX "Contrato_tenantId_tipoPapel_idx" ON "Contrato"("tenantId", "tipoPapel");
