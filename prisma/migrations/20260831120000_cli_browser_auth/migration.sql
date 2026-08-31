CREATE TABLE "CliAuthRequest" (
    "id" UUID NOT NULL,
    "pollSecretHash" BYTEA NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedApiKey" BYTEA,
    "userId" TEXT,
    "apiKeyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "CliAuthRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CliAuthRequest_pollSecretHash_key" ON "CliAuthRequest"("pollSecretHash");
CREATE INDEX "CliAuthRequest_expiresAt_idx" ON "CliAuthRequest"("expiresAt");
CREATE INDEX "CliAuthRequest_userId_createdAt_idx" ON "CliAuthRequest"("userId", "createdAt" DESC);

ALTER TABLE "CliAuthRequest" ADD CONSTRAINT "CliAuthRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CliAuthRequest" ADD CONSTRAINT "CliAuthRequest_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
