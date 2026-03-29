CREATE TABLE "GrcRisco" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "categoriaRisco" TEXT NOT NULL,
  "modulo" TEXT,
  "processoNegocio" TEXT,
  "entidadeTipo" TEXT,
  "entidadeId" INTEGER,
  "ownerUserId" INTEGER,
  "statusRisco" TEXT NOT NULL,
  "impactoInerente" TEXT NOT NULL,
  "probabilidadeInerente" TEXT NOT NULL,
  "scoreInerente" INTEGER NOT NULL,
  "impactoResidual" TEXT,
  "probabilidadeResidual" TEXT,
  "scoreResidual" INTEGER,
  "apetiteScore" INTEGER,
  "toleranciaScore" INTEGER,
  "origemRisco" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcRisco_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrcRisco_tenantId_codigo_key" ON "GrcRisco"("tenantId","codigo");
CREATE INDEX "GrcRisco_tenantId_statusRisco_idx" ON "GrcRisco"("tenantId","statusRisco");
CREATE INDEX "GrcRisco_tenantId_categoriaRisco_idx" ON "GrcRisco"("tenantId","categoriaRisco");

CREATE TABLE "GrcRiscoAvaliacao" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "riscoId" INTEGER NOT NULL,
  "tipoAvaliacao" TEXT NOT NULL,
  "impacto" TEXT NOT NULL,
  "probabilidade" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "justificativa" TEXT,
  "avaliadoPor" INTEGER,
  "avaliadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrcRiscoAvaliacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcRiscoAvaliacao_tenantId_idx" ON "GrcRiscoAvaliacao"("tenantId");
CREATE INDEX "GrcRiscoAvaliacao_riscoId_idx" ON "GrcRiscoAvaliacao"("riscoId");

CREATE TABLE "GrcControle" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "categoriaControle" TEXT,
  "tipoControle" TEXT NOT NULL,
  "automacaoControle" TEXT NOT NULL,
  "frequenciaExecucao" TEXT,
  "ownerUserId" INTEGER,
  "executorTipo" TEXT,
  "evidenciaObrigatoria" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criticidade" TEXT NOT NULL,
  "objetivoControle" TEXT,
  "procedimentoExecucao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcControle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrcControle_tenantId_codigo_key" ON "GrcControle"("tenantId","codigo");
CREATE INDEX "GrcControle_tenantId_ativo_idx" ON "GrcControle"("tenantId","ativo");

CREATE TABLE "GrcRiscoControle" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "riscoId" INTEGER NOT NULL,
  "controleId" INTEGER NOT NULL,
  "papelControle" TEXT NOT NULL,
  "pesoMitigacao" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcRiscoControle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcRiscoControle_tenantId_idx" ON "GrcRiscoControle"("tenantId");
CREATE UNIQUE INDEX "GrcRiscoControle_riscoId_controleId_key" ON "GrcRiscoControle"("riscoId","controleId");

CREATE TABLE "GrcControleTeste" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "controleId" INTEGER NOT NULL,
  "tipoTeste" TEXT NOT NULL,
  "periodoReferencia" TEXT,
  "amostraJson" JSONB,
  "resultadoTeste" TEXT NOT NULL,
  "falhasIdentificadas" TEXT,
  "efetividadeScore" INTEGER,
  "executadoPor" INTEGER,
  "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revisorUserId" INTEGER,
  "revisadoEm" TIMESTAMP(3),
  "conclusao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcControleTeste_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcControleTeste_tenantId_idx" ON "GrcControleTeste"("tenantId");
CREATE INDEX "GrcControleTeste_controleId_idx" ON "GrcControleTeste"("controleId");

CREATE TABLE "GrcAuditoria" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipoAuditoria" TEXT NOT NULL,
  "statusAuditoria" TEXT NOT NULL,
  "escopoDescricao" TEXT,
  "ownerUserId" INTEGER,
  "auditorLiderUserId" INTEGER,
  "dataInicioPlanejada" TIMESTAMP(3),
  "dataFimPlanejada" TIMESTAMP(3),
  "dataInicioReal" TIMESTAMP(3),
  "dataFimReal" TIMESTAMP(3),
  "opiniaoFinal" TEXT,
  "ratingFinal" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcAuditoria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrcAuditoria_tenantId_codigo_key" ON "GrcAuditoria"("tenantId","codigo");
CREATE INDEX "GrcAuditoria_tenantId_statusAuditoria_idx" ON "GrcAuditoria"("tenantId","statusAuditoria");

