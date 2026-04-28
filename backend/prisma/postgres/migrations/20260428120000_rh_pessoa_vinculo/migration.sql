-- CreateTable
CREATE TABLE "Pessoa" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "rg" TEXT,
    "titulo" TEXT,
    "nomeMae" TEXT,
    "nomePai" TEXT,
    "telefoneWhatsapp" TEXT,
    "matriculaBase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PessoaVinculo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "pessoaId" INTEGER NOT NULL,
    "tipoVinculo" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "matricula" TEXT,
    "funcao" TEXT,
    "empresaContraparteId" INTEGER,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PessoaVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pessoa_tenantId_idx" ON "Pessoa"("tenantId");

-- CreateIndex
CREATE INDEX "Pessoa_tenantId_nomeCompleto_idx" ON "Pessoa"("tenantId", "nomeCompleto");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_tenantId_cpf_key" ON "Pessoa"("tenantId", "cpf");

-- CreateIndex
CREATE INDEX "PessoaVinculo_tenantId_idx" ON "PessoaVinculo"("tenantId");

-- CreateIndex
CREATE INDEX "PessoaVinculo_tenantId_pessoaId_idx" ON "PessoaVinculo"("tenantId", "pessoaId");

-- CreateIndex
CREATE INDEX "PessoaVinculo_tenantId_tipoVinculo_idx" ON "PessoaVinculo"("tenantId", "tipoVinculo");

-- CreateIndex
CREATE INDEX "PessoaVinculo_tenantId_tipoVinculo_dataFim_idx" ON "PessoaVinculo"("tenantId", "tipoVinculo", "dataFim");

-- CreateIndex
CREATE UNIQUE INDEX "PessoaVinculo_tenantId_matricula_key" ON "PessoaVinculo"("tenantId", "matricula");

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaVinculo" ADD CONSTRAINT "PessoaVinculo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaVinculo" ADD CONSTRAINT "PessoaVinculo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaVinculo" ADD CONSTRAINT "PessoaVinculo_empresaContraparteId_fkey" FOREIGN KEY ("empresaContraparteId") REFERENCES "EngenhariaContraparte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Pessoa from existing Funcionario
INSERT INTO "Pessoa" ("id", "tenantId", "nomeCompleto", "cpf", "telefoneWhatsapp", "matriculaBase", "createdAt", "updatedAt")
SELECT f."id", f."tenantId", f."nomeCompleto", f."cpf", f."telefone", f."matricula", f."createdAt", f."updatedAt"
FROM "Funcionario" f
ON CONFLICT ("tenantId", "cpf") DO NOTHING;

-- Backfill Vinculo (FUNCIONARIO) from existing Funcionario
INSERT INTO "PessoaVinculo" ("tenantId", "pessoaId", "tipoVinculo", "sequencia", "matricula", "funcao", "dataInicio", "dataFim", "ativo", "createdAt", "updatedAt")
SELECT f."tenantId", p."id", 'FUNCIONARIO', 1, f."matricula", f."cargo", f."dataAdmissao", NULL, f."ativo", f."createdAt", f."updatedAt"
FROM "Funcionario" f
INNER JOIN "Pessoa" p ON p."tenantId" = f."tenantId" AND p."cpf" = f."cpf"
ON CONFLICT ("tenantId", "matricula") DO NOTHING;

-- Ensure Pessoa sequence is aligned after explicit inserts
SELECT setval(pg_get_serial_sequence('"Pessoa"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "Pessoa"), true);
