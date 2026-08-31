import "server-only";

import {
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { API_KEY_SCOPES, createApiKey, revokeApiKey } from "~/server/api-keys";
import { db } from "~/server/db";

const REQUEST_LIFETIME_MS = 10 * 60 * 1000;
const PUBLIC_KEY_MAX_LENGTH = 1_024;

export class CliAuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliAuthInputError";
  }
}

function hashPollSecret(secret: string): Uint8Array<ArrayBuffer> {
  return createHash("sha256").update(secret, "utf8").digest();
}

function validatePublicKey(value: unknown): string {
  if (typeof value !== "string" || value.length > PUBLIC_KEY_MAX_LENGTH) {
    throw new CliAuthInputError("The CLI public key is invalid.");
  }
  try {
    const key = createPublicKey(value);
    const details = key.asymmetricKeyDetails;
    if (
      key.asymmetricKeyType !== "rsa" ||
      !details?.modulusLength ||
      details.modulusLength < 2_048 ||
      details.modulusLength > 4_096
    ) {
      throw new Error("unsupported key");
    }
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch {
    throw new CliAuthInputError("The CLI public key is invalid.");
  }
}

export async function startCliAuthRequest(publicKeyValue: unknown) {
  const publicKey = validatePublicKey(publicKeyValue);
  const id = randomUUID();
  const pollSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REQUEST_LIFETIME_MS);

  await db.$transaction(async (transaction) => {
    await transaction.cliAuthRequest.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await transaction.cliAuthRequest.create({
      data: {
        id,
        pollSecretHash: hashPollSecret(pollSecret),
        publicKey,
        expiresAt,
      },
    });
  });

  return { id, pollSecret, expiresAt };
}

export async function readCliAuthRequest(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      id,
    )
  ) {
    return null;
  }
  return db.cliAuthRequest.findUnique({
    where: { id },
    select: {
      id: true,
      expiresAt: true,
      approvedAt: true,
      claimedAt: true,
    },
  });
}

export async function approveCliAuthRequest(input: {
  id: string;
  userId: string;
}): Promise<"approved" | "expired" | "missing" | "used"> {
  const request = await db.cliAuthRequest.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      publicKey: true,
      expiresAt: true,
      approvedAt: true,
      claimedAt: true,
    },
  });
  if (!request) return "missing";
  if (request.expiresAt <= new Date()) return "expired";
  if (request.approvedAt || request.claimedAt) return "used";

  const created = await createApiKey({
    userId: input.userId,
    name: "Seedyn CLI",
    scopes: API_KEY_SCOPES,
  });
  const encrypted = publicEncrypt(
    { key: request.publicKey, oaepHash: "sha256" },
    Buffer.from(created.rawKey, "utf8"),
  );

  const updated = await db.cliAuthRequest.updateMany({
    where: {
      id: request.id,
      approvedAt: null,
      claimedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      encryptedApiKey: encrypted,
      userId: input.userId,
      apiKeyId: created.id,
      approvedAt: new Date(),
    },
  });
  if (updated.count === 1) return "approved";

  await revokeApiKey(input.userId, created.id);
  return "used";
}

export async function pollCliAuthRequest(input: {
  id: string;
  pollSecret: string;
}): Promise<
  | { status: "pending" }
  | { status: "approved"; encryptedApiKey: string }
  | { status: "expired" | "missing" | "used" }
> {
  const request = await db.cliAuthRequest.findUnique({
    where: { id: input.id },
    select: {
      pollSecretHash: true,
      encryptedApiKey: true,
      expiresAt: true,
      approvedAt: true,
      claimedAt: true,
    },
  });
  if (!request) return { status: "missing" };
  const suppliedHash = Buffer.from(hashPollSecret(input.pollSecret));
  if (!Buffer.from(request.pollSecretHash).equals(suppliedHash)) {
    return { status: "missing" };
  }
  if (request.expiresAt <= new Date()) return { status: "expired" };
  if (request.claimedAt) return { status: "used" };
  if (!request.approvedAt || !request.encryptedApiKey) {
    return { status: "pending" };
  }

  const claimed = await db.cliAuthRequest.updateMany({
    where: { id: input.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  if (claimed.count !== 1) return { status: "used" };
  return {
    status: "approved",
    encryptedApiKey: Buffer.from(request.encryptedApiKey).toString("base64"),
  };
}
