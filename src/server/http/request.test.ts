import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    APP_HOSTS: "seedyn.dave.tips,seedyn.localhost,localhost",
    MEDIA_HOSTS: "i.dave.tips,i.localhost",
    APP_URL: "http://seedyn.localhost:3000",
    AUTH_SECRET: "test-secret",
    NODE_ENV: "development",
    POD_IP: "10.0.0.3",
    TRUSTED_PROXY_HOPS: 1,
  },
}));

import {
  contentLengthIsPermitted,
  hasExactAppOrigin,
  isAppHostRequest,
  isDirectProbeRequest,
  isMediaHostRequest,
  requestSourceAddress,
  safeJsonError,
} from "./request";

function request(
  url = "http://seedyn.localhost:3000/api/upload",
  headers: HeadersInit = {},
): Request {
  const merged = new Headers(headers);
  if (!merged.has("host")) merged.set("host", new URL(url).host);
  return new Request(url, { headers: merged });
}

describe("HTTP request trust boundary", () => {
  it("classifies only the actual Host header and ignores forwarded host", () => {
    const app = request(undefined, {
      "x-forwarded-host": "attacker.test",
    });
    expect(isAppHostRequest(app)).toBe(true);
    expect(isMediaHostRequest(app)).toBe(false);

    const poisoned = request(undefined, {
      host: "seedyn.localhost,attacker.test",
      "x-forwarded-host": "seedyn.localhost",
    });
    expect(isAppHostRequest(poisoned)).toBe(false);
    expect(
      isAppHostRequest(request(undefined, { host: "seedyn.localhost:99999" })),
    ).toBe(false);
  });

  it("requires an exact serialized Origin", () => {
    expect(
      hasExactAppOrigin(
        request(undefined, { origin: "http://seedyn.localhost:3000" }),
      ),
    ).toBe(true);

    for (const origin of [
      "http://seedyn.localhost:3000/",
      "http://seedyn.localhost:3000/path",
      "http://user@seedyn.localhost:3000",
      "http://seedyn.localhost:3000#fragment",
      "http://attacker.test",
      "null",
    ]) {
      expect(hasExactAppOrigin(request(undefined, { origin }))).toBe(false);
    }
  });

  it("rejects malformed and oversized Content-Length values before parsing", () => {
    const maximum = 1_000;
    expect(
      contentLengthIsPermitted(
        request(undefined, { "content-length": String(maximum + 128 * 1024) }),
        maximum,
      ),
    ).toBe(true);
    for (const value of [
      String(maximum + 128 * 1024 + 1),
      "-1",
      "+1",
      "01",
      "1, 1",
      "9007199254740992",
    ]) {
      expect(
        contentLengthIsPermitted(
          request(undefined, { "content-length": value }),
          maximum,
        ),
      ).toBe(false);
    }
    expect(contentLengthIsPermitted(request(), Number.MAX_SAFE_INTEGER)).toBe(
      false,
    );
  });

  it("ignores spoofed forwarding headers in local development", () => {
    expect(
      requestSourceAddress(
        request(undefined, { "x-forwarded-for": "198.51.100.77" }),
      ),
    ).toBe("127.0.0.1");
  });

  it("recognizes only literal-IP and localhost probe authorities", () => {
    expect(isDirectProbeRequest(request(undefined, { host: "10.0.0.3" }))).toBe(
      true,
    );
    expect(
      isDirectProbeRequest(request(undefined, { host: "localhost:3000" })),
    ).toBe(false);
    expect(
      isDirectProbeRequest(request(undefined, { host: "[::1]:3000" })),
    ).toBe(true);
    expect(isDirectProbeRequest(request(undefined, { host: "10.0.0.4" }))).toBe(
      false,
    );
    expect(
      isDirectProbeRequest(request(undefined, { host: "attacker.test" })),
    ).toBe(false);
    expect(
      isDirectProbeRequest(
        request(undefined, { host: "127.0.0.1,attacker.test" }),
      ),
    ).toBe(false);
  });

  it("returns a private structured error without permitting cache overrides", async () => {
    const response = safeJsonError(
      403,
      "forbidden",
      "The request is forbidden.",
      "req_test",
      { "Cache-Control": "public", "Retry-After": "4" },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("4");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "forbidden",
        message: "The request is forbidden.",
        requestId: "req_test",
      },
    });
  });
});
