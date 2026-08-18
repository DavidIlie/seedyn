import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Auth from "~/server/auth";
import type * as RequestHelpers from "~/server/http/request";

type GetUserResult = typeof Auth.getUserResult;
type PreAuthLimit = typeof RequestHelpers.checkBrowserMutationPreAuthRateLimit;
type UserLimit = typeof RequestHelpers.checkBrowserMutationRateLimit;
type SourceAddress = typeof RequestHelpers.requestSourceAddress;

const mocks = vi.hoisted(() => ({
  getUserResult: vi.fn<GetUserResult>(),
  preAuthLimit: vi.fn<PreAuthLimit>(),
  userLimit: vi.fn<UserLimit>(),
  sourceAddress: vi.fn<SourceAddress>(),
}));

const allowed = {
  allowed: true as const,
  status: 200 as const,
  limit: 120,
  remaining: 119,
  resetAt: 2_000,
  retryAfterSeconds: 1,
  headers: {
    "RateLimit-Limit": "120",
    "RateLimit-Remaining": "119",
    "RateLimit-Reset": "2",
    "Retry-After": "1",
  },
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn<() => Promise<Headers>>(),
}));
vi.mock("~/env", () => ({
  env: { APP_URL: "http://seedyn.localhost:3000" },
}));
vi.mock("~/server/auth", () => ({ getUserResult: mocks.getUserResult }));
vi.mock("~/server/http/request", () => ({
  checkBrowserMutationPreAuthRateLimit: mocks.preAuthLimit,
  checkBrowserMutationRateLimit: mocks.userLimit,
  checkSignInStartRateLimit:
    vi.fn<typeof RequestHelpers.checkSignInStartRateLimit>(),
  createRequestId: () => "req_test",
  hasExactAppOrigin: (_request: Request) => true,
  isAppHostRequest: (_request: Request) => true,
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
  successRateLimitHeaders: (result: { headers: Record<string, string> }) =>
    new Headers(result.headers),
}));

import { authorizeBrowserMutation } from "./browser-mutation";

function mutationRequest(): Request {
  return new Request("http://seedyn.localhost:3000/api/uploads", {
    method: "POST",
    headers: {
      host: "seedyn.localhost:3000",
      origin: "http://seedyn.localhost:3000",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sourceAddress.mockReturnValue("127.0.0.1");
  mocks.preAuthLimit.mockResolvedValue(allowed);
  mocks.userLimit.mockResolvedValue(allowed);
  mocks.getUserResult.mockResolvedValue({
    ok: true,
    user: { id: "user_1", appRole: "MEMBER" },
  });
});

describe("browser mutation authorization", () => {
  it("charges the source bucket before an unauthenticated session lookup", async () => {
    const order: string[] = [];
    mocks.preAuthLimit.mockImplementation(async () => {
      order.push("pre-auth-limit");
      return allowed;
    });
    mocks.getUserResult.mockImplementation(async () => {
      order.push("session");
      return { ok: false, status: 401, error: "unauthorized" } as const;
    });

    const response = await authorizeBrowserMutation(mutationRequest());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(order).toEqual(["pre-auth-limit", "session"]);
    expect(mocks.userLimit).not.toHaveBeenCalled();
  });

  it("does no session or database work after a pre-auth rate failure", async () => {
    mocks.preAuthLimit.mockResolvedValue({
      ...allowed,
      allowed: false,
      status: 429,
      reason: "rate_limited",
      remaining: 0,
    });

    const response = await authorizeBrowserMutation(mutationRequest());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(429);
    expect(mocks.getUserResult).not.toHaveBeenCalled();
    expect(mocks.userLimit).not.toHaveBeenCalled();
  });

  it("retains the per-user limits after the pre-auth source limit", async () => {
    const result = await authorizeBrowserMutation(mutationRequest());

    expect(result).not.toBeInstanceOf(Response);
    expect(mocks.preAuthLimit).toHaveBeenCalledWith("127.0.0.1");
    expect(mocks.userLimit).toHaveBeenCalledWith({
      userId: "user_1",
      sourceAddress: "127.0.0.1",
    });
  });
});
