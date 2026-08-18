import { beforeAll, describe, expect, it, vi } from "vitest";
import type * as RateLimitModuleNamespace from "./rate-limit";

type RateLimitModule = typeof RateLimitModuleNamespace;

let rateLimit: RateLimitModule;

vi.mock("server-only", () => ({}));

beforeAll(async () => {
  vi.stubEnv("SKIP_ENV_VALIDATION", "true");
  rateLimit = await import("./rate-limit");
});

function headers(value: string | null) {
  return {
    get(name: string) {
      return name.toLowerCase() === "x-forwarded-for" ? value : null;
    },
  };
}

describe("trusted client addresses", () => {
  it("ignores forwarded headers when no proxy is trusted", () => {
    expect(
      rateLimit.extractClientAddress(headers("198.51.100.1"), {
        trustedProxyHops: 0,
        directAddress: "203.0.113.2",
      }),
    ).toBe("203.0.113.2");
  });

  it("selects from the trusted right side of a forwarded chain", () => {
    expect(
      rateLimit.extractClientAddress(headers("192.0.2.50, 198.51.100.8"), {
        trustedProxyHops: 1,
      }),
    ).toBe("198.51.100.8");

    expect(
      rateLimit.extractClientAddress(headers("192.0.2.50, 198.51.100.8"), {
        trustedProxyHops: 1,
        directAddress: "203.0.113.10",
      }),
    ).toBe("198.51.100.8");
  });

  it("rejects malformed or insufficient forwarding chains", () => {
    expect(
      rateLimit.extractClientAddress(headers("unknown"), {
        trustedProxyHops: 1,
      }),
    ).toBeNull();
    expect(
      rateLimit.extractClientAddress(headers("192.0.2.1"), {
        trustedProxyHops: 2,
      }),
    ).toBeNull();
    expect(
      rateLimit.extractClientAddress(headers("192.0.2.1:8080"), {
        trustedProxyHops: 1,
      }),
    ).toBeNull();
  });
});

describe("rate-limit identifiers", () => {
  it("HMACs every Redis-visible dimension with domain separation", () => {
    const input = {
      apiKeyId: "key-id",
      userId: "user-id",
      sourceAddress: "192.0.2.1",
    };
    const first = rateLimit.deriveUploadRateLimitKey("secret-one", input);
    const second = rateLimit.deriveUploadRateLimitKey("secret-two", input);

    expect(first).not.toBe(second);
    expect(first).not.toContain(input.apiKeyId);
    expect(first).not.toContain(input.userId);
    expect(first).not.toContain(input.sourceAddress);
  });

  it("does not let policy fields fork a caller's bucket identity", () => {
    const dimensions = {
      apiKeyId: "key-id",
      userId: "user-id",
      sourceAddress: "192.0.2.1",
    };
    const expected = rateLimit.deriveUploadRateLimitKey("secret", dimensions);
    const widened = {
      ...dimensions,
      limit: 1,
      windowMs: 1_000,
      authSecret: "different-enumerable-value",
    };
    expect(rateLimit.deriveUploadRateLimitKey("secret", widened)).toBe(
      expected,
    );
  });

  it("returns exact 429 metadata and distinguishes Redis failure", async () => {
    const fakeRedis = {
      status: "ready",
      eval: vi
        .fn<() => Promise<number[]>>()
        .mockResolvedValue([6, 60_000, 55_500]),
    } as unknown as NonNullable<
      Parameters<RateLimitModule["checkUploadRateLimit"]>[1]
    >;
    const input = {
      apiKeyId: "key-id",
      userId: "user-id",
      sourceAddress: "192.0.2.1",
      limit: 5,
      windowMs: 60_000,
      authSecret: "test-auth-secret",
    };

    await expect(
      rateLimit.checkUploadRateLimit(input, fakeRedis),
    ).resolves.toEqual({
      allowed: false,
      status: 429,
      reason: "rate_limited",
      limit: 5,
      remaining: 0,
      resetAt: 60_000,
      retryAfterSeconds: 5,
      headers: {
        "RateLimit-Limit": "5",
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": "60",
        "Retry-After": "5",
      },
    });

    const failedRedis = {
      status: "ready",
      eval: vi
        .fn<() => Promise<never>>()
        .mockRejectedValue(new Error("transport unavailable")),
    } as unknown as NonNullable<
      Parameters<RateLimitModule["checkUploadRateLimit"]>[1]
    >;

    await expect(
      rateLimit.checkUploadRateLimit(input, failedRedis),
    ).resolves.toEqual({
      allowed: false,
      status: 503,
      reason: "redis_unavailable",
    });
  });
});
