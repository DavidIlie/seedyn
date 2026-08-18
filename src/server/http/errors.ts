import { asDomainError, safeErrorCategory } from "~/server/uploads/errors";

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

function logServerFailure(
  error: ReturnType<typeof asDomainError>,
  requestId: string,
): void {
  if (error.status < 500) return;

  const safeRequestId = /^[A-Za-z0-9_-]{1,80}$/u.test(requestId)
    ? requestId
    : "req_invalid";
  const event = {
    event: "http_request_failed",
    requestId: safeRequestId,
    code: error.code,
    status: error.status,
    causeCategory: safeErrorCategory(error.cause),
  } as const;

  // Never serialize the Error, its message, stack, request headers, filename,
  // or body. Dependency error codes are reduced to a bounded allowlisted shape
  // by safeErrorCategory(), while requestId keeps the client response
  // correlatable with this operator-facing event.
  try {
    console.error(JSON.stringify(event));
  } catch {
    // Logging must never replace the original safe HTTP response.
  }
}

export function domainErrorResponse(
  error: unknown,
  requestId: string,
): Response {
  const safe = asDomainError(error);
  logServerFailure(safe, requestId);
  const body: ErrorEnvelope = {
    error: {
      code: safe.code,
      message: safe.message,
      requestId,
    },
  };

  return Response.json(body, {
    status: safe.status,
    headers: { "Cache-Control": "no-store" },
  });
}
