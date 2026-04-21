ALTER TABLE "Contrato" ADD COLUMN "contratoPrincipalId" INTEGER;

CREATE INDEX "Contrato_contratoPrincipalId_idx" ON "Contrato"("contratoPrincipalId");

ALTER TABLE "Contrato"
ADD CONSTRAINT "Contrato_contratoPrincipalId_fkey"
FOREIGN KEY ("contratoPrincipalId") REFERENCES "Contrato"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ContratoMedicao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContratoMedicao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContratoPagamento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "medicaoId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContratoPagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContratoMedicao_tenantId_idx" ON "ContratoMedicao"("tenantId");
CREATE INDEX "ContratoMedicao_contratoId_idx" ON "ContratoMedicao"("contratoId");
CREATE INDEX "ContratoMedicao_tenantId_contratoId_date_idx" ON "ContratoMedicao"("tenantId", "contratoId", "date");
CREATE INDEX "ContratoMedicao_tenantId_status_idx" ON "ContratoMedicao"("tenantId", "status");

CREATE INDEX "ContratoPagamento_tenantId_idx" ON "ContratoPagamento"("tenantId");
CREATE INDEX "ContratoPagamento_contratoId_idx" ON "ContratoPagamento"("contratoId");
CREATE INDEX "ContratoPagamento_medicaoId_idx" ON "ContratoPagamento"("medicaoId");
CREATE INDEX "ContratoPagamento_tenantId_contratoId_date_idx" ON "ContratoPagamento"("tenantId", "contratoId", "date");

ALTER TABLE "ContratoMedicao" ADD CONSTRAINT "ContratoMedicao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoMedicao" ADD CONSTRAINT "ContratoMedicao_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoPagamento" ADD CONSTRAINT "ContratoPagamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoPagamento" ADD CONSTRAINT "ContratoPagamento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoPagamento" ADD CONSTRAINT "ContratoPagamento_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "ContratoMedicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

