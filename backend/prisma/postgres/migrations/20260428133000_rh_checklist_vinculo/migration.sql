-- CreateTable
CREATE TABLE "RhChecklistModelo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nomeModelo" TEXT NOT NULL,
    "tipoVinculo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RhChecklistModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RhChecklistItemModelo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "modeloId" INTEGER NOT NULL,
    "ordemItem" INTEGER NOT NULL,
    "grupoItem" TEXT,
    "codigoItem" TEXT,
    "tituloItem" TEXT NOT NULL,
    "descricaoItem" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "exigeValidade" BOOLEAN NOT NULL DEFAULT false,
    "validadeDias" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RhChecklistItemModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RhChecklistExecucao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "modeloId" INTEGER NOT NULL,
    "vinculoId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RhChecklistExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RhChecklistExecucaoItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "execucaoId" INTEGER NOT NULL,
    "itemModeloId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "entregueEm" TIMESTAMP(3),
    "validadeAte" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RhChecklistExecucaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RhChecklistModelo_tenantId_idx" ON "RhChecklistModelo"("tenantId");

-- CreateIndex
CREATE INDEX "RhChecklistModelo_tenantId_tipoVinculo_idx" ON "RhChecklistModelo"("tenantId", "tipoVinculo");

-- CreateIndex
CREATE UNIQUE INDEX "RhChecklistModelo_tenantId_codigo_key" ON "RhChecklistModelo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "RhChecklistItemModelo_tenantId_idx" ON "RhChecklistItemModelo"("tenantId");

-- CreateIndex
CREATE INDEX "RhChecklistItemModelo_tenantId_modeloId_idx" ON "RhChecklistItemModelo"("tenantId", "modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "RhChecklistItemModelo_tenantId_modeloId_ordemItem_key" ON "RhChecklistItemModelo"("tenantId", "modeloId", "ordemItem");

-- CreateIndex
CREATE INDEX "RhChecklistExecucao_tenantId_idx" ON "RhChecklistExecucao"("tenantId");

-- CreateIndex
CREATE INDEX "RhChecklistExecucao_tenantId_vinculoId_idx" ON "RhChecklistExecucao"("tenantId", "vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "RhChecklistExecucao_tenantId_modeloId_vinculoId_key" ON "RhChecklistExecucao"("tenantId", "modeloId", "vinculoId");

-- CreateIndex
CREATE INDEX "RhChecklistExecucaoItem_tenantId_idx" ON "RhChecklistExecucaoItem"("tenantId");

-- CreateIndex
CREATE INDEX "RhChecklistExecucaoItem_tenantId_execucaoId_idx" ON "RhChecklistExecucaoItem"("tenantId", "execucaoId");

-- CreateIndex
CREATE INDEX "RhChecklistExecucaoItem_tenantId_itemModeloId_idx" ON "RhChecklistExecucaoItem"("tenantId", "itemModeloId");

-- CreateIndex
CREATE UNIQUE INDEX "RhChecklistExecucaoItem_tenantId_execucaoId_itemModeloId_key" ON "RhChecklistExecucaoItem"("tenantId", "execucaoId", "itemModeloId");

-- AddForeignKey
ALTER TABLE "RhChecklistModelo" ADD CONSTRAINT "RhChecklistModelo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistItemModelo" ADD CONSTRAINT "RhChecklistItemModelo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistItemModelo" ADD CONSTRAINT "RhChecklistItemModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "RhChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucao" ADD CONSTRAINT "RhChecklistExecucao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucao" ADD CONSTRAINT "RhChecklistExecucao_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "RhChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucao" ADD CONSTRAINT "RhChecklistExecucao_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "PessoaVinculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucaoItem" ADD CONSTRAINT "RhChecklistExecucaoItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucaoItem" ADD CONSTRAINT "RhChecklistExecucaoItem_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "RhChecklistExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RhChecklistExecucaoItem" ADD CONSTRAINT "RhChecklistExecucaoItem_itemModeloId_fkey" FOREIGN KEY ("itemModeloId") REFERENCES "RhChecklistItemModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