CREATE TABLE "GrcAuditoriaItemEscopo" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "auditoriaId" INTEGER NOT NULL,
  "tipoItem" TEXT NOT NULL,
  "referenciaId" INTEGER,
  "descricao" TEXT,
  CONSTRAINT "GrcAuditoriaItemEscopo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcAuditoriaItemEscopo_tenantId_idx" ON "GrcAuditoriaItemEscopo"("tenantId");
CREATE INDEX "GrcAuditoriaItemEscopo_auditoriaId_idx" ON "GrcAuditoriaItemEscopo"("auditoriaId");

CREATE TABLE "GrcAchado" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "auditoriaId" INTEGER,
  "riscoId" INTEGER,
  "controleId" INTEGER,
  "incidenteId" INTEGER,
  "criseId" INTEGER,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "gravidade" TEXT NOT NULL,
  "statusAchado" TEXT NOT NULL,
  "causaRaiz" TEXT,
  "impactoResumo" TEXT,
  "recomendacao" TEXT,
  "ownerUserId" INTEGER,
  "prazoTratativaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcAchado_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcAchado_tenantId_idx" ON "GrcAchado"("tenantId");
CREATE INDEX "GrcAchado_tenantId_statusAchado_idx" ON "GrcAchado"("tenantId","statusAchado");
CREATE INDEX "GrcAchado_tenantId_gravidade_idx" ON "GrcAchado"("tenantId","gravidade");

CREATE TABLE "GrcPlanoAcao" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "origemTipo" TEXT NOT NULL,
  "origemId" INTEGER NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "statusPlano" TEXT NOT NULL,
  "criticidade" TEXT NOT NULL,
  "ownerUserId" INTEGER,
  "aprovadorUserId" INTEGER,
  "dataLimite" TIMESTAMP(3),
  "concluidoEm" TIMESTAMP(3),
  "resultadoEsperado" TEXT,
  "criterioAceite" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcPlanoAcao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcPlanoAcao_tenantId_idx" ON "GrcPlanoAcao"("tenantId");
CREATE INDEX "GrcPlanoAcao_tenantId_statusPlano_idx" ON "GrcPlanoAcao"("tenantId","statusPlano");

CREATE TABLE "GrcPlanoAcaoItem" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "planoAcaoId" INTEGER NOT NULL,
  "ordemExecucao" INTEGER NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "statusItem" TEXT NOT NULL,
  "responsavelUserId" INTEGER,
  "dataLimite" TIMESTAMP(3),
  "concluidoEm" TIMESTAMP(3),
  CONSTRAINT "GrcPlanoAcaoItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcPlanoAcaoItem_tenantId_idx" ON "GrcPlanoAcaoItem"("tenantId");
CREATE INDEX "GrcPlanoAcaoItem_planoAcaoId_idx" ON "GrcPlanoAcaoItem"("planoAcaoId");
CREATE UNIQUE INDEX "GrcPlanoAcaoItem_planoAcaoId_ordemExecucao_key" ON "GrcPlanoAcaoItem"("planoAcaoId","ordemExecucao");

CREATE TABLE "GrcEvidencia" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "referenciaTipo" TEXT NOT NULL,
  "referenciaId" INTEGER NOT NULL,
  "tipoEvidencia" TEXT NOT NULL,
  "titulo" TEXT,
  "descricao" TEXT,
  "arquivoPath" TEXT,
  "hashSha256" TEXT,
  "coletadoPor" INTEGER,
  "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcEvidencia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcEvidencia_tenantId_idx" ON "GrcEvidencia"("tenantId");
CREATE INDEX "GrcEvidencia_tenantId_referenciaTipo_referenciaId_idx" ON "GrcEvidencia"("tenantId","referenciaTipo","referenciaId");

CREATE TABLE "GrcControleMetrica" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "controleId" INTEGER NOT NULL,
  "chaveMetrica" TEXT NOT NULL,
  "bucketInicio" TIMESTAMP(3) NOT NULL,
  "bucketFim" TIMESTAMP(3) NOT NULL,
  "valorNumero" DOUBLE PRECISION,
  "limiteAlerta" DOUBLE PRECISION,
  "limiteCritico" DOUBLE PRECISION,
  "statusMetrica" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcControleMetrica_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcControleMetrica_tenantId_idx" ON "GrcControleMetrica"("tenantId");
CREATE INDEX "GrcControleMetrica_tenantId_chaveMetrica_bucketInicio_idx" ON "GrcControleMetrica"("tenantId","chaveMetrica","bucketInicio");

