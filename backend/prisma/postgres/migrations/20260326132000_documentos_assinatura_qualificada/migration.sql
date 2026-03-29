CREATE TABLE "DocumentoVersao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "documentoId" INTEGER NOT NULL,
    "numeroVersao" INTEGER NOT NULL DEFAULT 1,
    "urlOriginal" TEXT NOT NULL,
    "urlAssinado" TEXT,
    "hashSha256Original" TEXT,
    "hashSha256Assinado" TEXT,
    "tipoAssinaturaFinal" TEXT,
    "assinaturaQualificadaConcluida" BOOLEAN NOT NULL DEFAULT false,
    "verificacaoAssinaturaStatus" TEXT,
    "verificacaoAssinaturaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoVersao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaProvedor" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'SANDBOX',
    "baseUrl" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecretCriptografado" TEXT,
    "apiKeyCriptografada" TEXT,
    "configuracaoJson" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoAssinaturaProvedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaSolicitacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "documentoId" INTEGER NOT NULL,
    "versaoId" INTEGER NOT NULL,
    "provedorId" INTEGER NOT NULL,
    "tipoAssinatura" TEXT NOT NULL,
    "statusSolicitacao" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "providerEnvelopeId" TEXT,
    "providerDocumentId" TEXT,
    "providerStatus" TEXT,
    "exigeTodosSignatarios" BOOLEAN NOT NULL DEFAULT true,
    "callbackToken" TEXT,
    "linkAssinaturaExterno" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    "solicitanteUserId" INTEGER NOT NULL,
    "motivoErro" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoAssinaturaSolicitacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaSolicitacaoSignatario" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "solicitacaoId" INTEGER NOT NULL,
    "ordemAssinatura" INTEGER NOT NULL,
    "tipoSignatario" TEXT NOT NULL,
    "userId" INTEGER,
    "nomeSignatario" TEXT NOT NULL,
    "emailSignatario" TEXT NOT NULL,
    "documentoSignatario" TEXT,
    "papelSignatario" TEXT NOT NULL,
    "assinaturaObrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "statusSignatario" TEXT NOT NULL DEFAULT 'PENDENTE',
    "providerSignerId" TEXT,
    "autenticacaoExigida" TEXT,
    "assinadoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoAssinaturaSolicitacaoSignatario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaArtefato" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "solicitacaoId" INTEGER NOT NULL,
    "tipoArtefato" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER,
    "hashSha256" TEXT NOT NULL,
    "storagePath" TEXT,
    "url" TEXT,
    "data" BYTEA,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAssinaturaArtefato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaEvidencia" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "solicitacaoId" INTEGER NOT NULL,
    "signatarioId" INTEGER,
    "tipoEvidencia" TEXT NOT NULL,
    "valorTexto" TEXT,
    "valorJson" JSONB,
    "hashReferencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAssinaturaEvidencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoAssinaturaCallback" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "solicitacaoId" INTEGER,
    "provedorId" INTEGER NOT NULL,
    "providerEvento" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "statusProcessamento" TEXT NOT NULL DEFAULT 'PENDENTE',
    "mensagemResultado" TEXT,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "DocumentoAssinaturaCallback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentoVersao_documentoId_numeroVersao_key" ON "DocumentoVersao"("documentoId", "numeroVersao");
CREATE UNIQUE INDEX "DocumentoAssinaturaProvedor_tenantId_codigo_ambiente_key" ON "DocumentoAssinaturaProvedor"("tenantId", "codigo", "ambiente");

CREATE INDEX "DocumentoVersao_tenantId_idx" ON "DocumentoVersao"("tenantId");
CREATE INDEX "DocumentoVersao_documentoId_idx" ON "DocumentoVersao"("documentoId");

CREATE INDEX "DocumentoAssinaturaProvedor_tenantId_idx" ON "DocumentoAssinaturaProvedor"("tenantId");
CREATE INDEX "DocumentoAssinaturaProvedor_tenantId_tipo_idx" ON "DocumentoAssinaturaProvedor"("tenantId", "tipo");

CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId");
CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_statusSolicitacao_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId", "statusSolicitacao");
CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_documentoId_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId", "documentoId");
CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_versaoId_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId", "versaoId");
CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_provedorId_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId", "provedorId");
CREATE INDEX "DocumentoAssinaturaSolicitacao_tenantId_solicitanteUserId_idx" ON "DocumentoAssinaturaSolicitacao"("tenantId", "solicitanteUserId");

