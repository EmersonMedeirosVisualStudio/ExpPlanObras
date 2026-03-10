/*
  Warnings:

  - You are about to drop the column `address` on the `Obra` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Obra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PARTICULAR',
    "status" TEXT NOT NULL DEFAULT 'NAO_INICIADA',
    "street" TEXT,
    "number" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "valorPrevisto" DECIMAL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Obra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Obra" ("createdAt", "description", "id", "latitude", "longitude", "name", "status", "tenantId", "type", "updatedAt", "valorPrevisto") SELECT "createdAt", "description", "id", "latitude", "longitude", "name", "status", "tenantId", "type", "updatedAt", "valorPrevisto" FROM "Obra";
DROP TABLE "Obra";
ALTER TABLE "new_Obra" RENAME TO "Obra";
CREATE INDEX "Obra_tenantId_idx" ON "Obra"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
