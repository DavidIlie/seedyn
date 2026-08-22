import "server-only";

import { headers } from "next/headers";

import { env } from "~/env";
import { getUserResult } from "~/server/auth";
import {
  checkBrowserMutationPreAuthRateLimit,
  checkBrowserMutationRateLimit,
  checkBrowserUploadPartPreAuthRateLimit,
  checkBrowserUploadPartRateLimit,
  checkSignInStartRateLimit,
  createRequestId,
  hasExactAppOrigin,
  isAppHostRequest,
  rateLimitFailureResponse,
  requestSourceAddress,
  safeJsonError,
  successRateLimitHeaders,
} from "~/server/http/request";

type AuthorizedBrowserMutation = {
  requestId: string;
  userId: string;
  rateHeaders: Headers;
};

type AuthorizedPublicMutation = Omit<AuthorizedBrowserMutation, "userId">;

export async function authorizeBrowserMutation(
  request: Request,
  options?: { rateClass?: "mutation" | "upload-part" },
): Promise<AuthorizedBrowserMutation | Response> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", requestId);
  }
  if (!hasExactAppOrigin(request)) {
    return safeJsonError(
      403,
      "forbidden",
      "The request origin is not permitted.",
      requestId,
    );
  }

  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) {
    return safeJsonError(
      503,
      "rate_limit_unavailable",
      "Upload protection is temporarily unavailable.",
      requestId,
    );
  }
  const preAuthLimit =
    options?.rateClass === "upload-part"
      ? await checkBrowserUploadPartPreAuthRateLimit(sourceAddress)
      : await checkBrowserMutationPreAuthRateLimit(sourceAddress);
  if (!preAuthLimit.allowed) {
    return rateLimitFailureResponse(preAuthLimit, requestId);
  }

  let userResult;
  try {
    userResult = await getUserResult();
  } catch {
    return safeJsonError(
      503,
      "database_unavailable",
      "The authenticated service is temporarily unavailable.",
      requestId,
    );
  }
  if (!userResult.ok) {
    return safeJsonError(
      401,
      "unauthenticated",
      "Authentication is required.",
      requestId,
    );
  }

  const rateLimit =
    options?.rateClass === "upload-part"
      ? await checkBrowserUploadPartRateLimit({
          userId: userResult.user.id,
          sourceAddress,
        })
      : await checkBrowserMutationRateLimit({
          userId: userResult.user.id,
          sourceAddress,
        });
  if (!rateLimit.allowed) {
    return rateLimitFailureResponse(rateLimit, requestId);
  }
  return {
    requestId,
    userId: userResult.user.id,
    rateHeaders: successRateLimitHeaders(rateLimit),
  };
}

/**
 * Same protection for a same-origin browser control read. Browsers do not
 * consistently attach Origin to GET, so require an exact-origin Referer and
 * feed its serialized origin through the mutation guard.
 */
export async function authorizeBrowserControlRead(
  request: Request,
): Promise<AuthorizedBrowserMutation | Response> {
  if (request.headers.has("origin")) return authorizeBrowserMutation(request);
  const referer = request.headers.get("referer");
  let refererOrigin: string | null = null;
  try {
    refererOrigin = referer ? new URL(referer).origin : null;
  } catch {
    refererOrigin = null;
  }
  if (refererOrigin !== new URL(env.APP_URL).origin) {
    return safeJsonError(
      403,
      "forbidden",
      "The request origin is not permitted.",
      createRequestId(),
    );
  }
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("Origin", refererOrigin);
  return authorizeBrowserMutation(
    new Request(request.url, {
      method: request.method,
      headers: forwardedHeaders,
      signal: request.signal,
    }),
  );
}

/** Apply the same host, exact-Origin, session, and Redis checks to Server Actions. */
export async function authorizeServerActionMutation(): Promise<
  AuthorizedBrowserMutation | Response
> {
  const requestHeaders = await headers();
  return authorizeBrowserMutation(
    new Request(env.APP_URL, { method: "POST", headers: requestHeaders }),
  );
}

/** Guard a direct or Server Action sign-in start before it reaches the IdP. */
export async function authorizeSignInStart(
  request: Request,
): Promise<AuthorizedPublicMutation | Response> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", requestId);
  }
  if (!hasExactAppOrigin(request)) {
    return safeJsonError(
      403,
      "forbidden",
      "The request origin is not permitted.",
      requestId,
    );
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
  const rateLimit = await checkSignInStartRateLimit(sourceAddress);
  if (!rateLimit.allowed) return rateLimitFailureResponse(rateLimit, requestId);

  return { requestId, rateHeaders: successRateLimitHeaders(rateLimit) };
}

/** Guard a public Server Action before it invokes an external identity provider. */
export async function authorizePublicServerActionMutation(): Promise<
  AuthorizedPublicMutation | Response
> {
  const requestHeaders = await headers();
  return authorizeSignInStart(
    new Request(env.APP_URL, { method: "POST", headers: requestHeaders }),
  );
}
