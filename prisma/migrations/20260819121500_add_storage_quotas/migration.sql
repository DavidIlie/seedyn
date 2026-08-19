CREATE TYPE "StorageReservationKind" AS ENUM ('ORIGINAL', 'GIF');

ALTER TABLE "User"
ADD COLUMN "storageLimitBytes" BIGINT,
ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "storageReservedBytes" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "StorageReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "kind" "StorageReservationKind" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StorageReservation_byteSize_check" CHECK ("byteSize" >= 0)
);

ALTER TABLE "User"
ADD CONSTRAINT "User_storageLimitBytes_check"
CHECK ("storageLimitBytes" IS NULL OR "storageLimitBytes" >= 0),
ADD CONSTRAINT "User_storageUsedBytes_check" CHECK ("storageUsedBytes" >= 0),
ADD CONSTRAINT "User_storageReservedBytes_check" CHECK ("storageReservedBytes" >= 0);

UPDATE "User" AS users
SET "storageUsedBytes" =
  COALESCE((
    SELECT SUM(upload."byteSize")
    FROM "Upload" AS upload
    WHERE upload."userId" = users."id"
  ), 0) +
  COALESCE((
    SELECT SUM(variant."byteSize")
    FROM "UploadVariant" AS variant
    INNER JOIN "Upload" AS upload ON upload."id" = variant."uploadId"
    WHERE upload."userId" = users."id"
  ), 0);

CREATE UNIQUE INDEX "StorageReservation_storageKey_key"
ON "StorageReservation"("storageKey");

CREATE INDEX "StorageReservation_userId_createdAt_idx"
ON "StorageReservation"("userId", "createdAt");

CREATE INDEX "StorageReservation_expiresAt_idx"
ON "StorageReservation"("expiresAt");

ALTER TABLE "StorageReservation"
ADD CONSTRAINT "StorageReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
