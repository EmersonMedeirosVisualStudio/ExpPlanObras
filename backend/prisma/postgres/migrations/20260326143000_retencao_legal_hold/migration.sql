CREATE TABLE "GovernancaRetencaoPolitica" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigoPolitica" TEXT NOT NULL,
    "nomePolitica" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "categoriaRecurso" TEXT,
    "eventoBase" TEXT NOT NULL,
    "periodoValor" INTEGER NOT NULL,
    "periodoUnidade" TEXT NOT NULL,
    "acaoFinal" TEXT NOT NULL,
    "exigeAprovacaoDescarte" BOOLEAN NOT NULL DEFAULT true,
    "respeitaBackupTtl" BOOLEAN NOT NULL DEFAULT true,
    "anonimizarCamposJson" JSONB,
    "condicaoJson" JSONB,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorUserId" INTEGER NOT NULL,
    "atualizadoPorUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaRetencaoPolitica_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaRetencaoPolitica_tenantId_codigoPolitica_key" ON "GovernancaRetencaoPolitica"("tenantId","codigoPolitica");
CREATE INDEX "GovernancaRetencaoPolitica_tenantId_idx" ON "GovernancaRetencaoPolitica"("tenantId");
CREATE INDEX "GovernancaRetencaoPolitica_tenantId_recurso_ativo_idx" ON "GovernancaRetencaoPolitica"("tenantId","recurso","ativo");

CREATE TABLE "GovernancaRetencaoItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "categoriaRecurso" TEXT,
    "politicaAplicadaId" INTEGER,
    "statusRetencao" TEXT NOT NULL DEFAULT 'ATIVO',
    "dataEventoBase" TIMESTAMP(3) NOT NULL,
    "elegivelArquivamentoEm" TIMESTAMP(3),
    "elegivelDescarteEm" TIMESTAMP(3),
    "backupTtlAteEm" TIMESTAMP(3),
    "holdAtivo" BOOLEAN NOT NULL DEFAULT false,
    "totalHoldsAtivos" INTEGER NOT NULL DEFAULT 0,
    "storagePathPrincipal" TEXT,
    "hashReferencia" TEXT,
    "tamanhoBytes" INTEGER,
    "confidencialidade" TEXT,
    "metadataJson" JSONB,
    "ultimoProcessamentoEm" TIMESTAMP(3),
    "descartadoEm" TIMESTAMP(3),
    "expurgadoEm" TIMESTAMP(3),
    "atualizadoEmOrigem" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaRetencaoItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaRetencaoItem_tenantId_recurso_entidadeId_key" ON "GovernancaRetencaoItem"("tenantId","recurso","entidadeId");
CREATE INDEX "GovernancaRetencaoItem_tenantId_statusRetencao_elegivelDescarteEm_idx" ON "GovernancaRetencaoItem"("tenantId","statusRetencao","elegivelDescarteEm");
CREATE INDEX "GovernancaRetencaoItem_tenantId_holdAtivo_elegivelDescarteEm_idx" ON "GovernancaRetencaoItem"("tenantId","holdAtivo","elegivelDescarteEm");

CREATE TABLE "GovernancaLegalHold" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigoHold" TEXT NOT NULL,
    "tituloHold" TEXT NOT NULL,
    "motivoHold" TEXT NOT NULL,
    "tipoHold" TEXT NOT NULL,
    "statusHold" TEXT NOT NULL DEFAULT 'ATIVO',
    "criteriaJson" JSONB,
    "criadorUserId" INTEGER NOT NULL,
    "liberadorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberadoEm" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaLegalHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaLegalHold_tenantId_codigoHold_key" ON "GovernancaLegalHold"("tenantId","codigoHold");
CREATE INDEX "GovernancaLegalHold_tenantId_idx" ON "GovernancaLegalHold"("tenantId");
CREATE INDEX "GovernancaLegalHold_tenantId_statusHold_idx" ON "GovernancaLegalHold"("tenantId","statusHold");

CREATE TABLE "GovernancaLegalHoldItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "legalHoldId" INTEGER NOT NULL,
    "retencaoItemId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "aplicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    CONSTRAINT "GovernancaLegalHoldItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaLegalHoldItem_legalHoldId_retencaoItemId_key" ON "GovernancaLegalHoldItem"("legalHoldId","retencaoItemId");
CREATE INDEX "GovernancaLegalHoldItem_tenantId_idx" ON "GovernancaLegalHoldItem"("tenantId");
CREATE INDEX "GovernancaLegalHoldItem_legalHoldId_idx" ON "GovernancaLegalHoldItem"("legalHoldId");
CREATE INDEX "GovernancaLegalHoldItem_retencaoItemId_idx" ON "GovernancaLegalHoldItem"("retencaoItemId");

CREATE TABLE "GovernancaDescarteLote" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "nomeLote" TEXT NOT NULL,
    "tipoExecucao" TEXT NOT NULL,
    "statusLote" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "criadorUserId" INTEGER NOT NULL,
    "aprovadorUserId" INTEGER,
    "executorUserId" INTEGER,
    "totalItens" INTEGER NOT NULL DEFAULT 0,
    "totalAnonimizados" INTEGER NOT NULL DEFAULT 0,
    "totalDescartados" INTEGER NOT NULL DEFAULT 0,
    "totalExpurgados" INTEGER NOT NULL DEFAULT 0,
    "totalErros" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDescarteLote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaDescarteLote_tenantId_idx" ON "GovernancaDescarteLote"("tenantId");
