-- Alter TenantUser for SOAR actions (block / token revocation)
ALTER TABLE "TenantUser" ADD COLUMN     "bloqueadoAteEm" TIMESTAMP(3);
ALTER TABLE "TenantUser" ADD COLUMN     "tokenRevokedBefore" TIMESTAMP(3);

CREATE TABLE "ObservabilidadeEvento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "subcategoria" TEXT,
    "nomeEvento" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "origemChave" TEXT,
    "modulo" TEXT,
    "entidadeTipo" TEXT,
    "entidadeId" INTEGER,
    "actorTipo" TEXT,
    "actorUserId" INTEGER,
    "actorEmail" TEXT,
    "targetTipo" TEXT,
    "targetId" INTEGER,
    "requestId" TEXT,
    "correlationId" TEXT,
    "sessionId" TEXT,
    "traceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "rota" TEXT,
    "metodoHttp" TEXT,
    "statusHttp" INTEGER,
    "payloadRedactedJson" JSONB,
    "labelsJson" JSONB,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeRegra" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoRegra" TEXT NOT NULL,
    "categoriaAlvo" TEXT,
    "filtroJson" JSONB,
    "janelaMinutos" INTEGER NOT NULL DEFAULT 5,
    "limiarValor" INTEGER,
    "agrupamentoJson" JSONB,
    "severidadeAlerta" TEXT NOT NULL DEFAULT 'WARNING',
    "geraIncidenteAutomatico" BOOLEAN NOT NULL DEFAULT false,
    "notificarJson" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeRegra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeAlerta" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "severidade" TEXT NOT NULL,
    "statusAlerta" TEXT NOT NULL DEFAULT 'ABERTO',
    "dedupeKey" TEXT,
    "primeiroEventoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoEventoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEventos" INTEGER NOT NULL DEFAULT 1,
    "responsavelUserId" INTEGER,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeAlerta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeAlertaEvento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "eventoId" INTEGER NOT NULL,

    CONSTRAINT "ObservabilidadeAlertaEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeIncidente" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "alertaOrigemId" INTEGER,
    "tipoIncidente" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "criticidade" TEXT NOT NULL,
    "statusIncidente" TEXT NOT NULL DEFAULT 'ABERTO',
    "ownerUserId" INTEGER,
    "slaRespostaEm" TIMESTAMP(3),
    "slaResolucaoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "causaRaiz" TEXT,
    "impactoResumo" TEXT,
    "acoesTomadasJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeIncidente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeIncidenteEvento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "incidenteId" INTEGER NOT NULL,
    "eventoId" INTEGER NOT NULL,

    CONSTRAINT "ObservabilidadeIncidenteEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadePlaybook" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "modoExecucao" TEXT NOT NULL,
    "gatilhoTipo" TEXT NOT NULL,
    "filtroEventoJson" JSONB,
    "filtroAlertaJson" JSONB,
    "filtroIncidenteJson" JSONB,
    "riscoPadrao" TEXT NOT NULL DEFAULT 'BAIXO',
    "politicaAprovacao" TEXT NOT NULL DEFAULT 'EXIGE_SE_RISCO_ALTO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordemPrioridade" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadePlaybook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadePlaybookPasso" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "playbookId" INTEGER NOT NULL,
    "ordemExecucao" INTEGER NOT NULL,
    "tipoAcao" TEXT NOT NULL,
    "nomePasso" TEXT NOT NULL,
    "descricao" TEXT,
    "configuracaoJson" JSONB,
    "timeoutSegundos" INTEGER,
    "continuaEmErro" BOOLEAN NOT NULL DEFAULT false,
    "reversivel" BOOLEAN NOT NULL DEFAULT false,
    "acaoCompensacaoJson" JSONB,
    "riscoAcao" TEXT NOT NULL DEFAULT 'BAIXO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadePlaybookPasso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadePlaybookExecucao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "playbookId" INTEGER NOT NULL,
    "alertaId" INTEGER,
    "incidenteId" INTEGER,
    "eventoOrigemId" INTEGER,
    "modoExecucao" TEXT NOT NULL,
    "statusExecucao" TEXT NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "aprovacaoExigida" BOOLEAN NOT NULL DEFAULT false,
    "aprovadoPorUserId" INTEGER,
    "aprovadoEm" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "resultadoResumoJson" JSONB,
    "executadoPorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadePlaybookExecucao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadePlaybookExecucaoPasso" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "execucaoId" INTEGER NOT NULL,
    "passoId" INTEGER NOT NULL,
    "ordemExecucao" INTEGER NOT NULL,
    "statusPasso" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "entradaRedactedJson" JSONB,
    "saidaRedactedJson" JSONB,
    "erroResumo" TEXT,
    "rollbackResultadoJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadePlaybookExecucaoPasso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeIncidenteTimeline" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "incidenteId" INTEGER NOT NULL,
    "tipoEventoTimeline" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "autorUserId" INTEGER,
    "metadataJson" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservabilidadeIncidenteTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeCasoCompliance" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "incidenteId" INTEGER,
    "tipoCaso" TEXT NOT NULL,
    "statusCaso" TEXT NOT NULL,
    "criticidade" TEXT NOT NULL,
    "ownerUserId" INTEGER,
    "prazoRespostaEm" TIMESTAMP(3),
    "prazoConclusaoEm" TIMESTAMP(3),
    "parecerFinal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeCasoCompliance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ObservabilidadeCasoComplianceEvidencia" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "casoId" INTEGER NOT NULL,
    "tipoEvidencia" TEXT NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "descricao" TEXT,
    "arquivoPath" TEXT,
    "hashSha256" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilidadeCasoComplianceEvidencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObservabilidadePlaybook_tenantId_codigo_key" ON "ObservabilidadePlaybook"("tenantId", "codigo");
