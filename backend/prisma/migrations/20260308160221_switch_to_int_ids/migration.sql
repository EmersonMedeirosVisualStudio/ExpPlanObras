/*
  Warnings:

  - The primary key for the `Custo` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Custo` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `obraId` on the `Custo` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `Custo` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Documento` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Documento` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `obraId` on the `Documento` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `Documento` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Etapa` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Etapa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `obraId` on the `Etapa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `Etapa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Obra` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Obra` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `Obra` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Tarefa` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `assignedTo` on the `Tarefa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `Tarefa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `obraId` on the `Tarefa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `Tarefa` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Tenant` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `Tenant` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `tenantId` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Custo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Custo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Custo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Custo" ("amount", "date", "description", "id", "obraId", "tenantId", "type") SELECT "amount", "date", "description", "id", "obraId", "tenantId", "type" FROM "Custo";
DROP TABLE "Custo";
ALTER TABLE "new_Custo" RENAME TO "Custo";
CREATE INDEX "Custo_tenantId_idx" ON "Custo"("tenantId");
CREATE INDEX "Custo_obraId_idx" ON "Custo"("obraId");
CREATE TABLE "new_Documento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Documento_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Documento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Documento" ("id", "name", "obraId", "tenantId", "type", "uploadedAt", "url") SELECT "id", "name", "obraId", "tenantId", "type", "uploadedAt", "url" FROM "Documento";
DROP TABLE "Documento";
ALTER TABLE "new_Documento" RENAME TO "Documento";
CREATE INDEX "Documento_tenantId_idx" ON "Documento"("tenantId");
CREATE INDEX "Documento_obraId_idx" ON "Documento"("obraId");
CREATE TABLE "new_Etapa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    CONSTRAINT "Etapa_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Etapa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Etapa" ("endDate", "id", "name", "obraId", "startDate", "status", "tenantId") SELECT "endDate", "id", "name", "obraId", "startDate", "status", "tenantId" FROM "Etapa";
DROP TABLE "Etapa";
ALTER TABLE "new_Etapa" RENAME TO "Etapa";
CREATE INDEX "Etapa_tenantId_idx" ON "Etapa"("tenantId");
CREATE INDEX "Etapa_obraId_idx" ON "Etapa"("obraId");
CREATE TABLE "new_Obra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANEJAMENTO',
    "tenantId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Obra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Obra" ("address", "createdAt", "id", "name", "status", "tenantId", "updatedAt") SELECT "address", "createdAt", "id", "name", "status", "tenantId", "updatedAt" FROM "Obra";
DROP TABLE "Obra";
ALTER TABLE "new_Obra" RENAME TO "Obra";
CREATE INDEX "Obra_tenantId_idx" ON "Obra"("tenantId");
CREATE TABLE "new_Tarefa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "obraId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "dueDate" DATETIME,
    "assignedTo" INTEGER,
    CONSTRAINT "Tarefa_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tarefa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tarefa" ("assignedTo", "description", "dueDate", "id", "obraId", "status", "tenantId", "title") SELECT "assignedTo", "description", "dueDate", "id", "obraId", "status", "tenantId", "title" FROM "Tarefa";
DROP TABLE "Tarefa";
ALTER TABLE "new_Tarefa" RENAME TO "Tarefa";
CREATE INDEX "Tarefa_tenantId_idx" ON "Tarefa"("tenantId");
CREATE INDEX "Tarefa_obraId_idx" ON "Tarefa"("obraId");
CREATE TABLE "new_Tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tenant" ("createdAt", "id", "name", "slug", "updatedAt") SELECT "createdAt", "id", "name", "slug", "updatedAt" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "tenantId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role", "tenantId", "updatedAt") SELECT "createdAt", "email", "id", "name", "password", "role", "tenantId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
