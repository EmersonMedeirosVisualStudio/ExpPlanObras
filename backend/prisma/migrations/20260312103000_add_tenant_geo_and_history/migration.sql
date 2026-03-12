ALTER TABLE "Tenant" ADD COLUMN "latitude" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "longitude" TEXT;

CREATE TABLE "TenantHistoryEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantHistoryEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantHistoryEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TenantHistoryEntry_tenantId_idx" ON "TenantHistoryEntry"("tenantId");
CREATE INDEX "TenantHistoryEntry_actorUserId_idx" ON "TenantHistoryEntry"("actorUserId");

CREATE TABLE "TenantHistoryAttachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "TenantHistoryAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TenantHistoryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TenantHistoryAttachment_entryId_idx" ON "TenantHistoryAttachment"("entryId");

