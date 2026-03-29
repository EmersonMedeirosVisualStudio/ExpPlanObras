CREATE TABLE "GovernancaDadoDominio" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "codigoDominio" TEXT NOT NULL,
    "nomeDominio" TEXT NOT NULL,
    "descricaoDominio" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDadoDominio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaDadoDominio_tenantId_codigoDominio_key" ON "GovernancaDadoDominio"("tenantId","codigoDominio");
CREATE INDEX "GovernancaDadoDominio_tenantId_idx" ON "GovernancaDadoDominio"("tenantId");

CREATE TABLE "GovernancaDadoAtivo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "dominioId" INTEGER,
    "tipoAtivo" TEXT NOT NULL,
    "codigoAtivo" TEXT NOT NULL,
    "nomeAtivo" TEXT NOT NULL,
    "descricaoAtivo" TEXT,
    "origemSistema" TEXT,
    "schemaNome" TEXT,
    "objetoNome" TEXT,
    "datasetKey" TEXT,
    "ownerNegocioUserId" INTEGER,
    "ownerTecnicoUserId" INTEGER,
    "stewardUserId" INTEGER,
    "custodianteUserId" INTEGER,
    "classificacaoGlobal" TEXT NOT NULL DEFAULT 'INTERNO',
    "criticidadeNegocio" TEXT NOT NULL DEFAULT 'MEDIA',
    "slaFreshnessMinutos" INTEGER,
    "statusAtivo" TEXT NOT NULL DEFAULT 'ATIVO',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDadoAtivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaDadoAtivo_tenantId_codigoAtivo_key" ON "GovernancaDadoAtivo"("tenantId","codigoAtivo");
CREATE INDEX "GovernancaDadoAtivo_tenantId_idx" ON "GovernancaDadoAtivo"("tenantId");
CREATE INDEX "GovernancaDadoAtivo_dominioId_idx" ON "GovernancaDadoAtivo"("dominioId");

