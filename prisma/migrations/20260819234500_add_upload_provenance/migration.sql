-- Provenance is stored on the upload itself so API-key history can be pruned
-- without erasing how an object entered Seedyn. The default intentionally
-- remains during the rolling deployment: old pods do not yet send an origin.
CREATE TYPE "UploadOrigin" AS ENUM ('LEGACY_UNKNOWN', 'BROWSER', 'HTTP', 'SHAREX', 'S3');

ALTER TABLE "ApiKey"
ADD COLUMN "clientLabel" TEXT,
ADD COLUMN "s3AccessKeyId" TEXT,
ADD COLUMN "s3PublicNamespace" TEXT,
ADD COLUMN "s3EnabledAt" TIMESTAMP(3);

ALTER TABLE "Upload"
ADD COLUMN "origin" "UploadOrigin" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
ADD COLUMN "apiKeyIdSnapshot" TEXT,
ADD COLUMN "apiKeyNameSnapshot" TEXT,
ADD COLUMN "clientLabelSnapshot" TEXT,
ADD COLUMN "s3ObjectKey" TEXT,
ADD COLUMN "s3PublicNamespaceSnapshot" TEXT;

CREATE UNIQUE INDEX "ApiKey_s3AccessKeyId_key" ON "ApiKey"("s3AccessKeyId");
CREATE UNIQUE INDEX "ApiKey_s3PublicNamespace_key" ON "ApiKey"("s3PublicNamespace");
CREATE INDEX "Upload_origin_createdAt_id_idx" ON "Upload"("origin", "createdAt" DESC, "id" DESC);
CREATE INDEX "Upload_userId_apiKeyIdSnapshot_createdAt_id_idx" ON "Upload"("userId", "apiKeyIdSnapshot", "createdAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "Upload_s3PublicNamespaceSnapshot_s3ObjectKey_key" ON "Upload"("s3PublicNamespaceSnapshot", "s3ObjectKey");