CREATE INDEX "DocumentoAssinaturaSolicitacaoSignatario_tenantId_idx" ON "DocumentoAssinaturaSolicitacaoSignatario"("tenantId");
CREATE INDEX "DocumentoAssinaturaSolicitacaoSignatario_solicitacaoId_idx" ON "DocumentoAssinaturaSolicitacaoSignatario"("solicitacaoId");
CREATE INDEX "DocumentoAssinaturaSolicitacaoSignatario_tenantId_statusSignatario_idx" ON "DocumentoAssinaturaSolicitacaoSignatario"("tenantId", "statusSignatario");
CREATE INDEX "DocumentoAssinaturaSolicitacaoSignatario_userId_idx" ON "DocumentoAssinaturaSolicitacaoSignatario"("userId");

CREATE INDEX "DocumentoAssinaturaArtefato_tenantId_idx" ON "DocumentoAssinaturaArtefato"("tenantId");
CREATE INDEX "DocumentoAssinaturaArtefato_solicitacaoId_idx" ON "DocumentoAssinaturaArtefato"("solicitacaoId");
CREATE INDEX "DocumentoAssinaturaArtefato_tenantId_tipoArtefato_idx" ON "DocumentoAssinaturaArtefato"("tenantId", "tipoArtefato");

CREATE INDEX "DocumentoAssinaturaEvidencia_tenantId_idx" ON "DocumentoAssinaturaEvidencia"("tenantId");
CREATE INDEX "DocumentoAssinaturaEvidencia_solicitacaoId_idx" ON "DocumentoAssinaturaEvidencia"("solicitacaoId");
CREATE INDEX "DocumentoAssinaturaEvidencia_signatarioId_idx" ON "DocumentoAssinaturaEvidencia"("signatarioId");
CREATE INDEX "DocumentoAssinaturaEvidencia_tenantId_tipoEvidencia_idx" ON "DocumentoAssinaturaEvidencia"("tenantId", "tipoEvidencia");

CREATE INDEX "DocumentoAssinaturaCallback_tenantId_idx" ON "DocumentoAssinaturaCallback"("tenantId");
CREATE INDEX "DocumentoAssinaturaCallback_provedorId_idx" ON "DocumentoAssinaturaCallback"("provedorId");
CREATE INDEX "DocumentoAssinaturaCallback_solicitacaoId_idx" ON "DocumentoAssinaturaCallback"("solicitacaoId");
CREATE INDEX "DocumentoAssinaturaCallback_tenantId_statusProcessamento_recebidoEm_idx" ON "DocumentoAssinaturaCallback"("tenantId", "statusProcessamento", "recebidoEm");

ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaProvedor" ADD CONSTRAINT "DocumentoAssinaturaProvedor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaSolicitacao" ADD CONSTRAINT "DocumentoAssinaturaSolicitacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacao" ADD CONSTRAINT "DocumentoAssinaturaSolicitacao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacao" ADD CONSTRAINT "DocumentoAssinaturaSolicitacao_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "DocumentoVersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacao" ADD CONSTRAINT "DocumentoAssinaturaSolicitacao_provedorId_fkey" FOREIGN KEY ("provedorId") REFERENCES "DocumentoAssinaturaProvedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacao" ADD CONSTRAINT "DocumentoAssinaturaSolicitacao_solicitanteUserId_fkey" FOREIGN KEY ("solicitanteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaSolicitacaoSignatario" ADD CONSTRAINT "DocumentoAssinaturaSolicitacaoSignatario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacaoSignatario" ADD CONSTRAINT "DocumentoAssinaturaSolicitacaoSignatario_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "DocumentoAssinaturaSolicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaSolicitacaoSignatario" ADD CONSTRAINT "DocumentoAssinaturaSolicitacaoSignatario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaArtefato" ADD CONSTRAINT "DocumentoAssinaturaArtefato_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaArtefato" ADD CONSTRAINT "DocumentoAssinaturaArtefato_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "DocumentoAssinaturaSolicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaEvidencia" ADD CONSTRAINT "DocumentoAssinaturaEvidencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaEvidencia" ADD CONSTRAINT "DocumentoAssinaturaEvidencia_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "DocumentoAssinaturaSolicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaEvidencia" ADD CONSTRAINT "DocumentoAssinaturaEvidencia_signatarioId_fkey" FOREIGN KEY ("signatarioId") REFERENCES "DocumentoAssinaturaSolicitacaoSignatario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentoAssinaturaCallback" ADD CONSTRAINT "DocumentoAssinaturaCallback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaCallback" ADD CONSTRAINT "DocumentoAssinaturaCallback_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "DocumentoAssinaturaSolicitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentoAssinaturaCallback" ADD CONSTRAINT "DocumentoAssinaturaCallback_provedorId_fkey" FOREIGN KEY ("provedorId") REFERENCES "DocumentoAssinaturaProvedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

