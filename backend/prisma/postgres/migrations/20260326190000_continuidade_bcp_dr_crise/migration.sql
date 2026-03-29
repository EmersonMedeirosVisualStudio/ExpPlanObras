CREATE TABLE "BcpPlano" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoPlano" TEXT NOT NULL,
    "modulo" TEXT,
    "criticidade" TEXT NOT NULL,
    "rtoMinutos" INTEGER NOT NULL,
    "rpoMinutos" INTEGER NOT NULL,
    "ownerUserId" INTEGER,
    "aprovadoPor" INTEGER,
    "aprovadoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BcpPlano_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BcpPlano_tenantId_codigo_key" ON "BcpPlano"("tenantId", "codigo");
CREATE INDEX "BcpPlano_tenantId_tipoPlano_ativo_idx" ON "BcpPlano"("tenantId", "tipoPlano", "ativo");

CREATE TABLE "BcpPlanoAtivoCritico" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planoId" INTEGER NOT NULL,
    "tipoAtivo" TEXT NOT NULL,
    "chaveAtivo" TEXT NOT NULL,
    "nomeAtivo" TEXT NOT NULL,
    "criticidade" TEXT NOT NULL,
    "rtoMinutos" INTEGER NOT NULL,
    "rpoMinutos" INTEGER NOT NULL,
    "ownerUserId" INTEGER,
    "dependenciasJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BcpPlanoAtivoCritico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BcpPlanoAtivoCritico_tenantId_idx" ON "BcpPlanoAtivoCritico"("tenantId");
CREATE INDEX "BcpPlanoAtivoCritico_planoId_idx" ON "BcpPlanoAtivoCritico"("planoId");

CREATE TABLE "BcpRunbook" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "modoExecucao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BcpRunbook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BcpRunbook_tenantId_codigo_key" ON "BcpRunbook"("tenantId", "codigo");
CREATE INDEX "BcpRunbook_tenantId_ativo_idx" ON "BcpRunbook"("tenantId", "ativo");

CREATE TABLE "BcpRunbookPasso" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "runbookId" INTEGER NOT NULL,
    "ordemExecucao" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoPasso" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "responsavelTipo" TEXT,
    "timeoutMinutos" INTEGER,
    "configuracaoJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BcpRunbookPasso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BcpRunbookPasso_tenantId_idx" ON "BcpRunbookPasso"("tenantId");
CREATE INDEX "BcpRunbookPasso_runbookId_idx" ON "BcpRunbookPasso"("runbookId");
CREATE UNIQUE INDEX "BcpRunbookPasso_runbookId_ordemExecucao_key" ON "BcpRunbookPasso"("runbookId", "ordemExecucao");

CREATE TABLE "BcpPlanoRunbook" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planoId" INTEGER NOT NULL,
    "runbookId" INTEGER NOT NULL,
    "ordemPrioridade" INTEGER NOT NULL DEFAULT 1000,
    CONSTRAINT "BcpPlanoRunbook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BcpPlanoRunbook_tenantId_idx" ON "BcpPlanoRunbook"("tenantId");
CREATE UNIQUE INDEX "BcpPlanoRunbook_planoId_runbookId_key" ON "BcpPlanoRunbook"("planoId", "runbookId");

CREATE TABLE "BcpTeste" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planoId" INTEGER NOT NULL,
    "tipoTeste" TEXT NOT NULL,
    "statusTeste" TEXT NOT NULL,
    "agendadoPara" TIMESTAMP(3),
    "executadoEm" TIMESTAMP(3),
    "resultado" TEXT,
    "scoreProntidao" INTEGER,
    "relatorioJson" JSONB,
    "executadoPor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BcpTeste_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BcpTeste_tenantId_idx" ON "BcpTeste"("tenantId");
CREATE INDEX "BcpTeste_planoId_idx" ON "BcpTeste"("planoId");

CREATE TABLE "DrExecucaoRecuperacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planoId" INTEGER NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "referenciaOrigem" TEXT,
    "tipoRecuperacao" TEXT NOT NULL,
    "statusExecucao" TEXT NOT NULL,
    "aprovacaoExigida" BOOLEAN NOT NULL DEFAULT false,
    "aprovadoPor" INTEGER,
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "resultadoResumoJson" JSONB,
    "rtoRealMinutos" INTEGER,
    "rpoRealMinutos" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DrExecucaoRecuperacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DrExecucaoRecuperacao_tenantId_idx" ON "DrExecucaoRecuperacao"("tenantId");
CREATE INDEX "DrExecucaoRecuperacao_planoId_idx" ON "DrExecucaoRecuperacao"("planoId");
CREATE INDEX "DrExecucaoRecuperacao_tenantId_statusExecucao_updatedAt_idx" ON "DrExecucaoRecuperacao"("tenantId", "statusExecucao", "updatedAt");

CREATE TABLE "CriseRegistro" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoCrise" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "statusCrise" TEXT NOT NULL,
    "incidenteOrigemId" INTEGER,
    "planoAcionadoId" INTEGER,
    "comandanteUserId" INTEGER,
    "abertaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "impactoJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CriseRegistro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CriseRegistro_tenantId_codigo_key" ON "CriseRegistro"("tenantId", "codigo");
