/*
  Warnings:

  - You are about to drop the column `type` on the `Custo` table. All the data in the column will be lost.
  - You are about to drop the column `assignedTo` on the `Tarefa` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Obra" ADD COLUMN "description" TEXT;
ALTER TABLE "Obra" ADD COLUMN "valorPrevisto" DECIMAL;

-- CreateTable
CREATE TABLE "ResponsavelTecnico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "professionalTitle" TEXT,
    "crea" TEXT,
    "cpf" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "ResponsavelTecnico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResponsavelObra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "obraId" INTEGER NOT NULL,
    "responsavelId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "notes" TEXT,
    CONSTRAINT "ResponsavelObra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResponsavelObra_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "ResponsavelTecnico" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Medicao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "obraId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "percentage" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Medicao_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "obraId" INTEGER NOT NULL,
    "medicaoId" INTEGER,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "documentNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pagamento_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_medicaoId_fkey" FOREIGN KEY ("medicaoId") REFERENCES "Medicao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Custo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Custo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Custo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Custo" ("amount", "date", "description", "id", "obraId", "tenantId") SELECT "amount", "date", "description", "id", "obraId", "tenantId" FROM "Custo";
DROP TABLE "Custo";
ALTER TABLE "new_Custo" RENAME TO "Custo";
CREATE INDEX "Custo_tenantId_idx" ON "Custo"("tenantId");
CREATE INDEX "Custo_obraId_idx" ON "Custo"("obraId");
CREATE TABLE "new_Tarefa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "dueDate" DATETIME,
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Tarefa_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tarefa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tarefa" ("description", "dueDate", "id", "obraId", "status", "tenantId", "title") SELECT "description", "dueDate", "id", "obraId", "status", "tenantId", "title" FROM "Tarefa";
DROP TABLE "Tarefa";
ALTER TABLE "new_Tarefa" RENAME TO "Tarefa";
CREATE INDEX "Tarefa_tenantId_idx" ON "Tarefa"("tenantId");
CREATE INDEX "Tarefa_obraId_idx" ON "Tarefa"("obraId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ResponsavelTecnico_tenantId_idx" ON "ResponsavelTecnico"("tenantId");

-- CreateIndex
CREATE INDEX "ResponsavelObra_obraId_idx" ON "ResponsavelObra"("obraId");

-- CreateIndex
CREATE INDEX "ResponsavelObra_responsavelId_idx" ON "ResponsavelObra"("responsavelId");

-- CreateIndex
CREATE INDEX "Medicao_obraId_idx" ON "Medicao"("obraId");

-- CreateIndex
CREATE INDEX "Pagamento_obraId_idx" ON "Pagamento"("obraId");

-- CreateIndex
CREATE INDEX "Pagamento_medicaoId_idx" ON "Pagamento"("medicaoId");
