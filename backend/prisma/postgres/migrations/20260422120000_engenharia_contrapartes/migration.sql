CREATE TABLE "EngenhariaContraparte" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "nomeRazao" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "classificacaoStatus" TEXT NOT NULL DEFAULT 'EM_AVALIACAO',
    "observacao" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "usuarioCriadorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaContraparte_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaContraparteAvaliacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contraparteId" INTEGER NOT NULL,
    "nota" INTEGER,
    "comentario" TEXT,
    "usuarioCriadorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaContraparteAvaliacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaContraparteOcorrencia" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contraparteId" INTEGER NOT NULL,
    "contratoLocacaoId" INTEGER,
    "tipo" TEXT,
    "gravidade" TEXT NOT NULL DEFAULT 'MEDIA',
    "dataOcorrencia" TIMESTAMP(3),
    "descricao" TEXT NOT NULL,
    "usuarioCriadorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaContraparteOcorrencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EngenhariaContraparte_tenantId_idx" ON "EngenhariaContraparte"("tenantId");
CREATE INDEX "EngenhariaContraparte_tenantId_tipo_idx" ON "EngenhariaContraparte"("tenantId", "tipo");
CREATE INDEX "EngenhariaContraparte_tenantId_status_idx" ON "EngenhariaContraparte"("tenantId", "status");
CREATE INDEX "EngenhariaContraparte_tenantId_classificacaoStatus_idx" ON "EngenhariaContraparte"("tenantId", "classificacaoStatus");
CREATE INDEX "EngenhariaContraparte_tenantId_documento_idx" ON "EngenhariaContraparte"("tenantId", "documento");
CREATE INDEX "EngenhariaContraparte_tenantId_cidade_idx" ON "EngenhariaContraparte"("tenantId", "cidade");
CREATE INDEX "EngenhariaContraparte_tenantId_uf_idx" ON "EngenhariaContraparte"("tenantId", "uf");

CREATE INDEX "EngenhariaContraparteAvaliacao_tenantId_idx" ON "EngenhariaContraparteAvaliacao"("tenantId");
CREATE INDEX "EngenhariaContraparteAvaliacao_tenantId_contraparteId_idx" ON "EngenhariaContraparteAvaliacao"("tenantId", "contraparteId");

CREATE INDEX "EngenhariaContraparteOcorrencia_tenantId_idx" ON "EngenhariaContraparteOcorrencia"("tenantId");
CREATE INDEX "EngenhariaContraparteOcorrencia_tenantId_contraparteId_idx" ON "EngenhariaContraparteOcorrencia"("tenantId", "contraparteId");
CREATE INDEX "EngenhariaContraparteOcorrencia_tenantId_gravidade_idx" ON "EngenhariaContraparteOcorrencia"("tenantId", "gravidade");

ALTER TABLE "EngenhariaContraparte" ADD CONSTRAINT "EngenhariaContraparte_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaContraparteAvaliacao" ADD CONSTRAINT "EngenhariaContraparteAvaliacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaContraparteAvaliacao" ADD CONSTRAINT "EngenhariaContraparteAvaliacao_contraparteId_fkey" FOREIGN KEY ("contraparteId") REFERENCES "EngenhariaContraparte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaContraparteOcorrencia" ADD CONSTRAINT "EngenhariaContraparteOcorrencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaContraparteOcorrencia" ADD CONSTRAINT "EngenhariaContraparteOcorrencia_contraparteId_fkey" FOREIGN KEY ("contraparteId") REFERENCES "EngenhariaContraparte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
