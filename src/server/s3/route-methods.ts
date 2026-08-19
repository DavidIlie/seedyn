import { isAppHostRequest } from "~/server/http/request";

import { S3ProtocolError } from "./errors";
import { createS3RequestId, s3ErrorResponse } from "./xml";

export function unsupportedS3Method(request: Request): Response {
  if (!isAppHostRequest(request)) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const requestId = createS3RequestId();
  let resource = "/";
  try {
    resource = new URL(request.url).pathname;
  } catch {
    // Keep the bounded root resource in the error document.
  }
  return s3ErrorResponse({
    error: new S3ProtocolError(
      "NotImplemented",
      "This S3 operation is not supported.",
    ),
    head: request.method === "HEAD",
    requestId,
    resource,
  });
}
