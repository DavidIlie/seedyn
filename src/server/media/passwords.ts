import "server-only";

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "~/env";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;
const MAX_PASSWORD_BYTES = 1_024;
const GRANT_LIFETIME_SECONDS = 12 * 60 * 60;
const GRANT_VERSION = "v1";
const MAX_CONCURRENT_PASSWORD_HASHES = 2;

let activePasswordHashes = 0;

// OWASP's minimum Argon2id profile: 19 MiB, two iterations, one lane. The
// encoded PHC string carries the algorithm, salt, version, and work factors so
// verification remains correct if a future password uses stronger settings.
const ARGON2_OPTIONS = {
  // Numeric values are the package's declared Argon2id / version 0x13 enum
  // values. The package currently publishes ambient const enums, which cannot
  // be imported under this project's verbatimModuleSyntax setting.
  algorithm: 2,
  version: 1,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export type MediaPasswordValidation =
  | { ok: true; password: string }
  | { ok: false; message: string };

export function validateMediaPassword(value: unknown): MediaPasswordValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "Enter a password." };
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (
    value.length > MAX_PASSWORD_LENGTH ||
    Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES
  ) {
    return { ok: false, message: "That password is too long." };
  }
  return { ok: true, password: value };
}

export async function hashMediaPassword(password: string): Promise<string> {
  // Browser mutations are already source/account limited, but bounding the
  // expensive owner-side hash path also prevents a burst of valid, concurrent
  // actions from allocating an unbounded number of 19 MiB Argon2 workspaces.
  if (activePasswordHashes >= MAX_CONCURRENT_PASSWORD_HASHES) {
    throw new Error("Password hashing capacity is exhausted");
  }
  activePasswordHashes += 1;
  try {
    return await argon2Hash(password, ARGON2_OPTIONS);
  } finally {
    activePasswordHashes -= 1;
  }
}

export async function verifyMediaPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  const valid = validateMediaPassword(password);
  if (!valid.ok || !encodedHash.startsWith("$argon2id$")) return false;
  try {
    // @node-rs/argon2 verifies the encoded hash without exposing a digest for
    // application code to compare. Its implementation performs the password
    // hash comparison in native constant-time code.
    return await argon2Verify(encodedHash, valid.password);
  } catch {
    return false;
  }
}

function grantSecret(): string {
  if (!env.AUTH_SECRET) throw new Error("Media grants are not configured");
  return env.AUTH_SECRET;
}

function grantMessage(input: {
  uploadId: string;
  passwordVersion: number;
  expiresAtSeconds: number;
}): string {
  return [
    GRANT_VERSION,
    input.uploadId,
    String(input.passwordVersion),
    String(input.expiresAtSeconds),
  ].join("\0");
}

function grantSignature(message: string): Buffer {
  return createHmac("sha256", grantSecret()).update(message).digest();
}

export function mediaGrantCookieName(uploadId: string): string {
  const scope = createHash("sha256")
    .update(uploadId, "utf8")
    .digest("hex")
    .slice(0, 20);
  return `seedyn_media_${scope}`;
}

export function createMediaGrant(
  input: { uploadId: string; passwordVersion: number },
  now = Date.now(),
): { value: string; maxAge: number } {
  const expiresAtSeconds = Math.floor(now / 1_000) + GRANT_LIFETIME_SECONDS;
  const signature = grantSignature(
    grantMessage({ ...input, expiresAtSeconds }),
  ).toString("base64url");
  return {
    value: `${GRANT_VERSION}.${expiresAtSeconds}.${signature}`,
    maxAge: GRANT_LIFETIME_SECONDS,
  };
}

export function verifyMediaGrant(
  value: string | null,
  input: { uploadId: string; passwordVersion: number },
  now = Date.now(),
): boolean {
  if (!value || value.length > 256) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== GRANT_VERSION) return false;
  const expiresRaw = parts[1];
  const signatureRaw = parts[2];
  if (
    !expiresRaw ||
    !/^\d{10}$/u.test(expiresRaw) ||
    !signatureRaw ||
    !/^[A-Za-z0-9_-]{43}$/u.test(signatureRaw)
  ) {
    return false;
  }
  const expiresAtSeconds = Number(expiresRaw);
  const nowSeconds = Math.floor(now / 1_000);
  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= nowSeconds ||
    expiresAtSeconds > nowSeconds + GRANT_LIFETIME_SECONDS
  ) {
    return false;
  }
  const expected = grantSignature(grantMessage({ ...input, expiresAtSeconds }));
  const provided = Buffer.from(signatureRaw, "base64url");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function readCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader || cookieHeader.length > 16_384) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim() || null;
  }
  return null;
}

export function mediaGrantSetCookie(input: {
  cookieName: string;
  value: string;
  path: string;
  maxAge: number;
  secure: boolean;
}): string {
  const secure = input.secure ? "; Secure" : "";
  return `${input.cookieName}=${input.value}; Path=${input.path}; Max-Age=${input.maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** Parse an optional non-browser `Authorization: Basic seedyn:<password>`. */
export function basicMediaPassword(
  authorization: string | null,
): string | null {
  if (!authorization || authorization.length > 2_048) return null;
  const match = /^Basic ([A-Za-z0-9+/]*={0,2})$/u.exec(authorization);
  if (!match?.[1] || match[1].length % 4 !== 0) return null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(match[1], "base64"),
    );
    const separator = decoded.indexOf(":");
    if (separator < 0 || decoded.slice(0, separator) !== "seedyn") return null;
    const password = decoded.slice(separator + 1);
    return validateMediaPassword(password).ok ? password : null;
  } catch {
    return null;
  }
}
