import { pollCliAuthRequest } from "~/server/cli-auth/service";
import {
  checkAuthenticationRateLimit,
  createRequestId,
  isAppHostRequest,
  rateLimitFailureResponse,
  requestSourceAddress,
  safeJsonError,
} from "~/server/http/request";

function bearer(request: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(
    request.headers.get("authorization") ?? "",
  );
  return match?.[1] ?? null;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/cli-auth/poll/[requestId]">,
): Promise<Response> {
  const responseRequestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", responseRequestId);
  }
  const pollSecret = bearer(request);
  if (!pollSecret) {
    return safeJsonError(
      401,
      "unauthenticated",
      "A poll credential is required.",
      responseRequestId,
    );
  }
  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) {
    return safeJsonError(
      503,
      "rate_limit_unavailable",
      "Request protection is unavailable.",
      responseRequestId,
    );
  }
  const limit = await checkAuthenticationRateLimit({
    candidate: pollSecret,
    sourceAddress,
  });
  if (!limit.allowed) return rateLimitFailureResponse(limit, responseRequestId);

  const { requestId } = await context.params;
  const result = await pollCliAuthRequest({ id: requestId, pollSecret });
  if (result.status === "pending") {
    return Response.json(
      { status: "pending" },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (result.status === "approved") {
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(
    {
      error: {
        code: result.status,
        message: "This login request is no longer available.",
      },
    },
    {
      status: result.status === "missing" ? 404 : 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
