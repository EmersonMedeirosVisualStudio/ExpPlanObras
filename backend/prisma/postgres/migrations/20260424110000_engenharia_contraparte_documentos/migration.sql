CREATE TABLE "EngenhariaContraparteDocumento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "contraparteId" INTEGER NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" INTEGER,
    CONSTRAINT "EngenhariaContraparteDocumento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EngenhariaContraparteDocumento_tenantId_idx" ON "EngenhariaContraparteDocumento"("tenantId");
CREATE INDEX "EngenhariaContraparteDocumento_tenantId_contraparteId_idx" ON "EngenhariaContraparteDocumento"("tenantId", "contraparteId");

ALTER TABLE "EngenhariaContraparteDocumento" ADD CONSTRAINT "EngenhariaContraparteDocumento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaContraparteDocumento" ADD CONSTRAINT "EngenhariaContraparteDocumento_contraparteId_fkey" FOREIGN KEY ("contraparteId") REFERENCES "EngenhariaContraparte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
