-- CreateTable
CREATE TABLE "EngenhariaProjetoAnexo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hashSha256" TEXT,
    "data" BYTEA NOT NULL,
    "anotacoesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaProjetoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngenhariaProjetoAnexo_tenantId_idx" ON "EngenhariaProjetoAnexo"("tenantId");
CREATE INDEX "EngenhariaProjetoAnexo_projetoId_idx" ON "EngenhariaProjetoAnexo"("projetoId");

-- AddForeignKey
ALTER TABLE "EngenhariaProjetoAnexo" ADD CONSTRAINT "EngenhariaProjetoAnexo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoAnexo" ADD CONSTRAINT "EngenhariaProjetoAnexo_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "EngenhariaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
