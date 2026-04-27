-- CreateTable
CREATE TABLE "EngenhariaProjetoRascunho" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngenhariaProjetoRascunho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngenhariaProjetoRascunhoShare" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "rascunhoId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "permissao" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngenhariaProjetoRascunhoShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngenhariaProjetoRascunho_tenantId_idx" ON "EngenhariaProjetoRascunho"("tenantId");
CREATE INDEX "EngenhariaProjetoRascunho_tenantId_projetoId_idx" ON "EngenhariaProjetoRascunho"("tenantId", "projetoId");
CREATE INDEX "EngenhariaProjetoRascunho_tenantId_ownerUserId_idx" ON "EngenhariaProjetoRascunho"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "EngenhariaProjetoRascunhoShare_tenantId_idx" ON "EngenhariaProjetoRascunhoShare"("tenantId");
CREATE INDEX "EngenhariaProjetoRascunhoShare_rascunhoId_idx" ON "EngenhariaProjetoRascunhoShare"("rascunhoId");
CREATE INDEX "EngenhariaProjetoRascunhoShare_userId_idx" ON "EngenhariaProjetoRascunhoShare"("userId");

-- CreateUnique
CREATE UNIQUE INDEX "EngenhariaProjetoRascunhoShare_tenantId_rascunhoId_userId_key" ON "EngenhariaProjetoRascunhoShare"("tenantId", "rascunhoId", "userId");

-- AddForeignKey
ALTER TABLE "EngenhariaProjetoRascunho" ADD CONSTRAINT "EngenhariaProjetoRascunho_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoRascunho" ADD CONSTRAINT "EngenhariaProjetoRascunho_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "EngenhariaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoRascunho" ADD CONSTRAINT "EngenhariaProjetoRascunho_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngenhariaProjetoRascunhoShare" ADD CONSTRAINT "EngenhariaProjetoRascunhoShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoRascunhoShare" ADD CONSTRAINT "EngenhariaProjetoRascunhoShare_rascunhoId_fkey" FOREIGN KEY ("rascunhoId") REFERENCES "EngenhariaProjetoRascunho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngenhariaProjetoRascunhoShare" ADD CONSTRAINT "EngenhariaProjetoRascunhoShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
