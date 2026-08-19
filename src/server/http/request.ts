import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { env } from "~/env";
import {
  normalizeAuthority,
  parseHostSet,
  resolveOriginRole,
} from "~/lib/origin";
import {
  checkUploadRateLimit,
  extractClientAddress,
  type RateLimitMetadata,
  type UploadRateLimitResult,
} from "~/server/rate-limit";

const APP_HOSTS = parseHostSet(env.APP_HOSTS);
const MEDIA_HOSTS = parseHostSet(env.MEDIA_HOSTS);
const APP_ORIGIN = new URL(env.APP_URL).origin;
const MULTIPART_OVERHEAD_BYTES = 128 * 1024;

function hasValidAuthorityPort(value: string | null): boolean {
  if (!value) return false;
  const portSuffix = value.startsWith("[")
    ? value.slice(value.indexOf("]") + 1)
    : value.includes(":")
      ? value.slice(value.lastIndexOf(":"))
      : "";
  if (!portSuffix) return true;
  const match = /^:(\d{1,5})$/u.exec(portSuffix);
  if (!match?.[1]) return false;
  return Number(match[1]) <= 65_535;
}

export type SafeErrorCode =
  | "database_unavailable"
  | "forbidden"
  | "invalid_api_key"
  | "invalid_input"
  | "missing_scope"
  | "not_found"
  | "payload_too_large"
  | "rate_limit_unavailable"
  | "rate_limited"
  | "unauthenticated";

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function safeJsonError(
  status: number,
  code: SafeErrorCode,
  message: string,
  requestId: string,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: responseHeaders },
  );
}

export function isAppHostRequest(request: Request): boolean {
  const host = request.headers.get("host");
  return (
    hasValidAuthorityPort(host) &&
    resolveOriginRole(host, APP_HOSTS, MEDIA_HOSTS) === "app"
  );
}

export function isMediaHostRequest(request: Request): boolean {
  const host = request.headers.get("host");
  return (
    hasValidAuthorityPort(host) &&
    resolveOriginRole(host, APP_HOSTS, MEDIA_HOSTS) === "media"
  );
}

/** Kubernetes and container probes address the process by literal IP. */
export function isDirectProbeRequest(request: Request): boolean {
  const host = normalizeAuthority(request.headers.get("host"));
  if (host === "127.0.0.1" || host === "::1") return true;
  return host !== null && env.POD_IP !== undefined && host === env.POD_IP;
}

export function hasExactAppOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== origin.trim() || origin.includes(",")) return false;
  // Origin is a serialized origin, not an arbitrary URL. Comparing its raw
  // canonical value rejects paths, credentials, fragments, trailing slashes,
  // and other values a non-browser client could otherwise smuggle through
  // URL.origin normalization.
  return origin === APP_ORIGIN;
}

export function contentLengthIsPermitted(
  request: Request,
  maximumFileBytes: number,
): boolean {
  if (
    !Number.isSafeInteger(maximumFileBytes) ||
    maximumFileBytes < 0 ||
    maximumFileBytes > Number.MAX_SAFE_INTEGER - MULTIPART_OVERHEAD_BYTES
  ) {
    return false;
  }
  const value = request.headers.get("content-length");
  if (value === null) return true;
  if (!/^(?:0|[1-9]\d{0,15})$/u.test(value)) return false;
  const length = Number(value);
  return (
    Number.isSafeInteger(length) &&
    length >= 0 &&
    length <= maximumFileBytes + MULTIPART_OVERHEAD_BYTES
  );
}

export function requestSourceAddress(request: Request): string | null {
  // Local development has no trusted reverse proxy boundary. Treat every
  // request as loopback and ignore caller-controlled forwarding headers so a
  // client cannot rotate X-Forwarded-For values to evade development limits.
  if (env.NODE_ENV !== "production") {
    return extractClientAddress(request.headers, {
      trustedProxyHops: 0,
      directAddress: "127.0.0.1",
    });
  }

  return extractClientAddress(request.headers, {
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
    directAddress: null,
  });
}

export function successRateLimitHeaders(metadata: RateLimitMetadata): Headers {
  const headers = new Headers(metadata.headers);
  headers.delete("Retry-After");
  return headers;
}

export function rateLimitFailureResponse(
  result: Exclude<UploadRateLimitResult, { allowed: true }>,
  requestId: string,
): Response {
  if (result.reason === "rate_limited") {
    return safeJsonError(
      429,
      "rate_limited",
      "Too many requests. Try again after the indicated delay.",
      requestId,
      result.headers,
    );
  }
  return safeJsonError(
    503,
    "rate_limit_unavailable",
    "Upload protection is temporarily unavailable.",
    requestId,
  );
}

export async function checkAuthenticationRateLimit(input: {
  candidate: string;
  sourceAddress: string;
}): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "api-key-authentication-source",
    userId: "all-candidates",
    sourceAddress: input.sourceAddress,
    limit: 120,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  const candidateDigest = createHash("sha256")
    .update(input.candidate, "utf8")
    .digest("base64url");
  return checkUploadRateLimit({
    apiKeyId: "api-key-authentication-candidate",
    userId: candidateDigest,
    sourceAddress: "0.0.0.0",
    limit: 60,
    windowMs: 60_000,
  });
}

export async function checkAuthenticatedUploadRateLimit(input: {
  userId: string;
  sourceAddress: string;
}): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "machine-upload-source",
    ...input,
    limit: 60,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  const accountLimit = await checkUploadRateLimit({
    apiKeyId: "machine-upload-account",
    userId: input.userId,
    sourceAddress: "0.0.0.0",
    limit: 120,
    windowMs: 60_000,
  });
  return accountLimit.allowed ? sourceLimit : accountLimit;
}

