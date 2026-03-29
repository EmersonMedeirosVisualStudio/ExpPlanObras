CREATE TABLE "GovernancaPiiScan" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tipoScan" TEXT NOT NULL,
    "alvoTipo" TEXT NOT NULL,
    "alvoChave" TEXT NOT NULL,
    "statusScan" TEXT NOT NULL DEFAULT 'PENDENTE',
    "totalItens" INTEGER NOT NULL DEFAULT 0,
    "totalSuspeitos" INTEGER NOT NULL DEFAULT 0,
    "executadoPorUserId" INTEGER NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "resultadoResumoJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaPiiScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernancaPiiScanResultado" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "scanId" INTEGER NOT NULL,
    "ativoId" INTEGER,
    "campoId" INTEGER,
    "tipoDetectado" TEXT NOT NULL,
    "nivelConfianca" TEXT NOT NULL,
    "statusResultado" TEXT NOT NULL,
    "amostraMascarada" TEXT,
    "regraDetector" TEXT,
    "sugestaoClassificacao" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaPiiScanResultado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernancaClassificacaoSugestao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ativoId" INTEGER NOT NULL,
    "campoId" INTEGER,
    "origemSugestao" TEXT NOT NULL,
    "classificacaoSugerida" TEXT NOT NULL,
    "categoriaSugerida" TEXT,
    "scoreConfianca" DECIMAL(5,2),
    "statusSugestao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "avaliadoPorUserId" INTEGER,
    "avaliadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaClassificacaoSugestao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernancaDadosAuditoria" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "recursoTipo" TEXT NOT NULL,
    "recursoId" INTEGER,
    "detalhesJson" JSONB,
    "userId" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaDadosAuditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GovernancaPiiScan_tenantId_idx" ON "GovernancaPiiScan"("tenantId");
CREATE INDEX "GovernancaPiiScan_tenantId_statusScan_iniciadoEm_idx" ON "GovernancaPiiScan"("tenantId","statusScan","iniciadoEm");

CREATE INDEX "GovernancaPiiScanResultado_tenantId_idx" ON "GovernancaPiiScanResultado"("tenantId");
CREATE INDEX "GovernancaPiiScanResultado_scanId_idx" ON "GovernancaPiiScanResultado"("scanId");
CREATE INDEX "GovernancaPiiScanResultado_ativoId_idx" ON "GovernancaPiiScanResultado"("ativoId");
CREATE INDEX "GovernancaPiiScanResultado_campoId_idx" ON "GovernancaPiiScanResultado"("campoId");

CREATE INDEX "GovernancaClassificacaoSugestao_tenantId_idx" ON "GovernancaClassificacaoSugestao"("tenantId");
CREATE INDEX "GovernancaClassificacaoSugestao_tenantId_statusSugestao_idx" ON "GovernancaClassificacaoSugestao"("tenantId","statusSugestao");
CREATE INDEX "GovernancaClassificacaoSugestao_ativoId_idx" ON "GovernancaClassificacaoSugestao"("ativoId");
CREATE INDEX "GovernancaClassificacaoSugestao_campoId_idx" ON "GovernancaClassificacaoSugestao"("campoId");

CREATE INDEX "GovernancaDadosAuditoria_tenantId_idx" ON "GovernancaDadosAuditoria"("tenantId");
CREATE INDEX "GovernancaDadosAuditoria_tenantId_tipoEvento_createdAt_idx" ON "GovernancaDadosAuditoria"("tenantId","tipoEvento","createdAt");

ALTER TABLE "GovernancaPiiScan" ADD CONSTRAINT "GovernancaPiiScan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaPiiScan" ADD CONSTRAINT "GovernancaPiiScan_executadoPorUserId_fkey" FOREIGN KEY ("executadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaPiiScanResultado" ADD CONSTRAINT "GovernancaPiiScanResultado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaPiiScanResultado" ADD CONSTRAINT "GovernancaPiiScanResultado_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "GovernancaPiiScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaPiiScanResultado" ADD CONSTRAINT "GovernancaPiiScanResultado_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaPiiScanResultado" ADD CONSTRAINT "GovernancaPiiScanResultado_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "GovernancaDadoAtivoCampo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaClassificacaoSugestao" ADD CONSTRAINT "GovernancaClassificacaoSugestao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaClassificacaoSugestao" ADD CONSTRAINT "GovernancaClassificacaoSugestao_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaClassificacaoSugestao" ADD CONSTRAINT "GovernancaClassificacaoSugestao_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "GovernancaDadoAtivoCampo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaClassificacaoSugestao" ADD CONSTRAINT "GovernancaClassificacaoSugestao_avaliadoPorUserId_fkey" FOREIGN KEY ("avaliadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadosAuditoria" ADD CONSTRAINT "GovernancaDadosAuditoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadosAuditoria" ADD CONSTRAINT "GovernancaDadosAuditoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

