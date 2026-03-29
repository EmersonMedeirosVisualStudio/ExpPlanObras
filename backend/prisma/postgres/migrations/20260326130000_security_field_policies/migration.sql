CREATE TABLE "SecurityFieldPolicy" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "caminhoCampo" TEXT NOT NULL,
    "efeitoCampo" TEXT NOT NULL,
    "estrategiaMascara" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "condicaoJson" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorUserId" INTEGER NOT NULL,
    "atualizadoPorUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityFieldPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityFieldPolicyTarget" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "tipoAlvo" TEXT NOT NULL,
    "userId" INTEGER,
    "perfilCodigo" TEXT,
    "permissao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityFieldPolicyTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecuritySensitiveDataAudit" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "recurso" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidadeId" INTEGER,
    "caminhoCampo" TEXT NOT NULL,
    "resultadoCampo" TEXT NOT NULL,
    "exportacao" BOOLEAN NOT NULL DEFAULT false,
    "motivoCodigo" TEXT,
    "contextoJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecuritySensitiveDataAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityFieldPolicy_tenantId_idx" ON "SecurityFieldPolicy"("tenantId");

CREATE INDEX "SecurityFieldPolicy_tenantId_recurso_acao_idx" ON "SecurityFieldPolicy"("tenantId", "recurso", "acao");

CREATE INDEX "SecurityFieldPolicy_criadoPorUserId_idx" ON "SecurityFieldPolicy"("criadoPorUserId");

CREATE INDEX "SecurityFieldPolicy_atualizadoPorUserId_idx" ON "SecurityFieldPolicy"("atualizadoPorUserId");

CREATE INDEX "SecurityFieldPolicyTarget_policyId_idx" ON "SecurityFieldPolicyTarget"("policyId");

CREATE INDEX "SecurityFieldPolicyTarget_tipoAlvo_idx" ON "SecurityFieldPolicyTarget"("tipoAlvo");

CREATE INDEX "SecurityFieldPolicyTarget_userId_idx" ON "SecurityFieldPolicyTarget"("userId");

CREATE INDEX "SecurityFieldPolicyTarget_perfilCodigo_idx" ON "SecurityFieldPolicyTarget"("perfilCodigo");

CREATE INDEX "SecuritySensitiveDataAudit_tenantId_userId_createdAt_idx" ON "SecuritySensitiveDataAudit"("tenantId", "userId", "createdAt");

CREATE INDEX "SecuritySensitiveDataAudit_tenantId_recurso_acao_createdAt_idx" ON "SecuritySensitiveDataAudit"("tenantId", "recurso", "acao", "createdAt");

ALTER TABLE "SecurityFieldPolicy" ADD CONSTRAINT "SecurityFieldPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityFieldPolicy" ADD CONSTRAINT "SecurityFieldPolicy_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityFieldPolicy" ADD CONSTRAINT "SecurityFieldPolicy_atualizadoPorUserId_fkey" FOREIGN KEY ("atualizadoPorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityFieldPolicyTarget" ADD CONSTRAINT "SecurityFieldPolicyTarget_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SecurityFieldPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecuritySensitiveDataAudit" ADD CONSTRAINT "SecuritySensitiveDataAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecuritySensitiveDataAudit" ADD CONSTRAINT "SecuritySensitiveDataAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

