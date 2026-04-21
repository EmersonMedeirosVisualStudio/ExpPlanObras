CREATE TABLE "ContratoEvento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "tipoOrigem" TEXT NOT NULL DEFAULT 'CONTRATO',
    "origemId" INTEGER,
    "tipoEvento" TEXT NOT NULL DEFAULT 'INFO',
    "descricao" TEXT NOT NULL,
    "observacaoTexto" TEXT,
    "nivelObservacao" TEXT,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContratoEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContratoEventoAnexo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" INTEGER,
    CONSTRAINT "ContratoEventoAnexo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContratoEvento_tenantId_idx" ON "ContratoEvento"("tenantId");
CREATE INDEX "ContratoEvento_contratoId_idx" ON "ContratoEvento"("contratoId");
CREATE INDEX "ContratoEvento_tenantId_contratoId_createdAt_idx" ON "ContratoEvento"("tenantId", "contratoId", "createdAt");

CREATE INDEX "ContratoEventoAnexo_tenantId_idx" ON "ContratoEventoAnexo"("tenantId");
CREATE INDEX "ContratoEventoAnexo_contratoId_idx" ON "ContratoEventoAnexo"("contratoId");
CREATE INDEX "ContratoEventoAnexo_eventoId_idx" ON "ContratoEventoAnexo"("eventoId");

ALTER TABLE "ContratoEvento" ADD CONSTRAINT "ContratoEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoEvento" ADD CONSTRAINT "ContratoEvento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratoEventoAnexo" ADD CONSTRAINT "ContratoEventoAnexo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoEventoAnexo" ADD CONSTRAINT "ContratoEventoAnexo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoEventoAnexo" ADD CONSTRAINT "ContratoEventoAnexo_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "ContratoEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

