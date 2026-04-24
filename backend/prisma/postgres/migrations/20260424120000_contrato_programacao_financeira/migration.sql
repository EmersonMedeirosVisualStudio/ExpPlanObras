CREATE TABLE "ContratoProgramacaoFinanceira" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "valorPrevisto" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContratoProgramacaoFinanceira_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContratoProgramacaoFinanceira_tenantId_contratoId_competencia_key" ON "ContratoProgramacaoFinanceira"("tenantId", "contratoId", "competencia");
CREATE INDEX "ContratoProgramacaoFinanceira_tenantId_idx" ON "ContratoProgramacaoFinanceira"("tenantId");
CREATE INDEX "ContratoProgramacaoFinanceira_contratoId_idx" ON "ContratoProgramacaoFinanceira"("contratoId");
CREATE INDEX "ContratoProgramacaoFinanceira_tenantId_contratoId_competencia_idx" ON "ContratoProgramacaoFinanceira"("tenantId", "contratoId", "competencia");

ALTER TABLE "ContratoProgramacaoFinanceira" ADD CONSTRAINT "ContratoProgramacaoFinanceira_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoProgramacaoFinanceira" ADD CONSTRAINT "ContratoProgramacaoFinanceira_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

