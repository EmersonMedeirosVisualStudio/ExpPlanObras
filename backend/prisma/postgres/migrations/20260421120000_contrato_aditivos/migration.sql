CREATE TABLE "ContratoAditivo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "numeroAditivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PRAZO',
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "dataAssinatura" TIMESTAMP(3),
    "justificativa" TEXT,
    "descricao" TEXT,
    "prazoAdicionadoDias" INTEGER,
    "valorTotalAdicionado" DECIMAL,
    "valorConcedenteAdicionado" DECIMAL,
    "valorProprioAdicionado" DECIMAL,
    "snapshotPrazoDias" INTEGER,
    "snapshotVigenciaAtual" TIMESTAMP(3),
    "snapshotValorTotalAtual" DECIMAL,
    "snapshotValorConcedenteAtual" DECIMAL,
    "snapshotValorProprioAtual" DECIMAL,
    "aplicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContratoAditivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContratoAditivo_tenantId_contratoId_numeroAditivo_key" ON "ContratoAditivo"("tenantId", "contratoId", "numeroAditivo");
CREATE INDEX "ContratoAditivo_tenantId_idx" ON "ContratoAditivo"("tenantId");
CREATE INDEX "ContratoAditivo_contratoId_idx" ON "ContratoAditivo"("contratoId");
CREATE INDEX "ContratoAditivo_tenantId_status_idx" ON "ContratoAditivo"("tenantId", "status");

ALTER TABLE "ContratoAditivo" ADD CONSTRAINT "ContratoAditivo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoAditivo" ADD CONSTRAINT "ContratoAditivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

