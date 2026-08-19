ALTER TABLE "Upload"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Upload"
ADD CONSTRAINT "Upload_passwordVersion_nonnegative"
CHECK ("passwordVersion" >= 0);