CREATE INDEX "ObservabilidadePlaybook_tenantId_idx" ON "ObservabilidadePlaybook"("tenantId");
CREATE INDEX "ObservabilidadePlaybook_tenantId_ativo_idx" ON "ObservabilidadePlaybook"("tenantId", "ativo");
CREATE INDEX "ObservabilidadePlaybook_tenantId_gatilhoTipo_ativo_idx" ON "ObservabilidadePlaybook"("tenantId", "gatilhoTipo", "ativo");

CREATE UNIQUE INDEX "ObservabilidadePlaybookPasso_playbookId_ordemExecucao_key" ON "ObservabilidadePlaybookPasso"("playbookId", "ordemExecucao");
CREATE INDEX "ObservabilidadePlaybookPasso_tenantId_idx" ON "ObservabilidadePlaybookPasso"("tenantId");
CREATE INDEX "ObservabilidadePlaybookPasso_playbookId_idx" ON "ObservabilidadePlaybookPasso"("playbookId");

CREATE UNIQUE INDEX "ObservabilidadePlaybookExecucao_tenantId_chaveIdempotencia_key" ON "ObservabilidadePlaybookExecucao"("tenantId", "chaveIdempotencia");
CREATE INDEX "ObservabilidadePlaybookExecucao_tenantId_idx" ON "ObservabilidadePlaybookExecucao"("tenantId");
CREATE INDEX "ObservabilidadePlaybookExecucao_playbookId_idx" ON "ObservabilidadePlaybookExecucao"("playbookId");
CREATE INDEX "ObservabilidadePlaybookExecucao_tenantId_statusExecucao_updatedAt_idx" ON "ObservabilidadePlaybookExecucao"("tenantId", "statusExecucao", "updatedAt");

CREATE UNIQUE INDEX "ObservabilidadePlaybookExecucaoPasso_execucaoId_ordemExecucao_key" ON "ObservabilidadePlaybookExecucaoPasso"("execucaoId", "ordemExecucao");
CREATE INDEX "ObservabilidadePlaybookExecucaoPasso_tenantId_idx" ON "ObservabilidadePlaybookExecucaoPasso"("tenantId");
CREATE INDEX "ObservabilidadePlaybookExecucaoPasso_execucaoId_idx" ON "ObservabilidadePlaybookExecucaoPasso"("execucaoId");
CREATE INDEX "ObservabilidadePlaybookExecucaoPasso_passoId_idx" ON "ObservabilidadePlaybookExecucaoPasso"("passoId");

