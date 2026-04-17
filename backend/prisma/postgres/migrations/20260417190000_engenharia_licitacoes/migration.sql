CREATE TABLE "EngenhariaLicitacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "orgaoContratante" TEXT,
    "objeto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EM_ANALISE',
    "fase" TEXT,
    "dataAbertura" TIMESTAMP(3),
    "dataEncerramento" TIMESTAMP(3),
    "orcamentoId" INTEGER,
    "responsavelNome" TEXT,
    "portalUrl" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaLicitacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoChecklistItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "diasAlerta" INTEGER NOT NULL DEFAULT 30,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaLicitacaoChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaDocumentoEmpresa" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "numero" TEXT,
    "orgaoEmissor" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "dataValidade" TIMESTAMP(3),
    "documentoRegistroId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaDocumentoEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoDocumento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "documentoEmpresaId" INTEGER NOT NULL,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaLicitacaoDocumento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaAcervoEmpresa" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'ATESTADO',
    "numeroDocumento" TEXT,
    "orgaoEmissor" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "nomeObra" TEXT,
    "contratante" TEXT,
    "localObra" TEXT,
    "valorObra" DECIMAL(14,2),
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "categoria" TEXT,
    "subcategoria" TEXT,
    "porteObra" TEXT,
    "documentoRegistroId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaAcervoEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoAcervo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "acervoEmpresaId" INTEGER NOT NULL,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaLicitacaoAcervo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoAndamentoEvento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "dataEvento" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "documentoRegistroId" INTEGER,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaLicitacaoAndamentoEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoComunicacao" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "direcao" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'EMAIL',
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "assunto" TEXT NOT NULL,
    "descricao" TEXT,
    "documentoRegistroId" INTEGER,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaLicitacaoComunicacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngenhariaLicitacaoRecurso" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "licitacaoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "fase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "dataEnvio" TIMESTAMP(3),
    "prazoResposta" TIMESTAMP(3),
    "protocolo" TEXT,
    "descricao" TEXT,
    "documentoRegistroId" INTEGER,
    "usuarioCriadorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaLicitacaoRecurso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngenhariaLicitacaoDocumento_uk" ON "EngenhariaLicitacaoDocumento"("tenantId", "licitacaoId", "documentoEmpresaId");
CREATE UNIQUE INDEX "EngenhariaLicitacaoAcervo_uk" ON "EngenhariaLicitacaoAcervo"("tenantId", "licitacaoId", "acervoEmpresaId");

CREATE INDEX "EngenhariaLicitacao_tenantId_idx" ON "EngenhariaLicitacao"("tenantId");
CREATE INDEX "EngenhariaLicitacao_tenantId_status_idx" ON "EngenhariaLicitacao"("tenantId", "status");

CREATE INDEX "EngenhariaLicitacaoChecklistItem_tenantId_idx" ON "EngenhariaLicitacaoChecklistItem"("tenantId");
CREATE INDEX "EngenhariaLicitacaoChecklistItem_tenantId_licitacaoId_idx" ON "EngenhariaLicitacaoChecklistItem"("tenantId", "licitacaoId");

CREATE INDEX "EngenhariaDocumentoEmpresa_tenantId_idx" ON "EngenhariaDocumentoEmpresa"("tenantId");
CREATE INDEX "EngenhariaDocumentoEmpresa_tenantId_categoria_idx" ON "EngenhariaDocumentoEmpresa"("tenantId", "categoria");

CREATE INDEX "EngenhariaLicitacaoDocumento_tenantId_idx" ON "EngenhariaLicitacaoDocumento"("tenantId");
CREATE INDEX "EngenhariaLicitacaoDocumento_tenantId_licitacaoId_idx" ON "EngenhariaLicitacaoDocumento"("tenantId", "licitacaoId");

CREATE INDEX "EngenhariaAcervoEmpresa_tenantId_idx" ON "EngenhariaAcervoEmpresa"("tenantId");
CREATE INDEX "EngenhariaAcervoEmpresa_tenantId_tipo_idx" ON "EngenhariaAcervoEmpresa"("tenantId", "tipo");

CREATE INDEX "EngenhariaLicitacaoAcervo_tenantId_idx" ON "EngenhariaLicitacaoAcervo"("tenantId");
CREATE INDEX "EngenhariaLicitacaoAcervo_tenantId_licitacaoId_idx" ON "EngenhariaLicitacaoAcervo"("tenantId", "licitacaoId");

CREATE INDEX "EngenhariaLicitacaoAndamentoEvento_tenantId_idx" ON "EngenhariaLicitacaoAndamentoEvento"("tenantId");
CREATE INDEX "EngenhariaLicitacaoAndamentoEvento_tenantId_licitacaoId_dataEvento_idx" ON "EngenhariaLicitacaoAndamentoEvento"("tenantId", "licitacaoId", "dataEvento");

CREATE INDEX "EngenhariaLicitacaoComunicacao_tenantId_idx" ON "EngenhariaLicitacaoComunicacao"("tenantId");
CREATE INDEX "EngenhariaLicitacaoComunicacao_tenantId_licitacaoId_dataReferencia_idx" ON "EngenhariaLicitacaoComunicacao"("tenantId", "licitacaoId", "dataReferencia");

CREATE INDEX "EngenhariaLicitacaoRecurso_tenantId_idx" ON "EngenhariaLicitacaoRecurso"("tenantId");
CREATE INDEX "EngenhariaLicitacaoRecurso_tenantId_licitacaoId_idx" ON "EngenhariaLicitacaoRecurso"("tenantId", "licitacaoId");

ALTER TABLE "EngenhariaLicitacao" ADD CONSTRAINT "EngenhariaLicitacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoChecklistItem" ADD CONSTRAINT "EngenhariaLicitacaoChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoChecklistItem" ADD CONSTRAINT "EngenhariaLicitacaoChecklistItem_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaDocumentoEmpresa" ADD CONSTRAINT "EngenhariaDocumentoEmpresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoDocumento" ADD CONSTRAINT "EngenhariaLicitacaoDocumento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoDocumento" ADD CONSTRAINT "EngenhariaLicitacaoDocumento_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoDocumento" ADD CONSTRAINT "EngenhariaLicitacaoDocumento_documentoEmpresaId_fkey" FOREIGN KEY ("documentoEmpresaId") REFERENCES "EngenhariaDocumentoEmpresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaAcervoEmpresa" ADD CONSTRAINT "EngenhariaAcervoEmpresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoAcervo" ADD CONSTRAINT "EngenhariaLicitacaoAcervo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoAcervo" ADD CONSTRAINT "EngenhariaLicitacaoAcervo_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoAcervo" ADD CONSTRAINT "EngenhariaLicitacaoAcervo_acervoEmpresaId_fkey" FOREIGN KEY ("acervoEmpresaId") REFERENCES "EngenhariaAcervoEmpresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoAndamentoEvento" ADD CONSTRAINT "EngenhariaLicitacaoAndamentoEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoAndamentoEvento" ADD CONSTRAINT "EngenhariaLicitacaoAndamentoEvento_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoComunicacao" ADD CONSTRAINT "EngenhariaLicitacaoComunicacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoComunicacao" ADD CONSTRAINT "EngenhariaLicitacaoComunicacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaLicitacaoRecurso" ADD CONSTRAINT "EngenhariaLicitacaoRecurso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaLicitacaoRecurso" ADD CONSTRAINT "EngenhariaLicitacaoRecurso_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "EngenhariaLicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