CREATE INDEX "CriseRegistro_tenantId_statusCrise_updatedAt_idx" ON "CriseRegistro"("tenantId", "statusCrise", "updatedAt");

CREATE TABLE "CriseWarRoomParticipante" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "criseId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "papel" TEXT NOT NULL,
    "entrouEm" TIMESTAMP(3),
    "saiuEm" TIMESTAMP(3),
    CONSTRAINT "CriseWarRoomParticipante_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CriseWarRoomParticipante_tenantId_idx" ON "CriseWarRoomParticipante"("tenantId");
CREATE INDEX "CriseWarRoomParticipante_criseId_idx" ON "CriseWarRoomParticipante"("criseId");

CREATE TABLE "CriseTimeline" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "criseId" INTEGER NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "autorUserId" INTEGER,
    "metadataJson" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CriseTimeline_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CriseTimeline_tenantId_idx" ON "CriseTimeline"("tenantId");
CREATE INDEX "CriseTimeline_criseId_idx" ON "CriseTimeline"("criseId");
CREATE INDEX "CriseTimeline_tenantId_criseId_criadoEm_idx" ON "CriseTimeline"("tenantId", "criseId", "criadoEm");

CREATE TABLE "CriseComunicacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "criseId" INTEGER NOT NULL,
    "tipoComunicacao" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "destinatariosJson" JSONB,
    "assunto" TEXT,
    "mensagemRedacted" TEXT,
    "statusEnvio" TEXT NOT NULL,
    "enviadoPor" INTEGER,
    "enviadoEm" TIMESTAMP(3),
    CONSTRAINT "CriseComunicacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CriseComunicacao_tenantId_idx" ON "CriseComunicacao"("tenantId");
CREATE INDEX "CriseComunicacao_criseId_idx" ON "CriseComunicacao"("criseId");

ALTER TABLE "BcpPlano" ADD CONSTRAINT "BcpPlano_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpPlano" ADD CONSTRAINT "BcpPlano_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BcpPlano" ADD CONSTRAINT "BcpPlano_aprovadoPor_fkey" FOREIGN KEY ("aprovadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BcpPlanoAtivoCritico" ADD CONSTRAINT "BcpPlanoAtivoCritico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpPlanoAtivoCritico" ADD CONSTRAINT "BcpPlanoAtivoCritico_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "BcpPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpPlanoAtivoCritico" ADD CONSTRAINT "BcpPlanoAtivoCritico_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BcpRunbook" ADD CONSTRAINT "BcpRunbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BcpRunbookPasso" ADD CONSTRAINT "BcpRunbookPasso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpRunbookPasso" ADD CONSTRAINT "BcpRunbookPasso_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "BcpRunbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BcpPlanoRunbook" ADD CONSTRAINT "BcpPlanoRunbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpPlanoRunbook" ADD CONSTRAINT "BcpPlanoRunbook_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "BcpPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpPlanoRunbook" ADD CONSTRAINT "BcpPlanoRunbook_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "BcpRunbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BcpTeste" ADD CONSTRAINT "BcpTeste_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpTeste" ADD CONSTRAINT "BcpTeste_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "BcpPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BcpTeste" ADD CONSTRAINT "BcpTeste_executadoPor_fkey" FOREIGN KEY ("executadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DrExecucaoRecuperacao" ADD CONSTRAINT "DrExecucaoRecuperacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrExecucaoRecuperacao" ADD CONSTRAINT "DrExecucaoRecuperacao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "BcpPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrExecucaoRecuperacao" ADD CONSTRAINT "DrExecucaoRecuperacao_aprovadoPor_fkey" FOREIGN KEY ("aprovadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CriseRegistro" ADD CONSTRAINT "CriseRegistro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseRegistro" ADD CONSTRAINT "CriseRegistro_comandanteUserId_fkey" FOREIGN KEY ("comandanteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CriseWarRoomParticipante" ADD CONSTRAINT "CriseWarRoomParticipante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseWarRoomParticipante" ADD CONSTRAINT "CriseWarRoomParticipante_criseId_fkey" FOREIGN KEY ("criseId") REFERENCES "CriseRegistro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseWarRoomParticipante" ADD CONSTRAINT "CriseWarRoomParticipante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CriseTimeline" ADD CONSTRAINT "CriseTimeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseTimeline" ADD CONSTRAINT "CriseTimeline_criseId_fkey" FOREIGN KEY ("criseId") REFERENCES "CriseRegistro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseTimeline" ADD CONSTRAINT "CriseTimeline_autorUserId_fkey" FOREIGN KEY ("autorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CriseComunicacao" ADD CONSTRAINT "CriseComunicacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseComunicacao" ADD CONSTRAINT "CriseComunicacao_criseId_fkey" FOREIGN KEY ("criseId") REFERENCES "CriseRegistro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriseComunicacao" ADD CONSTRAINT "CriseComunicacao_enviadoPor_fkey" FOREIGN KEY ("enviadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
