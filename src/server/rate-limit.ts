import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import type Redis from "ioredis";

import { env } from "~/env";
import { ensureRedisReady, getRedis } from "~/server/redis";

const RATE_LIMIT_DOMAIN = "seedyn:upload-rate-limit:v1";
const MAX_FORWARDED_HEADER_LENGTH = 1_024;
const MAX_FORWARDED_ADDRESSES = 16;

const FIXED_WINDOW_SCRIPT = `
local time = redis.call("TIME")
local now_ms = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local window_ms = tonumber(ARGV[1])
local bucket = math.floor(now_ms / window_ms)
local reset_at = (bucket + 1) * window_ms
local key = KEYS[1] .. ":" .. tostring(bucket)
local count = redis.call("INCR", key)
if count == 1 then
  redis.call("PEXPIREAT", key, reset_at)
end
return { count, reset_at, now_ms }
`;

interface HeaderReader {
  get(name: string): string | null;
}

export interface ClientAddressOptions {
  trustedProxyHops: number;
  directAddress?: string | null;
}

export interface UploadRateLimitInput {
  apiKeyId: string;
  userId: string;
  sourceAddress: string;
  limit: number;
  windowMs: number;
  authSecret?: string;
}

export interface RateLimitMetadata {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  headers: Readonly<Record<string, string>>;
}

export type UploadRateLimitResult =
  | ({ allowed: true; status: 200 } & RateLimitMetadata)
  | ({
      allowed: false;
      status: 429;
      reason: "rate_limited";
    } & RateLimitMetadata)
  | {
      allowed: false;
      status: 503;
      reason: "redis_unavailable";
    };

function parseAddress(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const normalized = candidate.trim();
  return isIP(normalized) === 0 ? null : normalized;
}

export function extractClientAddress(
  headers: HeaderReader,
  options: ClientAddressOptions,
): string | null {
  const { trustedProxyHops, directAddress } = options;
  if (
    !Number.isInteger(trustedProxyHops) ||
    trustedProxyHops < 0 ||
    trustedProxyHops > MAX_FORWARDED_ADDRESSES
  ) {
    return null;
  }

  const direct = parseAddress(directAddress);
  if (directAddress && !direct) return null;

  // With no trusted proxy, forwarded headers are attacker-controlled and are
  // deliberately ignored. A caller must supply the actual socket peer.
  if (trustedProxyHops === 0) return direct;

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded || forwarded.length > MAX_FORWARDED_HEADER_LENGTH) return null;

  const rawChain = forwarded.split(",");
  if (rawChain.length === 0 || rawChain.length > MAX_FORWARDED_ADDRESSES) {
    return null;
  }

  const chain = rawChain.map(parseAddress);
  if (chain.some((address) => address === null)) return null;

  if (direct) chain.push(direct);

  const clientIndex = direct
    ? chain.length - trustedProxyHops - 1
    : chain.length - trustedProxyHops;
  if (clientIndex < 0) return null;

  return chain[clientIndex] ?? null;
}

export function deriveUploadRateLimitKey(
  authSecret: string,
  dimensions: Pick<
    UploadRateLimitInput,
    "apiKeyId" | "userId" | "sourceAddress"
  >,
): string {
  if (
    authSecret.length === 0 ||
    dimensions.apiKeyId.length === 0 ||
    dimensions.userId.length === 0 ||
    parseAddress(dimensions.sourceAddress) === null
  ) {
    throw new Error("Invalid upload rate-limit dimensions");
  }

  const digest = createHmac("sha256", authSecret)
    .update(`${RATE_LIMIT_DOMAIN}\0`, "utf8")
    .update(
      JSON.stringify([
        dimensions.apiKeyId,
        dimensions.userId,
        dimensions.sourceAddress,
      ]),
      "utf8",
    )
    .digest("base64url");

  // The hash tag keeps dynamically suffixed fixed-window keys in one Redis
  // Cluster slot without exposing any identifier in Redis.
  return `seedyn:rl:{${digest}}`;
}

function metadata(
  limit: number,
  count: number,
  resetAt: number,
  nowMs: number,
): RateLimitMetadata {
  const remaining = Math.max(0, limit - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - nowMs) / 1_000));

  return {
    limit,
    remaining,
    resetAt,
    retryAfterSeconds,
    headers: {
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(Math.ceil(resetAt / 1_000)),
      "Retry-After": String(retryAfterSeconds),
    },
  };
}

function parseScriptResult(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const parsed = value.map(Number);
  if (parsed.some((item) => !Number.isSafeInteger(item) || item < 0)) {
    return null;
  }

  return [parsed[0]!, parsed[1]!, parsed[2]!];
}

export async function checkUploadRateLimit(
  input: UploadRateLimitInput,
  redis: Redis = getRedis(),
): Promise<UploadRateLimitResult> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 10_000 ||
    !Number.isInteger(input.windowMs) ||
    input.windowMs < 1_000 ||
    input.windowMs > 24 * 60 * 60 * 1_000
  ) {
    return {
      allowed: false,
      status: 503,
      reason: "redis_unavailable",
    };
  }

  const authSecret = input.authSecret ?? env.AUTH_SECRET;
  if (!authSecret) {
    return {
      allowed: false,
      status: 503,
      reason: "redis_unavailable",
    };
  }

  try {
    const key = deriveUploadRateLimitKey(authSecret, {
      apiKeyId: input.apiKeyId,
      userId: input.userId,
      sourceAddress: input.sourceAddress,
    });
    await ensureRedisReady(redis);
    const raw = await redis.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      key,
      String(input.windowMs),
    );
    const result = parseScriptResult(raw);
    if (!result) throw new Error("Invalid Redis rate-limit response");

    const [count, resetAt, nowMs] = result;
    const values = metadata(input.limit, count, resetAt, nowMs);

    if (count > input.limit) {
      return {
        allowed: false,
        status: 429,
        reason: "rate_limited",
        ...values,
      };
    }

    return {
      allowed: true,
      status: 200,
      ...values,
    };
  } catch {
    return {
      allowed: false,
      status: 503,
      reason: "redis_unavailable",
    };
  }
}
