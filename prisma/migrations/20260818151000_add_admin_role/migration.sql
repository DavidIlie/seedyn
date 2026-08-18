CREATE TYPE "SeedynRole" AS ENUM ('MEMBER', 'ADMIN');

ALTER TABLE "User"
ADD COLUMN "appRole" "SeedynRole" NOT NULL DEFAULT 'MEMBER';

CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");

CREATE INDEX "Upload_createdAt_id_idx"
ON "Upload"("createdAt" DESC, "id" DESC);

CREATE INDEX "Upload_kind_createdAt_idx"
ON "Upload"("kind", "createdAt" DESC);
