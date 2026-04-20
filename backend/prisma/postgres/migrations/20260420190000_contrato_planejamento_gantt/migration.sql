CREATE TABLE "ContratoServico" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DECIMAL,
    "valorUnitario" DECIMAL,
    "valorTotal" DECIMAL,
    "percentualPeso" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContratoServico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContratoCronogramaItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "duracaoDias" INTEGER NOT NULL,
    "progresso" DECIMAL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContratoCronogramaItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContratoCronogramaDependencia" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "origemItemId" INTEGER NOT NULL,
    "destinoItemId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'FS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContratoCronogramaDependencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContratoServico_tenantId_contratoId_codigo_key" ON "ContratoServico"("tenantId", "contratoId", "codigo");
CREATE INDEX "ContratoServico_tenantId_idx" ON "ContratoServico"("tenantId");
CREATE INDEX "ContratoServico_contratoId_idx" ON "ContratoServico"("contratoId");

CREATE UNIQUE INDEX "ContratoCronogramaItem_tenantId_contratoId_servicoId_key" ON "ContratoCronogramaItem"("tenantId", "contratoId", "servicoId");
CREATE INDEX "ContratoCronogramaItem_tenantId_idx" ON "ContratoCronogramaItem"("tenantId");
CREATE INDEX "ContratoCronogramaItem_contratoId_idx" ON "ContratoCronogramaItem"("contratoId");
CREATE INDEX "ContratoCronogramaItem_servicoId_idx" ON "ContratoCronogramaItem"("servicoId");

CREATE UNIQUE INDEX "ContratoCronogramaDependencia_tenantId_contratoId_origemItemId_destinoItemId_tipo_key" ON "ContratoCronogramaDependencia"("tenantId", "contratoId", "origemItemId", "destinoItemId", "tipo");
CREATE INDEX "ContratoCronogramaDependencia_tenantId_idx" ON "ContratoCronogramaDependencia"("tenantId");
CREATE INDEX "ContratoCronogramaDependencia_contratoId_idx" ON "ContratoCronogramaDependencia"("contratoId");
CREATE INDEX "ContratoCronogramaDependencia_origemItemId_idx" ON "ContratoCronogramaDependencia"("origemItemId");
CREATE INDEX "ContratoCronogramaDependencia_destinoItemId_idx" ON "ContratoCronogramaDependencia"("destinoItemId");

ALTER TABLE "ContratoServico" ADD CONSTRAINT "ContratoServico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoServico" ADD CONSTRAINT "ContratoServico_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoCronogramaItem" ADD CONSTRAINT "ContratoCronogramaItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoCronogramaItem" ADD CONSTRAINT "ContratoCronogramaItem_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoCronogramaItem" ADD CONSTRAINT "ContratoCronogramaItem_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ContratoServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoCronogramaDependencia" ADD CONSTRAINT "ContratoCronogramaDependencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoCronogramaDependencia" ADD CONSTRAINT "ContratoCronogramaDependencia_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoCronogramaDependencia" ADD CONSTRAINT "ContratoCronogramaDependencia_origemItemId_fkey" FOREIGN KEY ("origemItemId") REFERENCES "ContratoCronogramaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoCronogramaDependencia" ADD CONSTRAINT "ContratoCronogramaDependencia_destinoItemId_fkey" FOREIGN KEY ("destinoItemId") REFERENCES "ContratoCronogramaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