CREATE INDEX "ObservabilidadeIncidenteTimeline_tenantId_idx" ON "ObservabilidadeIncidenteTimeline"("tenantId");
CREATE INDEX "ObservabilidadeIncidenteTimeline_incidenteId_idx" ON "ObservabilidadeIncidenteTimeline"("incidenteId");
CREATE INDEX "ObservabilidadeIncidenteTimeline_tenantId_incidenteId_criadoEm_idx" ON "ObservabilidadeIncidenteTimeline"("tenantId", "incidenteId", "criadoEm");

CREATE INDEX "ObservabilidadeCasoCompliance_tenantId_idx" ON "ObservabilidadeCasoCompliance"("tenantId");
CREATE INDEX "ObservabilidadeCasoCompliance_tenantId_statusCaso_updatedAt_idx" ON "ObservabilidadeCasoCompliance"("tenantId", "statusCaso", "updatedAt");

CREATE INDEX "ObservabilidadeCasoComplianceEvidencia_tenantId_idx" ON "ObservabilidadeCasoComplianceEvidencia"("tenantId");
CREATE INDEX "ObservabilidadeCasoComplianceEvidencia_casoId_idx" ON "ObservabilidadeCasoComplianceEvidencia"("casoId");

CREATE INDEX "ObservabilidadeEvento_tenantId_ocorridoEm_idx" ON "ObservabilidadeEvento"("tenantId", "ocorridoEm");
CREATE INDEX "ObservabilidadeEvento_tenantId_categoria_severidade_ocorridoEm_idx" ON "ObservabilidadeEvento"("tenantId", "categoria", "severidade", "ocorridoEm");
CREATE INDEX "ObservabilidadeEvento_tenantId_actorUserId_ocorridoEm_idx" ON "ObservabilidadeEvento"("tenantId", "actorUserId", "ocorridoEm");
CREATE INDEX "ObservabilidadeEvento_tenantId_entidadeTipo_entidadeId_ocorridoEm_idx" ON "ObservabilidadeEvento"("tenantId", "entidadeTipo", "entidadeId", "ocorridoEm");
CREATE INDEX "ObservabilidadeEvento_tenantId_correlationId_idx" ON "ObservabilidadeEvento"("tenantId", "correlationId");
CREATE INDEX "ObservabilidadeEvento_tenantId_requestId_idx" ON "ObservabilidadeEvento"("tenantId", "requestId");

CREATE INDEX "ObservabilidadeRegra_tenantId_idx" ON "ObservabilidadeRegra"("tenantId");
CREATE INDEX "ObservabilidadeRegra_tenantId_ativo_idx" ON "ObservabilidadeRegra"("tenantId", "ativo");

CREATE INDEX "ObservabilidadeAlerta_tenantId_idx" ON "ObservabilidadeAlerta"("tenantId");
CREATE INDEX "ObservabilidadeAlerta_tenantId_statusAlerta_updatedAt_idx" ON "ObservabilidadeAlerta"("tenantId", "statusAlerta", "updatedAt");

CREATE INDEX "ObservabilidadeAlertaEvento_tenantId_idx" ON "ObservabilidadeAlertaEvento"("tenantId");
CREATE INDEX "ObservabilidadeAlertaEvento_alertaId_idx" ON "ObservabilidadeAlertaEvento"("alertaId");
CREATE INDEX "ObservabilidadeAlertaEvento_eventoId_idx" ON "ObservabilidadeAlertaEvento"("eventoId");

CREATE INDEX "ObservabilidadeIncidente_tenantId_idx" ON "ObservabilidadeIncidente"("tenantId");
CREATE INDEX "ObservabilidadeIncidente_tenantId_statusIncidente_updatedAt_idx" ON "ObservabilidadeIncidente"("tenantId", "statusIncidente", "updatedAt");

CREATE INDEX "ObservabilidadeIncidenteEvento_tenantId_idx" ON "ObservabilidadeIncidenteEvento"("tenantId");
CREATE INDEX "ObservabilidadeIncidenteEvento_incidenteId_idx" ON "ObservabilidadeIncidenteEvento"("incidenteId");
CREATE INDEX "ObservabilidadeIncidenteEvento_eventoId_idx" ON "ObservabilidadeIncidenteEvento"("eventoId");

