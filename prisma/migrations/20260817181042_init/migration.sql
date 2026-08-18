-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('IMAGE', 'VIDEO', 'TEXT', 'FILE');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('READY', 'DELETING', 'DELETE_FAILED');

-- CreateEnum
CREATE TYPE "VariantKind" AS ENUM ('GIF');

-- CreateEnum
CREATE TYPE "VariantState" AS ENUM ('READY', 'DELETING', 'DELETE_FAILED');

-- CreateEnum
CREATE TYPE "ContentDisposition" AS ENUM ('INLINE', 'ATTACHMENT');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "issuer" TEXT,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "identityIssuer" TEXT,
    "identitySubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" BYTEA NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'READY',
    "originalName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "disposition" "ContentDisposition" NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sha256" BYTEA NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleteErrorCode" TEXT,
    "deleteErrorAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadVariant" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "kind" "VariantKind" NOT NULL,
    "state" "VariantState" NOT NULL DEFAULT 'READY',
    "extension" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "disposition" "ContentDisposition" NOT NULL DEFAULT 'INLINE',
    "byteSize" BIGINT NOT NULL,
    "sha256" BYTEA NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleteErrorCode" TEXT,
    "deleteErrorAt" TIMESTAMP(3),

    CONSTRAINT "UploadVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_identityIssuer_identitySubject_key" ON "User"("identityIssuer", "identitySubject");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_secretHash_key" ON "ApiKey"("secretHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_revokedAt_createdAt_idx" ON "ApiKey"("userId", "revokedAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_name_key" ON "ApiKey"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_publicSlug_key" ON "Upload"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storageKey_key" ON "Upload"("storageKey");

-- CreateIndex
CREATE INDEX "Upload_userId_createdAt_id_idx" ON "Upload"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Upload_userId_kind_createdAt_id_idx" ON "Upload"("userId", "kind", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Upload_state_updatedAt_idx" ON "Upload"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadVariant_publicSlug_key" ON "UploadVariant"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "UploadVariant_storageKey_key" ON "UploadVariant"("storageKey");

-- CreateIndex
CREATE INDEX "UploadVariant_state_updatedAt_idx" ON "UploadVariant"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadVariant_uploadId_kind_key" ON "UploadVariant"("uploadId", "kind");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadVariant" ADD CONSTRAINT "UploadVariant_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