CREATE TABLE "GovernancaDadoAtivoCampo" (
    "id" SERIAL NOT NULL,
    "ativoId" INTEGER NOT NULL,
    "caminhoCampo" TEXT NOT NULL,
    "nomeCampoExibicao" TEXT NOT NULL,
    "tipoDado" TEXT NOT NULL,
    "descricaoCampo" TEXT,
    "classificacaoCampo" TEXT NOT NULL DEFAULT 'INTERNO',
    "pii" BOOLEAN NOT NULL DEFAULT false,
    "campoChave" BOOLEAN NOT NULL DEFAULT false,
    "campoObrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "campoMascaravel" BOOLEAN NOT NULL DEFAULT false,
    "estrategiaMascaraPadrao" TEXT,
    "origemCampo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDadoAtivoCampo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaDadoAtivoCampo_ativoId_caminhoCampo_key" ON "GovernancaDadoAtivoCampo"("ativoId","caminhoCampo");
CREATE INDEX "GovernancaDadoAtivoCampo_ativoId_idx" ON "GovernancaDadoAtivoCampo"("ativoId");

CREATE TABLE "GovernancaDadoGlossario" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "termo" TEXT NOT NULL,
    "definicao" TEXT NOT NULL,
    "formulaNegocio" TEXT,
    "exemplosJson" JSONB,
    "dominioId" INTEGER,
    "ownerUserId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDadoGlossario_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernancaDadoGlossario_tenantId_termo_key" ON "GovernancaDadoGlossario"("tenantId","termo");
CREATE INDEX "GovernancaDadoGlossario_tenantId_idx" ON "GovernancaDadoGlossario"("tenantId");
CREATE INDEX "GovernancaDadoGlossario_dominioId_idx" ON "GovernancaDadoGlossario"("dominioId");

CREATE TABLE "GovernancaDadoLineageRelacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ativoOrigemId" INTEGER NOT NULL,
    "ativoDestinoId" INTEGER NOT NULL,
    "tipoRelacao" TEXT NOT NULL,
    "nivelRelacao" TEXT NOT NULL DEFAULT 'ATIVO',
    "campoOrigem" TEXT,
    "campoDestino" TEXT,
    "transformacaoResumo" TEXT,
    "pipelineNome" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaDadoLineageRelacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaDadoLineageRelacao_tenantId_idx" ON "GovernancaDadoLineageRelacao"("tenantId");
CREATE INDEX "GovernancaDadoLineageRelacao_ativoOrigemId_idx" ON "GovernancaDadoLineageRelacao"("ativoOrigemId");
CREATE INDEX "GovernancaDadoLineageRelacao_ativoDestinoId_idx" ON "GovernancaDadoLineageRelacao"("ativoDestinoId");

CREATE TABLE "GovernancaDadoQualidadeRegra" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ativoId" INTEGER NOT NULL,
    "caminhoCampo" TEXT,
    "nomeRegra" TEXT NOT NULL,
    "tipoRegra" TEXT NOT NULL,
    "severidade" TEXT NOT NULL DEFAULT 'MEDIA',
    "configuracaoJson" JSONB NOT NULL,
    "thresholdOk" DECIMAL(10,4),
    "thresholdAlerta" DECIMAL(10,4),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorUserId" INTEGER NOT NULL,
    "atualizadoPorUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovernancaDadoQualidadeRegra_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaDadoQualidadeRegra_tenantId_idx" ON "GovernancaDadoQualidadeRegra"("tenantId");
CREATE INDEX "GovernancaDadoQualidadeRegra_ativoId_idx" ON "GovernancaDadoQualidadeRegra"("ativoId");

CREATE TABLE "GovernancaDadoQualidadeExecucao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "regraId" INTEGER NOT NULL,
    "statusExecucao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "valorApurado" DECIMAL(18,4),
    "thresholdOk" DECIMAL(10,4),
    "thresholdAlerta" DECIMAL(10,4),
    "totalRegistros" INTEGER,
    "totalInconsistencias" INTEGER,
    "amostraJson" JSONB,
    "mensagemResultado" TEXT,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancaDadoQualidadeExecucao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaDadoQualidadeExecucao_tenantId_idx" ON "GovernancaDadoQualidadeExecucao"("tenantId");
CREATE INDEX "GovernancaDadoQualidadeExecucao_regraId_idx" ON "GovernancaDadoQualidadeExecucao"("regraId");

CREATE TABLE "GovernancaDadoQualidadeIssue" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ativoId" INTEGER NOT NULL,
    "regraId" INTEGER,
    "tituloIssue" TEXT NOT NULL,
    "descricaoIssue" TEXT,
    "severidade" TEXT NOT NULL,
    "statusIssue" TEXT NOT NULL DEFAULT 'ABERTA',
    "responsavelUserId" INTEGER,
    "primeiraOcorrenciaEm" TIMESTAMP(3) NOT NULL,
    "ultimaOcorrenciaEm" TIMESTAMP(3) NOT NULL,
    "resolvidaEm" TIMESTAMP(3),
    "metadataJson" JSONB,
    CONSTRAINT "GovernancaDadoQualidadeIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernancaDadoQualidadeIssue_tenantId_idx" ON "GovernancaDadoQualidadeIssue"("tenantId");
CREATE INDEX "GovernancaDadoQualidadeIssue_ativoId_idx" ON "GovernancaDadoQualidadeIssue"("ativoId");
CREATE INDEX "GovernancaDadoQualidadeIssue_regraId_idx" ON "GovernancaDadoQualidadeIssue"("regraId");
CREATE INDEX "GovernancaDadoQualidadeIssue_responsavelUserId_idx" ON "GovernancaDadoQualidadeIssue"("responsavelUserId");

ALTER TABLE "GovernancaDadoDominio" ADD CONSTRAINT "GovernancaDadoDominio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_dominioId_fkey" FOREIGN KEY ("dominioId") REFERENCES "GovernancaDadoDominio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_ownerNegocioUserId_fkey" FOREIGN KEY ("ownerNegocioUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_ownerTecnicoUserId_fkey" FOREIGN KEY ("ownerTecnicoUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_stewardUserId_fkey" FOREIGN KEY ("stewardUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoAtivo" ADD CONSTRAINT "GovernancaDadoAtivo_custodianteUserId_fkey" FOREIGN KEY ("custodianteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoAtivoCampo" ADD CONSTRAINT "GovernancaDadoAtivoCampo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoGlossario" ADD CONSTRAINT "GovernancaDadoGlossario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoGlossario" ADD CONSTRAINT "GovernancaDadoGlossario_dominioId_fkey" FOREIGN KEY ("dominioId") REFERENCES "GovernancaDadoDominio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoGlossario" ADD CONSTRAINT "GovernancaDadoGlossario_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoLineageRelacao" ADD CONSTRAINT "GovernancaDadoLineageRelacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoLineageRelacao" ADD CONSTRAINT "GovernancaDadoLineageRelacao_ativoOrigemId_fkey" FOREIGN KEY ("ativoOrigemId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoLineageRelacao" ADD CONSTRAINT "GovernancaDadoLineageRelacao_ativoDestinoId_fkey" FOREIGN KEY ("ativoDestinoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoQualidadeRegra" ADD CONSTRAINT "GovernancaDadoQualidadeRegra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeRegra" ADD CONSTRAINT "GovernancaDadoQualidadeRegra_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeRegra" ADD CONSTRAINT "GovernancaDadoQualidadeRegra_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeRegra" ADD CONSTRAINT "GovernancaDadoQualidadeRegra_atualizadoPorUserId_fkey" FOREIGN KEY ("atualizadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoQualidadeExecucao" ADD CONSTRAINT "GovernancaDadoQualidadeExecucao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeExecucao" ADD CONSTRAINT "GovernancaDadoQualidadeExecucao_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "GovernancaDadoQualidadeRegra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GovernancaDadoQualidadeIssue" ADD CONSTRAINT "GovernancaDadoQualidadeIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeIssue" ADD CONSTRAINT "GovernancaDadoQualidadeIssue_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "GovernancaDadoAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeIssue" ADD CONSTRAINT "GovernancaDadoQualidadeIssue_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "GovernancaDadoQualidadeRegra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernancaDadoQualidadeIssue" ADD CONSTRAINT "GovernancaDadoQualidadeIssue_responsavelUserId_fkey" FOREIGN KEY ("responsavelUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