CREATE TABLE "GrcMatrizRiscoSnapshot" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "periodoRef" TEXT NOT NULL,
  "categoriaRisco" TEXT NOT NULL,
  "quantidadeBaixo" INTEGER NOT NULL,
  "quantidadeMedio" INTEGER NOT NULL,
  "quantidadeAlto" INTEGER NOT NULL,
  "quantidadeCritico" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrcMatrizRiscoSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrcMatrizRiscoSnapshot_tenantId_idx" ON "GrcMatrizRiscoSnapshot"("tenantId");
CREATE INDEX "GrcMatrizRiscoSnapshot_tenantId_periodoRef_idx" ON "GrcMatrizRiscoSnapshot"("tenantId","periodoRef");

ALTER TABLE "GrcRisco" ADD CONSTRAINT "GrcRisco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcRisco" ADD CONSTRAINT "GrcRisco_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcRiscoAvaliacao" ADD CONSTRAINT "GrcRiscoAvaliacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcRiscoAvaliacao" ADD CONSTRAINT "GrcRiscoAvaliacao_riscoId_fkey" FOREIGN KEY ("riscoId") REFERENCES "GrcRisco"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcRiscoAvaliacao" ADD CONSTRAINT "GrcRiscoAvaliacao_avaliadoPor_fkey" FOREIGN KEY ("avaliadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcControle" ADD CONSTRAINT "GrcControle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcControle" ADD CONSTRAINT "GrcControle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcRiscoControle" ADD CONSTRAINT "GrcRiscoControle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcRiscoControle" ADD CONSTRAINT "GrcRiscoControle_riscoId_fkey" FOREIGN KEY ("riscoId") REFERENCES "GrcRisco"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcRiscoControle" ADD CONSTRAINT "GrcRiscoControle_controleId_fkey" FOREIGN KEY ("controleId") REFERENCES "GrcControle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrcControleTeste" ADD CONSTRAINT "GrcControleTeste_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcControleTeste" ADD CONSTRAINT "GrcControleTeste_controleId_fkey" FOREIGN KEY ("controleId") REFERENCES "GrcControle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcControleTeste" ADD CONSTRAINT "GrcControleTeste_executadoPor_fkey" FOREIGN KEY ("executadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcControleTeste" ADD CONSTRAINT "GrcControleTeste_revisorUserId_fkey" FOREIGN KEY ("revisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcAuditoria" ADD CONSTRAINT "GrcAuditoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcAuditoria" ADD CONSTRAINT "GrcAuditoria_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcAuditoria" ADD CONSTRAINT "GrcAuditoria_auditorLiderUserId_fkey" FOREIGN KEY ("auditorLiderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcAuditoriaItemEscopo" ADD CONSTRAINT "GrcAuditoriaItemEscopo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcAuditoriaItemEscopo" ADD CONSTRAINT "GrcAuditoriaItemEscopo_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "GrcAuditoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrcAchado" ADD CONSTRAINT "GrcAchado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcAchado" ADD CONSTRAINT "GrcAchado_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "GrcAuditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcAchado" ADD CONSTRAINT "GrcAchado_riscoId_fkey" FOREIGN KEY ("riscoId") REFERENCES "GrcRisco"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcAchado" ADD CONSTRAINT "GrcAchado_controleId_fkey" FOREIGN KEY ("controleId") REFERENCES "GrcControle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcAchado" ADD CONSTRAINT "GrcAchado_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcPlanoAcao" ADD CONSTRAINT "GrcPlanoAcao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcPlanoAcao" ADD CONSTRAINT "GrcPlanoAcao_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrcPlanoAcao" ADD CONSTRAINT "GrcPlanoAcao_aprovadorUserId_fkey" FOREIGN KEY ("aprovadorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcPlanoAcaoItem" ADD CONSTRAINT "GrcPlanoAcaoItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcPlanoAcaoItem" ADD CONSTRAINT "GrcPlanoAcaoItem_planoAcaoId_fkey" FOREIGN KEY ("planoAcaoId") REFERENCES "GrcPlanoAcao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcPlanoAcaoItem" ADD CONSTRAINT "GrcPlanoAcaoItem_responsavelUserId_fkey" FOREIGN KEY ("responsavelUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcEvidencia" ADD CONSTRAINT "GrcEvidencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcEvidencia" ADD CONSTRAINT "GrcEvidencia_coletadoPor_fkey" FOREIGN KEY ("coletadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrcControleMetrica" ADD CONSTRAINT "GrcControleMetrica_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrcControleMetrica" ADD CONSTRAINT "GrcControleMetrica_controleId_fkey" FOREIGN KEY ("controleId") REFERENCES "GrcControle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrcMatrizRiscoSnapshot" ADD CONSTRAINT "GrcMatrizRiscoSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
