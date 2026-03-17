ALTER TABLE "Tenant" ADD COLUMN "gracePeriodEndsAt" DATETIME;

UPDATE "Tenant" SET "status" = 'ACTIVE' WHERE "status" = 'TEMPORARY';
UPDATE "Tenant" SET "subscriptionStatus" = 'EXPIRED' WHERE "subscriptionStatus" IN ('PAST_DUE', 'CANCELED');
