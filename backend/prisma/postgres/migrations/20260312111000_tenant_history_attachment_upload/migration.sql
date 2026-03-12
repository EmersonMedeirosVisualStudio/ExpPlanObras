ALTER TABLE "TenantHistoryAttachment" ADD COLUMN "filename" TEXT;
ALTER TABLE "TenantHistoryAttachment" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "TenantHistoryAttachment" ADD COLUMN "data" BYTEA;
ALTER TABLE "TenantHistoryAttachment" ALTER COLUMN "url" DROP NOT NULL;

