CREATE TYPE "DirectUploadState" AS ENUM (
  'CREATING',
  'UPLOADING',
  'VERIFYING',
  'PUBLISHED',
  'ABORTING',
  'ABORTED',
  'FAILED'
);

CREATE TABLE "DirectUploadSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "publishedUploadId" TEXT,
  "state" "DirectUploadState" NOT NULL DEFAULT 'CREATING',
  "storageKey" TEXT NOT NULL,
  "s3UploadId" TEXT,
  "declaredBytes" BIGINT NOT NULL,
  "declaredSha256" BYTEA NOT NULL,
  "sniffPrefix" BYTEA NOT NULL,
  "partSize" INTEGER NOT NULL,
  "partCount" INTEGER NOT NULL,
  "kind" "UploadKind" NOT NULL,
  "extension" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "disposition" "ContentDisposition" NOT NULL,
  "originalName" TEXT NOT NULL,
  "publicSlug" TEXT NOT NULL,
  "mediaOrigin" TEXT NOT NULL,
  "observedParts" JSONB,
  "storageCompletedAt" TIMESTAMP(3),
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "hardExpiresAt" TIMESTAMP(3) NOT NULL,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DirectUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectUploadSession_uploadId_key"
  ON "DirectUploadSession"("uploadId");
CREATE UNIQUE INDEX "DirectUploadSession_publishedUploadId_key"
  ON "DirectUploadSession"("publishedUploadId");
CREATE UNIQUE INDEX "DirectUploadSession_storageKey_key"
  ON "DirectUploadSession"("storageKey");
CREATE INDEX "DirectUploadSession_state_expiresAt_idx"
  ON "DirectUploadSession"("state", "expiresAt");
CREATE INDEX "DirectUploadSession_state_leaseExpiresAt_idx"
  ON "DirectUploadSession"("state", "leaseExpiresAt");
CREATE INDEX "DirectUploadSession_userId_createdAt_idx"
  ON "DirectUploadSession"("userId", "createdAt" DESC);
CREATE INDEX "DirectUploadSession_publicSlug_state_idx"
  ON "DirectUploadSession"("publicSlug", "state");

ALTER TABLE "DirectUploadSession"
  ADD CONSTRAINT "DirectUploadSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectUploadSession"
  ADD CONSTRAINT "DirectUploadSession_publishedUploadId_fkey"
  FOREIGN KEY ("publishedUploadId") REFERENCES "Upload"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
