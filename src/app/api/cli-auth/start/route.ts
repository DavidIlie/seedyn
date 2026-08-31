import { env } from "~/env";
import {
  CliAuthInputError,
  startCliAuthRequest,
} from "~/server/cli-auth/service";
import {
  checkAuthenticationRateLimit,
  contentLengthIsPermitted,
  createRequestId,
  isAppHostRequest,
  rateLimitFailureResponse,
  requestSourceAddress,
  safeJsonError,
} from "~/server/http/request";

export async function POST(request: Request): Promise<Response> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", requestId);
  }
  if (!contentLengthIsPermitted(request, 2_048)) {
    return safeJsonError(
      413,
      "payload_too_large",
      "The request is too large.",
      requestId,
    );
  }
  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) {
    return safeJsonError(
      503,
      "rate_limit_unavailable",
      "Request protection is unavailable.",
      requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return safeJsonError(400, "invalid_input", "Invalid JSON.", requestId);
  }
  const publicKey =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { publicKey?: unknown }).publicKey
      : undefined;
  const limit = await checkAuthenticationRateLimit({
    candidate: typeof publicKey === "string" ? publicKey : "invalid",
    sourceAddress,
  });
  if (!limit.allowed) return rateLimitFailureResponse(limit, requestId);

  try {
    const started = await startCliAuthRequest(publicKey);
    const verificationUrl = new URL(`/cli-auth/${started.id}`, env.APP_URL);
    return Response.json(
      {
        requestId: started.id,
        pollSecret: started.pollSecret,
        verificationUrl: verificationUrl.toString(),
        expiresAt: started.expiresAt.toISOString(),
        intervalSeconds: 2,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CliAuthInputError) {
      return safeJsonError(400, "invalid_input", error.message, requestId);
    }
    return safeJsonError(
      503,
      "database_unavailable",
      "CLI authentication is unavailable.",
      requestId,
    );
  }
}