ALTER TABLE "ObservabilidadeEvento" ADD CONSTRAINT "ObservabilidadeEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeEvento" ADD CONSTRAINT "ObservabilidadeEvento_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeRegra" ADD CONSTRAINT "ObservabilidadeRegra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeAlerta" ADD CONSTRAINT "ObservabilidadeAlerta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeAlerta" ADD CONSTRAINT "ObservabilidadeAlerta_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "ObservabilidadeRegra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeAlerta" ADD CONSTRAINT "ObservabilidadeAlerta_responsavelUserId_fkey" FOREIGN KEY ("responsavelUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeAlertaEvento" ADD CONSTRAINT "ObservabilidadeAlertaEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeAlertaEvento" ADD CONSTRAINT "ObservabilidadeAlertaEvento_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "ObservabilidadeAlerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeAlertaEvento" ADD CONSTRAINT "ObservabilidadeAlertaEvento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "ObservabilidadeEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeIncidente" ADD CONSTRAINT "ObservabilidadeIncidente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidente" ADD CONSTRAINT "ObservabilidadeIncidente_alertaOrigemId_fkey" FOREIGN KEY ("alertaOrigemId") REFERENCES "ObservabilidadeAlerta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidente" ADD CONSTRAINT "ObservabilidadeIncidente_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeIncidenteEvento" ADD CONSTRAINT "ObservabilidadeIncidenteEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidenteEvento" ADD CONSTRAINT "ObservabilidadeIncidenteEvento_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "ObservabilidadeIncidente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidenteEvento" ADD CONSTRAINT "ObservabilidadeIncidenteEvento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "ObservabilidadeEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadePlaybook" ADD CONSTRAINT "ObservabilidadePlaybook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadePlaybookPasso" ADD CONSTRAINT "ObservabilidadePlaybookPasso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookPasso" ADD CONSTRAINT "ObservabilidadePlaybookPasso_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "ObservabilidadePlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "ObservabilidadePlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "ObservabilidadeAlerta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "ObservabilidadeIncidente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_eventoOrigemId_fkey" FOREIGN KEY ("eventoOrigemId") REFERENCES "ObservabilidadeEvento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_aprovadoPorUserId_fkey" FOREIGN KEY ("aprovadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucao" ADD CONSTRAINT "ObservabilidadePlaybookExecucao_executadoPorUserId_fkey" FOREIGN KEY ("executadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadePlaybookExecucaoPasso" ADD CONSTRAINT "ObservabilidadePlaybookExecucaoPasso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucaoPasso" ADD CONSTRAINT "ObservabilidadePlaybookExecucaoPasso_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ObservabilidadePlaybookExecucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadePlaybookExecucaoPasso" ADD CONSTRAINT "ObservabilidadePlaybookExecucaoPasso_passoId_fkey" FOREIGN KEY ("passoId") REFERENCES "ObservabilidadePlaybookPasso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeIncidenteTimeline" ADD CONSTRAINT "ObservabilidadeIncidenteTimeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidenteTimeline" ADD CONSTRAINT "ObservabilidadeIncidenteTimeline_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "ObservabilidadeIncidente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeIncidenteTimeline" ADD CONSTRAINT "ObservabilidadeIncidenteTimeline_autorUserId_fkey" FOREIGN KEY ("autorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeCasoCompliance" ADD CONSTRAINT "ObservabilidadeCasoCompliance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeCasoCompliance" ADD CONSTRAINT "ObservabilidadeCasoCompliance_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "ObservabilidadeIncidente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeCasoCompliance" ADD CONSTRAINT "ObservabilidadeCasoCompliance_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilidadeCasoComplianceEvidencia" ADD CONSTRAINT "ObservabilidadeCasoComplianceEvidencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservabilidadeCasoComplianceEvidencia" ADD CONSTRAINT "ObservabilidadeCasoComplianceEvidencia_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "ObservabilidadeCasoCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
