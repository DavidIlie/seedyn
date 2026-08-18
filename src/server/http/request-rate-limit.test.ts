import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "~/server/rate-limit";

type CheckRateLimit = typeof RateLimit.checkUploadRateLimit;

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn<CheckRateLimit>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    APP_HOSTS: "seedyn.localhost",
    MEDIA_HOSTS: "i.localhost",
    APP_URL: "http://seedyn.localhost:3000",
    AUTH_SECRET: "test-secret",
    NODE_ENV: "test",
    TRUSTED_PROXY_HOPS: 1,
  },
}));
vi.mock("~/server/rate-limit", () => ({
  checkUploadRateLimit: mocks.checkRateLimit,
  extractClientAddress: vi.fn<typeof RateLimit.extractClientAddress>(),
}));

import {
  checkAuthHandlerRateLimit,
  checkBrowserMutationPreAuthRateLimit,
  checkPublicMediaRateLimit,
  checkSignInStartRateLimit,
  signInNetworkPartition,
} from "./request";

function allowed(limit: number) {
  return {
    allowed: true as const,
    status: 200 as const,
    limit,
    remaining: limit - 1,
    resetAt: 2_000,
    retryAfterSeconds: 1,
    headers: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockImplementation(async (input) =>
    allowed(input.limit),
  );
});

describe("HTTP mutation rate-limit layers", () => {
  it("uses a source-only pre-auth bucket before a user identity exists", async () => {
    await checkBrowserMutationPreAuthRateLimit("192.0.2.10");

    expect(mocks.checkRateLimit).toHaveBeenCalledWith({
      apiKeyId: "browser-mutation-pre-auth-source",
      userId: "all-sessions",
      sourceAddress: "192.0.2.10",
      limit: 120,
      windowMs: 60_000,
    });
  });

  it("layers Auth.js handler limits by source and source network", async () => {
    await checkAuthHandlerRateLimit("192.0.2.10");

    expect(mocks.checkRateLimit.mock.calls.map(([input]) => input)).toEqual([
      {
        apiKeyId: "auth-handler-source",
        userId: "all-auth-actions",
        sourceAddress: "192.0.2.10",
        limit: 180,
        windowMs: 60_000,
      },
      {
        apiKeyId: "auth-handler-network",
        userId: "192.0.2.0/24",
        sourceAddress: "0.0.0.0",
        limit: 600,
        windowMs: 60_000,
      },
    ]);
  });

  it("gives cache-bypassing public ranges a tighter source ceiling", async () => {
    await checkPublicMediaRateLimit({
      sourceAddress: "192.0.2.10",
      rangeRequested: false,
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledOnce();

    mocks.checkRateLimit.mockClear();
    await checkPublicMediaRateLimit({
      sourceAddress: "192.0.2.10",
      rangeRequested: true,
    });
    expect(mocks.checkRateLimit.mock.calls.map(([input]) => input)).toEqual([
      {
        apiKeyId: "public-media-source",
        userId: "all-public-media",
        sourceAddress: "192.0.2.10",
        limit: 300,
        windowMs: 60_000,
      },
      {
        apiKeyId: "public-media-range-source",
        userId: "all-public-media-ranges",
        sourceAddress: "192.0.2.10",
        limit: 120,
        windowMs: 60_000,
      },
    ]);
  });

  it("partitions the aggregate sign-in valve by IPv4 /24", async () => {
    expect(signInNetworkPartition("192.0.2.1")).toBe("192.0.2.0/24");
    expect(signInNetworkPartition("192.0.2.200")).toBe("192.0.2.0/24");
    expect(signInNetworkPartition("198.51.100.1")).toBe("198.51.100.0/24");

    await checkSignInStartRateLimit("192.0.2.1");
    const firstNetwork = mocks.checkRateLimit.mock.calls[1]?.[0];
    mocks.checkRateLimit.mockClear();
    await checkSignInStartRateLimit("198.51.100.1");
    const secondNetwork = mocks.checkRateLimit.mock.calls[1]?.[0];

    expect(firstNetwork).toMatchObject({
      apiKeyId: "sign-in-start-network",
      userId: "192.0.2.0/24",
      sourceAddress: "0.0.0.0",
      limit: 40,
      windowMs: 60_000,
    });
    expect(secondNetwork).toMatchObject({
      apiKeyId: "sign-in-start-network",
      userId: "198.51.100.0/24",
      sourceAddress: "0.0.0.0",
      limit: 40,
      windowMs: 60_000,
    });
  });

  it("normalizes equivalent IPv6 addresses into a /64 partition", () => {
    expect(signInNetworkPartition("2001:db8:abcd:12::1")).toBe(
      "2001:db8:abcd:12::/64",
    );
    expect(signInNetworkPartition("2001:0db8:abcd:0012:ffff::2")).toBe(
      "2001:db8:abcd:12::/64",
    );
    expect(signInNetworkPartition("2001:db8:abcd:13::1")).toBe(
      "2001:db8:abcd:13::/64",
    );
    expect(signInNetworkPartition("::ffff:192.0.2.199")).toBe("192.0.2.0/24");
  });

  it("does not consume a network bucket after the per-source limit rejects", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      ...allowed(10),
      allowed: false,
      status: 429,
      reason: "rate_limited",
      remaining: 0,
    });

    await checkSignInStartRateLimit("192.0.2.1");

    expect(mocks.checkRateLimit).toHaveBeenCalledOnce();
  });
});
