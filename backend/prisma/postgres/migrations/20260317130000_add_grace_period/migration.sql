ALTER TABLE "Tenant" ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3);

UPDATE "Tenant" SET "status" = 'ACTIVE' WHERE "status" = 'TEMPORARY';
UPDATE "Tenant" SET "subscriptionStatus" = 'EXPIRED' WHERE "subscriptionStatus" IN ('PAST_DUE', 'CANCELED');