CREATE INDEX "GovernancaDescarteLote_tenantId_statusLote_idx" ON "GovernancaDescarteLote"("tenantId","statusLote");

CREATE TABLE "GovernancaDescarteLoteItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "loteId" INTEGER NOT NULL,
    "retencaoItemId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "acaoPlanejada" TEXT NOT NULL,
    "statusItem" TEXT NOT NULL DEFAULT 'PENDENTE',
    "hashAntes" TEXT,
    "hashDepois" TEXT,
    "storagePathAntes" TEXT,
    "evidenceJson" JSONB,
    "mensagemResultado" TEXT,
    "processadoEm" TIMESTAMP(3),
    CONSTRAINT "GovernancaDescarteLoteItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaDescarteLoteItem_loteId_retencaoItemId_key" ON "GovernancaDescarteLoteItem"("loteId","retencaoItemId");
CREATE INDEX "GovernancaDescarteLoteItem_tenantId_idx" ON "GovernancaDescarteLoteItem"("tenantId");
CREATE INDEX "GovernancaDescarteLoteItem_loteId_idx" ON "GovernancaDescarteLoteItem"("loteId");
CREATE INDEX "GovernancaDescarteLoteItem_retencaoItemId_idx" ON "GovernancaDescarteLoteItem"("retencaoItemId");

CREATE TABLE "GovernancaRetencaoAuditoria" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "entidadeId" INTEGER,
    "retencaoItemId" INTEGER,
    "tipoEvento" TEXT NOT NULL,
    "descricaoEvento" TEXT NOT NULL,
    "userId" INTEGER,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaRetencaoAuditoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaRetencaoAuditoria_tenantId_idx" ON "GovernancaRetencaoAuditoria"("tenantId");
CREATE INDEX "GovernancaRetencaoAuditoria_tenantId_tipoEvento_createdAt_idx" ON "GovernancaRetencaoAuditoria"("tenantId","tipoEvento","createdAt");

ALTER TABLE "GovernancaRetencaoPolitica" ADD CONSTRAINT "GovernancaRetencaoPolitica_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaRetencaoPolitica" ADD CONSTRAINT "GovernancaRetencaoPolitica_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaRetencaoPolitica" ADD CONSTRAINT "GovernancaRetencaoPolitica_atualizadoPorUserId_fkey" FOREIGN KEY ("atualizadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaRetencaoItem" ADD CONSTRAINT "GovernancaRetencaoItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaRetencaoItem" ADD CONSTRAINT "GovernancaRetencaoItem_politicaAplicadaId_fkey" FOREIGN KEY ("politicaAplicadaId") REFERENCES "GovernancaRetencaoPolitica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaLegalHold" ADD CONSTRAINT "GovernancaLegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaLegalHold" ADD CONSTRAINT "GovernancaLegalHold_criadorUserId_fkey" FOREIGN KEY ("criadorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaLegalHold" ADD CONSTRAINT "GovernancaLegalHold_liberadorUserId_fkey" FOREIGN KEY ("liberadorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaLegalHoldItem" ADD CONSTRAINT "GovernancaLegalHoldItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaLegalHoldItem" ADD CONSTRAINT "GovernancaLegalHoldItem_legalHoldId_fkey" FOREIGN KEY ("legalHoldId") REFERENCES "GovernancaLegalHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaLegalHoldItem" ADD CONSTRAINT "GovernancaLegalHoldItem_retencaoItemId_fkey" FOREIGN KEY ("retencaoItemId") REFERENCES "GovernancaRetencaoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDescarteLote" ADD CONSTRAINT "GovernancaDescarteLote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDescarteLote" ADD CONSTRAINT "GovernancaDescarteLote_criadorUserId_fkey" FOREIGN KEY ("criadorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDescarteLote" ADD CONSTRAINT "GovernancaDescarteLote_aprovadorUserId_fkey" FOREIGN KEY ("aprovadorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDescarteLote" ADD CONSTRAINT "GovernancaDescarteLote_executorUserId_fkey" FOREIGN KEY ("executorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaDescarteLoteItem" ADD CONSTRAINT "GovernancaDescarteLoteItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDescarteLoteItem" ADD CONSTRAINT "GovernancaDescarteLoteItem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "GovernancaDescarteLote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDescarteLoteItem" ADD CONSTRAINT "GovernancaDescarteLoteItem_retencaoItemId_fkey" FOREIGN KEY ("retencaoItemId") REFERENCES "GovernancaRetencaoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaRetencaoAuditoria" ADD CONSTRAINT "GovernancaRetencaoAuditoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaRetencaoAuditoria" ADD CONSTRAINT "GovernancaRetencaoAuditoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaRetencaoAuditoria" ADD CONSTRAINT "GovernancaRetencaoAuditoria_retencaoItemId_fkey" FOREIGN KEY ("retencaoItemId") REFERENCES "GovernancaRetencaoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

