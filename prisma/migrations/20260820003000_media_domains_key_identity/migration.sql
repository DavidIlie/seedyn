-- Correct API-key vocabulary and add media-domain preferences/snapshots.
-- Existing raw API keys and S3 credentials are keyed by immutable IDs/digests,
-- so this migration changes display metadata without invalidating clients.

ALTER TABLE "User"
ADD COLUMN "defaultMediaDomain" TEXT;

ALTER TABLE "ApiKey"
ADD COLUMN "slug" TEXT,
ADD COLUMN "mediaDomain" TEXT;

WITH normalized AS (
  SELECT
    "id",
    "userId",
    COALESCE(
      NULLIF(
        LEFT(
          TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
          48
        ),
        ''
      ),
      'key'
    ) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY
        "userId",
        COALESCE(
          NULLIF(
            LEFT(
              TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
              48
            ),
            ''
          ),
          'key'
        )
      ORDER BY "createdAt", "id"
    ) AS duplicate_number
  FROM "ApiKey"
), resolved AS (
  SELECT
    "id",
    CASE
      WHEN duplicate_number = 1 THEN base_slug
      ELSE base_slug || '-' || duplicate_number::TEXT
    END AS resolved_slug
  FROM normalized
)
UPDATE "ApiKey" AS key
SET "slug" = resolved.resolved_slug
FROM resolved
WHERE key."id" = resolved."id";

-- The former device label was the actual human-facing name. Fall back to the
-- old machine name for keys created before labels existed.
UPDATE "ApiKey"
SET "name" = COALESCE(NULLIF(BTRIM("clientLabel"), ''), "name");

ALTER TABLE "ApiKey"
ALTER COLUMN "slug" SET NOT NULL;

DROP INDEX "ApiKey_userId_name_key";
CREATE UNIQUE INDEX "ApiKey_userId_slug_key" ON "ApiKey"("userId", "slug");

ALTER TABLE "Upload"
ADD COLUMN "apiKeySlugSnapshot" TEXT,
ADD COLUMN "mediaOrigin" TEXT;

-- Preserve old immutable provenance while correcting its display vocabulary.
UPDATE "Upload"
SET
  "apiKeySlugSnapshot" = "apiKeyNameSnapshot",
  "apiKeyNameSnapshot" = COALESCE(
    NULLIF(BTRIM("clientLabelSnapshot"), ''),
    "apiKeyNameSnapshot"
  )
WHERE "apiKeyNameSnapshot" IS NOT NULL;
