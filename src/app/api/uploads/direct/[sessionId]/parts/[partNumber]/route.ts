import { Readable } from "node:stream";

import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { isAppHostRequest, isMediaHostRequest } from "~/server/http/request";
import { ingestDirectUploadPart } from "~/server/uploads/direct/session";
import { DomainError } from "~/server/uploads/errors";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ sessionId: string; partNumber: string }>;
};

function unavailableMethod(request: Request): Response {
  const status = isAppHostRequest(request)
    ? 405
    : isMediaHostRequest(request)
      ? 404
      : 421;
  return new Response(null, {
    status,
    headers: {
      Allow: "PUT",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request, {
    rateClass: "upload-part",
  });
  if (authorization instanceof Response) return authorization;
  try {
    if (!request.body) throw new DomainError("invalid_input");
    const { sessionId, partNumber: rawPartNumber } = await context.params;
    if (!/^[1-9]\d{0,4}$/u.test(rawPartNumber)) {
      throw new DomainError("invalid_input");
    }
    const rawLength = request.headers.get("content-length");
    if (!rawLength || !/^[1-9]\d{0,8}$/u.test(rawLength)) {
      throw new DomainError("invalid_input", {
        message: "Content-Length is required for each upload part.",
      });
    }
    const eTag = await ingestDirectUploadPart({
      sessionId,
      userId: authorization.userId,
      partNumber: Number(rawPartNumber),
      contentLength: Number(rawLength),
      body: Readable.fromWeb(request.body),
      signal: request.signal,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    authorization.rateHeaders.set("ETag", eTag);
    return new Response(null, {
      status: 200,
      headers: authorization.rateHeaders,
    });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}

export const DELETE = unavailableMethod;
export const GET = unavailableMethod;
export const HEAD = unavailableMethod;
export const OPTIONS = unavailableMethod;
export const PATCH = unavailableMethod;
export const POST = unavailableMethod;
