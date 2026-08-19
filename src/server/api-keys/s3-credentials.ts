import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { env } from "~/env";
import { db } from "~/server/db";
import { resolveMediaDomainPreference } from "~/server/media/origin-preferences";
import { S3_FIXED_BUCKET } from "~/server/s3/constants";

const ACCESS_KEY_PREFIX = "SDN";
const ACCESS_KEY_RANDOM_BYTES = 12;
const PUBLIC_NAMESPACE_BYTES = 24;
const MAX_GENERATION_ATTEMPTS = 4;

export class S3CredentialConfigurationError extends Error {
  constructor() {
    super("S3 credentials are not configured for this Seedyn installation.");
    this.name = "S3CredentialConfigurationError";
  }
}

export class S3CredentialInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "S3CredentialInputError";
  }
}

export type CreatedS3Credential = Readonly<{
  accessKeyId: string;
  publicNamespace: string;
  secretAccessKey: string;
  mediaDomain: string | null;
  userDefaultMediaDomain: string | null;
}>;

export type S3CredentialDisplay = Readonly<{
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  publicNamespace: string;
}>;

export type ResolvedS3Credential = Readonly<{
  accessKeyId: string;
  apiKeyId: string;
  apiKeyName: string;
  apiKeySlug: string;
  mediaDomain: string | null;
  userDefaultMediaDomain: string | null;
  publicNamespace: string;
  scopes: readonly string[];
  secretAccessKey: string;
  userId: string;
}>;

function masterSecret(): string {
  if (!env.S3_MASTER_SECRET) throw new S3CredentialConfigurationError();
  return env.S3_MASTER_SECRET;
}

function generateAccessKeyId(): string {
  return `${ACCESS_KEY_PREFIX}${randomBytes(ACCESS_KEY_RANDOM_BYTES).toString("hex").toUpperCase()}`;
}

function generatePublicNamespace(): string {
  return randomBytes(PUBLIC_NAMESPACE_BYTES).toString("base64url");
}

export function describeS3Credential(
  publicNamespace: string,
  mediaDomain?: string | null,
  userDefaultMediaDomain?: string | null,
): S3CredentialDisplay {
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(publicNamespace)) {
    throw new Error("Stored S3 public namespace is invalid.");
  }
  const publicDomain = resolveMediaDomainPreference(
    mediaDomain,
    userDefaultMediaDomain,
  );
  return {
    bucket: S3_FIXED_BUCKET,
    endpoint: env.APP_URL,
    publicBaseUrl: new URL(
      `/s3/${publicNamespace}/`,
      publicDomain.origin,
    ).toString(),
    publicNamespace,
  };
}

function deriveSecretAccessKey(input: {
  accessKeyId: string;
  apiKeyId: string;
}): string {
  return createHmac("sha256", masterSecret())
    .update("seedyn:s3-credential:v1\0", "utf8")
    .update(input.apiKeyId, "utf8")
    .update("\0", "utf8")
    .update(input.accessKeyId, "utf8")
    .digest("base64url");
}

function isUniqueCredentialConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Enables or rotates the S3 credential attached to an existing Seedyn API key.
 * The public namespace remains stable so existing Shottr links survive rotation.
 * Only the deterministic secret is returned; it is never persisted in Postgres.
 */
export async function rotateS3Credential(input: {
  apiKeyId: string;
  userId: string;
}): Promise<CreatedS3Credential> {
  // Fail before touching the database when this installation has no key
  // derivation secret.
  masterSecret();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const accessKeyId = generateAccessKeyId();
    const generatedNamespace = generatePublicNamespace();
    try {
      const row = await db.$transaction(
        async (transaction) => {
          const existing = await transaction.apiKey.findFirst({
            where: { id: input.apiKeyId, userId: input.userId },
            select: {
              id: true,
              expiresAt: true,
              revokedAt: true,
              s3PublicNamespace: true,
              mediaDomain: true,
              user: { select: { defaultMediaDomain: true } },
            },
          });
          const now = new Date();
          if (
            !existing ||
            existing.revokedAt ||
            (existing.expiresAt !== null && existing.expiresAt <= now)
          ) {
            throw new S3CredentialInputError(
              "Choose an active API key before enabling S3.",
            );
          }

          return transaction.apiKey.update({
            where: { id: existing.id },
            data: {
              s3AccessKeyId: accessKeyId,
              s3EnabledAt: now,
              s3PublicNamespace:
                existing.s3PublicNamespace ?? generatedNamespace,
            },
            select: {
              id: true,
              s3AccessKeyId: true,
              s3PublicNamespace: true,
              mediaDomain: true,
              user: { select: { defaultMediaDomain: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (!row.s3AccessKeyId || !row.s3PublicNamespace) {
        throw new Error("S3 credential rotation did not persist its identity.");
      }
      return {
        accessKeyId: row.s3AccessKeyId,
        publicNamespace: row.s3PublicNamespace,
        mediaDomain: row.mediaDomain,
        userDefaultMediaDomain: row.user.defaultMediaDomain,
        secretAccessKey: deriveSecretAccessKey({
          accessKeyId: row.s3AccessKeyId,
          apiKeyId: row.id,
        }),
      };
    } catch (error) {
      if (
        isUniqueCredentialConflict(error) &&
        attempt + 1 < MAX_GENERATION_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate a unique S3 credential.");
}

export async function resolveS3Credential(
  accessKeyId: string,
): Promise<ResolvedS3Credential | null> {
  if (!env.S3_MASTER_SECRET) return null;
  const row = await db.apiKey.findUnique({
    where: { s3AccessKeyId: accessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      mediaDomain: true,
      scopes: true,
      s3AccessKeyId: true,
      s3PublicNamespace: true,
      s3EnabledAt: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { defaultMediaDomain: true } },
    },
  });
  const now = new Date();
  if (
    !row?.s3AccessKeyId ||
    !row.s3PublicNamespace ||
    !row.s3EnabledAt ||
    row.revokedAt ||
    (row.expiresAt !== null && row.expiresAt <= now)
  ) {
    return null;
  }

  return {
    accessKeyId: row.s3AccessKeyId,
    apiKeyId: row.id,
    apiKeyName: row.name,
    apiKeySlug: row.slug,
    mediaDomain: row.mediaDomain,
    userDefaultMediaDomain: row.user.defaultMediaDomain,
    publicNamespace: row.s3PublicNamespace,
    scopes: row.scopes,
    secretAccessKey: deriveSecretAccessKey({
      accessKeyId: row.s3AccessKeyId,
      apiKeyId: row.id,
    }),
    userId: row.userId,
  };
}
