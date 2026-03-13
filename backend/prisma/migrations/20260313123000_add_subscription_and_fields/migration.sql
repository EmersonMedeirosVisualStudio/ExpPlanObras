ALTER TABLE "Tenant" ADD COLUMN "googleMapsLink" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "trialExpiresAt" DATETIME;

CREATE TABLE "Subscription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "expiresAt" DATETIME,
  "paymentProvider" TEXT,
  "paymentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

ALTER TABLE "TenantHistoryEntry" ADD COLUMN "action" TEXT;

