import type { NextRequest } from "next/server";

import { handlers } from "~/server/auth";
import { authorizeSignInStart } from "~/server/http/browser-mutation";
import {
  checkAuthHandlerRateLimit,
  createRequestId,
  isAppHostRequest,
  rateLimitFailureResponse,
  requestSourceAddress,
  safeJsonError,
} from "~/server/http/request";

const SIGN_IN_START_PATH = /^\/api\/auth\/signin(?:\/[^/]+)?\/?$/u;

async function authorizeAuthHandler(
  request: Request,
): Promise<Response | null> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", requestId);
  }
  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) {
    return safeJsonError(
      503,
      "rate_limit_unavailable",
      "Request protection is temporarily unavailable.",
      requestId,
    );
  }
  const rateLimit = await checkAuthHandlerRateLimit(sourceAddress);
  return rateLimit.allowed
    ? null
    : rateLimitFailureResponse(rateLimit, requestId);
}

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = await authorizeAuthHandler(request);
  return rejected ?? handlers.GET(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", createRequestId());
  }
  // Auth.js also exposes direct POST sign-in starts. Protect those without
  // applying same-origin checks or rate limits to OIDC callback POSTs.
  if (SIGN_IN_START_PATH.test(new URL(request.url).pathname)) {
    const authorization = await authorizeSignInStart(request);
    if (authorization instanceof Response) return authorization;
  } else {
    const rejected = await authorizeAuthHandler(request);
    if (rejected) return rejected;
  }
  return handlers.POST(request);
}
