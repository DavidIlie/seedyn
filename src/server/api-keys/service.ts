import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { db } from "~/server/db";

import {
  isApiKeyScope,
  normalizeApiKeyScopes,
  type ApiKeyScope,
} from "./constants";
import { generateApiKey, hashApiKey, parseApiKey } from "./key-format";
import { describeS3Credential } from "./s3-credentials";

const API_KEY_NAME_MAX_LENGTH = 64;
const API_KEY_CLIENT_LABEL_MAX_LENGTH = 80;
const MAX_ACTIVE_API_KEYS_PER_USER = 10;
const MAX_API_KEY_HISTORY_PER_USER = 100;
const INACTIVE_API_KEY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export class ApiKeyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyInputError";
  }
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  clientLabel?: string | null;
  scopes: readonly string[];
  expiresAt?: Date | null;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  clientLabel: string | null;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: Date;
  expiresAt: Date | null;
  rawKey: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  clientLabel: string | null;
  prefix: string;
  s3AccessKeyId: string | null;
  s3EnabledAt: Date | null;
  s3PublicNamespace: string | null;
  s3PublicBaseUrl: string | null;
  scopes: ApiKeyScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface AuthenticatedApiKey {
  id: string;
  userId: string;
  name: string;
  clientLabel: string | null;
  prefix: string;
  scopes: ApiKeyScope[];
}

function normalizeApiKeyName(name: string): string {
  const normalized = name.normalize("NFC").trim().replace(/\s+/g, " ");
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });

  if (
    normalized.length === 0 ||
    normalized.length > API_KEY_NAME_MAX_LENGTH ||
    hasControlCharacter
  ) {
    throw new ApiKeyInputError(
      "API key name must be between 1 and 64 safe characters",
    );
  }

  return normalized;
}

/**
 * A label is display-only credential metadata, never caller-supplied request
 * attribution. Reject invisible direction controls so an owner cannot create a
 * misleading key label in the library or admin ledger.
 */
export function normalizeApiKeyClientLabel(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return null;

  const unsafe = Array.from(normalized).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });

  if (
    Array.from(normalized).length > API_KEY_CLIENT_LABEL_MAX_LENGTH ||
    unsafe
  ) {
    throw new ApiKeyInputError(
      "Client label must be at most 80 safe characters",
    );
  }
  return normalized;
}

function knownScopes(scopes: readonly string[]): ApiKeyScope[] {
  return scopes.filter(isApiKeyScope);
}

function inactiveApiKeyWhere(
  userId: string,
  inactiveAt: Date,
): Prisma.ApiKeyWhereInput {
  return {
    userId,
    OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: inactiveAt } }],
  };
}

