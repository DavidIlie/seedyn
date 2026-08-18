import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import type * as RequestHelpers from "~/server/http/request";

type AuthPost = (request: NextRequest) => Promise<Response>;
type AuthGet = (request: NextRequest) => Promise<Response>;
type AuthorizeSignIn = (
  request: NextRequest,
) => Promise<{ requestId: string; rateHeaders: Headers } | Response>;
type AuthHandlerLimit = typeof RequestHelpers.checkAuthHandlerRateLimit;
type SourceAddress = typeof RequestHelpers.requestSourceAddress;

const mocks = vi.hoisted(() => ({
  authGet: vi.fn<AuthGet>(),
  authPost: vi.fn<AuthPost>(),
  authorizeSignIn: vi.fn<AuthorizeSignIn>(),
  authHandlerLimit: vi.fn<AuthHandlerLimit>(),
  sourceAddress: vi.fn<SourceAddress>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => ({
  handlers: {
    GET: mocks.authGet,
    POST: mocks.authPost,
  },
}));
vi.mock("~/server/http/browser-mutation", () => ({
  authorizeSignInStart: mocks.authorizeSignIn,
}));
vi.mock("~/server/http/request", () => ({
  checkAuthHandlerRateLimit: mocks.authHandlerLimit,
  createRequestId: () => "req_test",
  isAppHostRequest: (request: Request) =>
    request.headers.get("host") === "seedyn.localhost:3000",
  rateLimitFailureResponse: (
    result: { status: number; headers?: Record<string, string> },
    requestId: string,
  ) =>
    Response.json(
      { error: { code: "rate_limited", requestId } },
      { status: result.status, headers: result.headers },
    ),
  requestSourceAddress: mocks.sourceAddress,
  safeJsonError: (
    status: number,
    code: string,
    message: string,
    requestId: string,
  ) => Response.json({ error: { code, message, requestId } }, { status }),
}));

import { GET, POST } from "./route";

function authRequest(
  path: string,
  method: "GET" | "POST" = "POST",
  host = "seedyn.localhost:3000",
): NextRequest {
  return new Request(`http://seedyn.localhost:3000${path}`, {
    method,
    headers: {
      host,
      origin: "http://seedyn.localhost:3000",
    },
  }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sourceAddress.mockReturnValue("127.0.0.1");
  mocks.authHandlerLimit.mockResolvedValue({
    allowed: true,
    status: 200,
    limit: 180,
    remaining: 179,
    resetAt: 2_000,
    retryAfterSeconds: 1,
    headers: {},
  });
  mocks.authorizeSignIn.mockResolvedValue({
    requestId: "req_test",
    rateHeaders: new Headers(),
  });
  mocks.authGet.mockResolvedValue(Response.json({ user: null }));
  mocks.authPost.mockResolvedValue(new Response(null, { status: 302 }));
});

describe("Auth.js route boundary", () => {
  it("rejects non-app hosts for GET and non-signin POST handlers", async () => {
    const getResponse = await GET(
      authRequest("/api/auth/session", "GET", "i.localhost:3000"),
    );
    const postResponse = await POST(
      authRequest("/api/auth/callback/davidapps", "POST", "i.localhost:3000"),
    );

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(mocks.authGet).not.toHaveBeenCalled();
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("rejects direct sign-in starts on a non-app host", async () => {
    const response = await POST(
      authRequest("/api/auth/signin/davidapps", "POST", "i.localhost:3000"),
    );

    expect(response.status).toBe(404);
    expect(mocks.authorizeSignIn).not.toHaveBeenCalled();
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("rate-limits GET session requests before Auth.js", async () => {
    const request = authRequest("/api/auth/session", "GET");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.authHandlerLimit).toHaveBeenCalledWith("127.0.0.1");
    expect(mocks.authGet).toHaveBeenCalledWith(request);
  });

  it("does not call a GET handler after its source limit rejects", async () => {
    mocks.authHandlerLimit.mockResolvedValue({
      allowed: false,
      status: 429,
      reason: "rate_limited",
      limit: 180,
      remaining: 0,
      resetAt: 2_000,
      retryAfterSeconds: 1,
      headers: { "Retry-After": "1" },
    });

    const response = await GET(authRequest("/api/auth/session", "GET"));

    expect(response.status).toBe(429);
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("rate-limits a direct provider sign-in start before Auth.js", async () => {
    const request = authRequest("/api/auth/signin/davidapps");

    const response = await POST(request);

    expect(response.status).toBe(302);
    expect(mocks.authorizeSignIn).toHaveBeenCalledWith(request);
    expect(mocks.authHandlerLimit).not.toHaveBeenCalled();
    expect(mocks.authPost).toHaveBeenCalledWith(request);
  });

  it("does not call Auth.js after the sign-in guard rejects", async () => {
    mocks.authorizeSignIn.mockResolvedValue(
      Response.json(
        { error: { code: "rate_limited", requestId: "req_test" } },
        { status: 429 },
      ),
    );

    const response = await POST(authRequest("/api/auth/signin/davidapps"));

    expect(response.status).toBe(429);
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it.each([
    "/api/auth/callback/davidapps",
    "/api/auth/signout",
    "/api/auth/session",
  ])("does not apply a sign-in-start limit to %s", async (path) => {
    const request = authRequest(path);

    await POST(request);

    expect(mocks.authorizeSignIn).not.toHaveBeenCalled();
    expect(mocks.authHandlerLimit).toHaveBeenCalledWith("127.0.0.1");
    expect(mocks.authPost).toHaveBeenCalledWith(request);
  });
});
