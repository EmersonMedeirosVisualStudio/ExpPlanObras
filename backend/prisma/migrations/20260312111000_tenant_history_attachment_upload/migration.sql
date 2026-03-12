PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TenantHistoryAttachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "url" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "data" BLOB,
    CONSTRAINT "TenantHistoryAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TenantHistoryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_TenantHistoryAttachment" ("id","entryId","url")
SELECT "id","entryId","url" FROM "TenantHistoryAttachment";

DROP TABLE "TenantHistoryAttachment";
ALTER TABLE "new_TenantHistoryAttachment" RENAME TO "TenantHistoryAttachment";

CREATE INDEX "TenantHistoryAttachment_entryId_idx" ON "TenantHistoryAttachment"("entryId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

