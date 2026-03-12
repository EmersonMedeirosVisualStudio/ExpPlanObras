ALTER TABLE "Tenant" ADD COLUMN "latitude" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "longitude" TEXT;
ALTER TABLE "Tenant" ALTER COLUMN "status" SET DEFAULT 'TEMPORARY';

CREATE TABLE "TenantHistoryEntry" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantHistoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantHistoryAttachment" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "TenantHistoryAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TenantHistoryEntry" ADD CONSTRAINT "TenantHistoryEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantHistoryEntry" ADD CONSTRAINT "TenantHistoryEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantHistoryAttachment" ADD CONSTRAINT "TenantHistoryAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TenantHistoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TenantHistoryEntry_tenantId_idx" ON "TenantHistoryEntry"("tenantId");
CREATE INDEX "TenantHistoryEntry_actorUserId_idx" ON "TenantHistoryEntry"("actorUserId");
CREATE INDEX "TenantHistoryAttachment_entryId_idx" ON "TenantHistoryAttachment"("entryId");

