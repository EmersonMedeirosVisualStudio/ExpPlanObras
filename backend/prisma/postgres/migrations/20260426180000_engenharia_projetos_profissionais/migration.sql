-- AlterTable
ALTER TABLE "ResponsavelTecnico" ADD COLUMN "conselho" TEXT;
ALTER TABLE "ResponsavelTecnico" ADD COLUMN "numeroRegistro" TEXT;

-- CreateTable
CREATE TABLE "EngenhariaProjeto" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "endereco" TEXT,
    "descricao" TEXT,
    "tipo" TEXT,
    "numeroProjeto" TEXT,
    "revisao" TEXT,
    "status" TEXT,
    "dataProjeto" TIMESTAMP(3),
    "dataAprovacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngenhariaObraProjeto" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "obraId" INTEGER NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaObraProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngenhariaProjetoResponsavel" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "responsavelId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "abrangencia" TEXT,
    "numeroDocumento" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaProjetoResponsavel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngenhariaProjeto_tenantId_idx" ON "EngenhariaProjeto"("tenantId");
CREATE INDEX "EngenhariaProjeto_tenantId_titulo_idx" ON "EngenhariaProjeto"("tenantId", "titulo");

-- CreateIndex
CREATE UNIQUE INDEX "EngenhariaObraProjeto_tenantId_obraId_projetoId_key" ON "EngenhariaObraProjeto"("tenantId", "obraId", "projetoId");
CREATE INDEX "EngenhariaObraProjeto_tenantId_idx" ON "EngenhariaObraProjeto"("tenantId");
CREATE INDEX "EngenhariaObraProjeto_obraId_idx" ON "EngenhariaObraProjeto"("obraId");
CREATE INDEX "EngenhariaObraProjeto_projetoId_idx" ON "EngenhariaObraProjeto"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "EngenhariaProjetoResponsavel_tenantId_projetoId_responsavelId_tipo_key" ON "EngenhariaProjetoResponsavel"("tenantId", "projetoId", "responsavelId", "tipo");
CREATE INDEX "EngenhariaProjetoResponsavel_tenantId_idx" ON "EngenhariaProjetoResponsavel"("tenantId");
CREATE INDEX "EngenhariaProjetoResponsavel_projetoId_idx" ON "EngenhariaProjetoResponsavel"("projetoId");
CREATE INDEX "EngenhariaProjetoResponsavel_responsavelId_idx" ON "EngenhariaProjetoResponsavel"("responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsavelTecnico_tenantId_conselho_numeroRegistro_key" ON "ResponsavelTecnico"("tenantId", "conselho", "numeroRegistro");

-- AddForeignKey
ALTER TABLE "EngenhariaProjeto" ADD CONSTRAINT "EngenhariaProjeto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngenhariaObraProjeto" ADD CONSTRAINT "EngenhariaObraProjeto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaObraProjeto" ADD CONSTRAINT "EngenhariaObraProjeto_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaObraProjeto" ADD CONSTRAINT "EngenhariaObraProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "EngenhariaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngenhariaProjetoResponsavel" ADD CONSTRAINT "EngenhariaProjetoResponsavel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoResponsavel" ADD CONSTRAINT "EngenhariaProjetoResponsavel_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "EngenhariaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoResponsavel" ADD CONSTRAINT "EngenhariaProjetoResponsavel_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "ResponsavelTecnico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