async function pruneInactiveApiKeyHistory(
  transaction: Prisma.TransactionClient,
  input: { userId: string; name: string; now: Date },
): Promise<void> {
  const staleBefore = new Date(
    input.now.getTime() - INACTIVE_API_KEY_RETENTION_MS,
  );

  // Keep useful recent lifecycle history, but never retain terminal rows
  // forever. For revoked keys, revokedAt is the terminal timestamp. Otherwise,
  // expiry is the terminal timestamp.
  await transaction.apiKey.deleteMany({
    where: {
      userId: input.userId,
      OR: [
        { revokedAt: { lte: staleBefore } },
        { revokedAt: null, expiresAt: { lte: staleBefore } },
      ],
    },
  });

  // A terminal row must not squat a human-readable name forever. The active
  // row, if any, remains protected by the database uniqueness constraint.
  await transaction.apiKey.deleteMany({
    where: {
      name: input.name,
      ...inactiveApiKeyWhere(input.userId, input.now),
    },
  });

  const totalCount = await transaction.apiKey.count({
    where: { userId: input.userId },
  });
  const rowsToRemove = Math.max(
    0,
    totalCount - (MAX_API_KEY_HISTORY_PER_USER - 1),
  );
  if (rowsToRemove === 0) return;

  const oldestInactiveRows = await transaction.apiKey.findMany({
    where: inactiveApiKeyWhere(input.userId, input.now),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: rowsToRemove,
    select: { id: true },
  });
  if (oldestInactiveRows.length !== rowsToRemove) {
    throw new ApiKeyInputError(
      "API key history cannot be pruned while too many keys are active.",
    );
  }
  await transaction.apiKey.deleteMany({
    where: {
      userId: input.userId,
      id: { in: oldestInactiveRows.map((row) => row.id) },
    },
  });
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreatedApiKey> {
  const name = normalizeApiKeyName(input.name);
  const clientLabel = normalizeApiKeyClientLabel(input.clientLabel);
  let scopes: ApiKeyScope[];
  try {
    scopes = normalizeApiKeyScopes(input.scopes);
  } catch {
    throw new ApiKeyInputError("Choose one or more valid upload scopes.");
  }
  const now = new Date();

  if (
    input.expiresAt &&
    (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= now)
  ) {
    throw new ApiKeyInputError("API key expiry must be in the future");
  }

  const generated = generateApiKey();
  const id = randomUUID();
  let row;
  try {
    row = await db.$transaction(
      async (transaction) => {
        await pruneInactiveApiKeyHistory(transaction, {
          userId: input.userId,
          name,
          now,
        });

        const activeCount = await transaction.apiKey.count({
          where: {
            userId: input.userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        });
        if (activeCount >= MAX_ACTIVE_API_KEYS_PER_USER) {
          throw new ApiKeyInputError(
            `An account can have at most ${MAX_ACTIVE_API_KEYS_PER_USER} active API keys. Revoke one before creating another.`,
          );
        }

        return transaction.apiKey.create({
          data: {
            id,
            userId: input.userId,
            name,
            clientLabel,
            prefix: generated.displayPrefix,
            secretHash: generated.secretHash,
            scopes,
            expiresAt: input.expiresAt ?? null,
          },
          select: {
            id: true,
            name: true,
            clientLabel: true,
            prefix: true,
            scopes: true,
            createdAt: true,
            expiresAt: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiKeyInputError("An API key with that name already exists.");
    }
    throw error;
  }

  return {
    ...row,
    scopes: knownScopes(row.scopes),
    rawKey: generated.rawKey,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const rows = await db.apiKey.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_API_KEY_HISTORY_PER_USER,
    select: {
      id: true,
      name: true,
      clientLabel: true,
      prefix: true,
      s3AccessKeyId: true,
      s3EnabledAt: true,
      s3PublicNamespace: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    clientLabel: row.clientLabel,
    prefix: row.prefix,
    s3AccessKeyId: row.s3AccessKeyId,
    s3EnabledAt: row.s3EnabledAt,
    s3PublicNamespace: row.s3PublicNamespace,
    s3PublicBaseUrl: row.s3PublicNamespace
      ? describeS3Credential(row.s3PublicNamespace).publicBaseUrl
      : null,
    scopes: knownScopes(row.scopes),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  }));
}

export async function updateApiKeyClientLabel(input: {
  userId: string;
  apiKeyId: string;
  clientLabel: string | null;
}): Promise<boolean> {
  const clientLabel = normalizeApiKeyClientLabel(input.clientLabel);
  const result = await db.apiKey.updateMany({
    where: { id: input.apiKeyId, userId: input.userId },
    data: { clientLabel },
  });
  return result.count === 1;
}

export async function revokeApiKey(
  userId: string,
  apiKeyId: string,
): Promise<boolean> {
  const result = await db.apiKey.updateMany({
    where: {
      id: apiKeyId,
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return result.count === 1;
}

export async function resolveApiKeyIdentity(
  candidate: string,
): Promise<AuthenticatedApiKey | null> {
  if (!parseApiKey(candidate)) return null;

  const row = await db.apiKey.findUnique({
    where: { secretHash: hashApiKey(candidate) },
    select: {
      id: true,
      userId: true,
      name: true,
      clientLabel: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });

  const now = new Date();
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
    return null;
  }

  const scopes = knownScopes(row.scopes);

  const writeBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  if (!row.lastUsedAt || row.lastUsedAt <= writeBefore) {
    await db.apiKey.updateMany({
      where: {
        id: row.id,
        revokedAt: null,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: writeBefore } }],
      },
      data: { lastUsedAt: now },
    });
  }

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    clientLabel: row.clientLabel,
    prefix: row.prefix,
    scopes,
  };
}

export {
  INACTIVE_API_KEY_RETENTION_MS,
  MAX_ACTIVE_API_KEYS_PER_USER,
  MAX_API_KEY_HISTORY_PER_USER,
};
