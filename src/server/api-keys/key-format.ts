import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "sdn_live";
const PUBLIC_ID_BYTES = 6;
const SECRET_BYTES = 32;
const API_KEY_PATTERN = /^sdn_live_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/;

export interface GeneratedApiKey {
  rawKey: string;
  displayPrefix: string;
  secretHash: Uint8Array<ArrayBuffer>;
}

export interface ParsedApiKey {
  displayPrefix: string;
}

export function hashApiKey(candidate: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    createHash("sha256").update(candidate, "utf8").digest(),
  );
}

export function parseApiKey(candidate: string): ParsedApiKey | null {
  if (candidate.length > 128) return null;

  const match = API_KEY_PATTERN.exec(candidate);
  if (!match) return null;

  const publicId = match[1];
  const encodedSecret = match[2];
  if (!publicId || !encodedSecret) return null;

  const secret = Buffer.from(encodedSecret, "base64url");
  if (
    secret.byteLength !== SECRET_BYTES ||
    secret.toString("base64url") !== encodedSecret
  ) {
    return null;
  }

  return {
    displayPrefix: `${API_KEY_PREFIX}_${publicId}`,
  };
}

export function generateApiKey(): GeneratedApiKey {
  const publicId = randomBytes(PUBLIC_ID_BYTES).toString("base64url");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}_${publicId}_${secret}`;

  return {
    rawKey,
    displayPrefix: `${API_KEY_PREFIX}_${publicId}`,
    secretHash: hashApiKey(rawKey),
  };
}