export async function checkBrowserMutationRateLimit(input: {
  userId: string;
  sourceAddress: string;
}): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "browser-session-source",
    userId: input.userId,
    sourceAddress: input.sourceAddress,
    limit: 60,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  const accountLimit = await checkUploadRateLimit({
    apiKeyId: "browser-session-account",
    userId: input.userId,
    sourceAddress: "0.0.0.0",
    limit: 120,
    windowMs: 60_000,
  });
  return accountLimit.allowed ? sourceLimit : accountLimit;
}

/**
 * Protect the session lookup itself. This bucket deliberately has no user
 * dimension: unauthenticated requests do not have one yet, and authenticated
 * requests from many accounts must still share a source-level ceiling.
 */
export async function checkBrowserMutationPreAuthRateLimit(
  sourceAddress: string,
): Promise<UploadRateLimitResult> {
  return checkUploadRateLimit({
    apiKeyId: "browser-mutation-pre-auth-source",
    userId: "all-sessions",
    sourceAddress,
    limit: 120,
    windowMs: 60_000,
  });
}

/** Bound every Auth.js handler before it can query Prisma or call the IdP. */
export async function checkAuthHandlerRateLimit(
  sourceAddress: string,
): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "auth-handler-source",
    userId: "all-auth-actions",
    sourceAddress,
    limit: 180,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  const networkLimit = await checkUploadRateLimit({
    apiKeyId: "auth-handler-network",
    userId: signInNetworkPartition(sourceAddress),
    sourceAddress: "0.0.0.0",
    limit: 600,
    windowMs: 60_000,
  });
  return networkLimit.allowed ? sourceLimit : networkLimit;
}

/**
 * Public media remains anonymous, but a cache-bypassing Range request receives
 * a tighter source ceiling before any database or object-storage work.
 */
export async function checkPublicMediaRateLimit(input: {
  sourceAddress: string;
  rangeRequested: boolean;
}): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "public-media-source",
    userId: "all-public-media",
    sourceAddress: input.sourceAddress,
    limit: 300,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed || !input.rangeRequested) return sourceLimit;

  const rangeLimit = await checkUploadRateLimit({
    apiKeyId: "public-media-range-source",
    userId: "all-public-media-ranges",
    sourceAddress: input.sourceAddress,
    limit: 120,
    windowMs: 60_000,
  });
  return rangeLimit.allowed ? sourceLimit : rangeLimit;
}

/**
 * Password verification invokes Argon2id and therefore gets a deliberately
 * small, fail-closed budget before any hash work. The per-object ceiling also
 * bounds a distributed guessing attempt against one protected link.
 */
export async function checkPublicMediaPasswordRateLimit(input: {
  sourceAddress: string;
  uploadId: string;
}): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "public-media-password-source",
    userId: "all-protected-media",
    sourceAddress: input.sourceAddress,
    limit: 12,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  const objectLimit = await checkUploadRateLimit({
    apiKeyId: "public-media-password-object",
    userId: input.uploadId,
    sourceAddress: "0.0.0.0",
    limit: 120,
    windowMs: 60_000,
  });
  return objectLimit.allowed ? sourceLimit : objectLimit;
}

export function signInNetworkPartition(sourceAddress: string): string {
  const version = isIP(sourceAddress);
  if (version === 4) {
    const octets = sourceAddress.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  if (version !== 6) throw new Error("Invalid sign-in source address");

  // WHATWG URL canonicalizes embedded IPv4 and redundant IPv6 zeroes without
  // DNS or network I/O. Expand that canonical value so every spelling of an
  // address maps to the same /64 partition.
  const hostname = new URL(`http://[${sourceAddress}]/`).hostname.slice(1, -1);
  const [left = "", right = ""] = hostname.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - leftParts.length - rightParts.length;
  const parts = [
    ...leftParts,
    ...Array.from({ length: missing }, () => "0"),
    ...rightParts,
  ];
  if (parts.length !== 8) throw new Error("Invalid IPv6 source address");
  const numericParts = parts.map((part) => Number.parseInt(part, 16));
  if (
    numericParts.slice(0, 5).every((part) => part === 0) &&
    numericParts[5] === 0xffff
  ) {
    const high = numericParts[6]!;
    const low = numericParts[7]!;
    return `${high >> 8}.${high & 0xff}.${low >> 8}.0/24`;
  }
  return `${numericParts
    .slice(0, 4)
    .map((part) => part.toString(16))
    .join(":")}::/64`;
}

export async function checkSignInStartRateLimit(
  sourceAddress: string,
): Promise<UploadRateLimitResult> {
  const sourceLimit = await checkUploadRateLimit({
    apiKeyId: "sign-in-start",
    userId: "anonymous",
    sourceAddress,
    limit: 10,
    windowMs: 60_000,
  });
  if (!sourceLimit.allowed) return sourceLimit;

  // A single deployment-wide counter lets a small distributed attacker deny
  // sign-in to everyone. A /24 (IPv4) or /64 (IPv6) partition retains a second
  // layer against source rotation on one network without creating one global
  // denial switch. The exact-source ceiling above remains the primary limit.
  const networkLimit = await checkUploadRateLimit({
    apiKeyId: "sign-in-start-network",
    userId: signInNetworkPartition(sourceAddress),
    sourceAddress: "0.0.0.0",
    limit: 40,
    windowMs: 60_000,
  });
  return networkLimit.allowed ? sourceLimit : networkLimit;
}

export async function checkGifVariantRateLimit(
  userId: string,
): Promise<UploadRateLimitResult> {
  return checkUploadRateLimit({
    apiKeyId: "gif-variant-account",
    userId,
    sourceAddress: "0.0.0.0",
    limit: 6,
    windowMs: 60_000,
  });
}
