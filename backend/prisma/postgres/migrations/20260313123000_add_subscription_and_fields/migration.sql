ALTER TABLE "Tenant" ADD COLUMN "googleMapsLink" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "trialExpiresAt" TIMESTAMP(3);
ALTER TABLE "TenantHistoryEntry" ADD COLUMN "action" TEXT;

CREATE TABLE "Subscription" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "paymentProvider" TEXT,
  "paymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

