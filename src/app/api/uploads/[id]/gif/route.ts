import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import {
  checkGifVariantRateLimit,
  contentLengthIsPermitted,
  rateLimitFailureResponse,
  safeJsonError,
  successRateLimitHeaders,
} from "~/server/http/request";
import {
  uploadMethodNotAllowed,
  uploadOptions,
} from "~/server/http/upload-route-methods";
import {
  parseMultipartUpload,
  UPLOAD_LIMITS,
} from "~/server/uploads/multipart";
import { createGifVariant } from "~/server/uploads/service";

export const maxDuration = 120;
export const DELETE = uploadMethodNotAllowed;
export const GET = uploadMethodNotAllowed;
export const HEAD = uploadMethodNotAllowed;
export const OPTIONS = uploadOptions;
export const PATCH = uploadMethodNotAllowed;
export const PUT = uploadMethodNotAllowed;

type Context = { params: Promise<{ id: string }> };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const activeGifUsers = new Set<string>();

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return safeJsonError(
      404,
      "not_found",
      "The requested item was not found.",
      authorization.requestId,
    );
  }

  if (!contentLengthIsPermitted(request, UPLOAD_LIMITS.gif)) {
    return safeJsonError(
      413,
      "payload_too_large",
      "The GIF exceeds the permitted size.",
      authorization.requestId,
    );
  }

  const gifLimit = await checkGifVariantRateLimit(authorization.userId);
  if (!gifLimit.allowed) {
    return rateLimitFailureResponse(gifLimit, authorization.requestId);
  }
  if (activeGifUsers.has(authorization.userId)) {
    return safeJsonError(
      429,
      "rate_limited",
      "A GIF is already being validated for this account.",
      authorization.requestId,
      { "Retry-After": "1" },
    );
  }
  activeGifUsers.add(authorization.userId);

  let file;
  try {
    file = await parseMultipartUpload(request, {
      permittedFileFields: new Set(["file"]),
      permittedScalarFields: new Set(),
      maxFileBytes: UPLOAD_LIMITS.gif,
    });
    const result = await createGifVariant({
      userId: authorization.userId,
      uploadId: id,
      file,
      signal: request.signal,
    });
    const rateHeaders = successRateLimitHeaders(gifLimit);
    rateHeaders.set("Cache-Control", "no-store");
    return Response.json(
      {
        id: result.variant.id,
        url: result.url,
        created: result.created,
        variant: result.variant,
      },
      {
        status: result.created ? 201 : 200,
        headers: rateHeaders,
      },
    );
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  } finally {
    activeGifUsers.delete(authorization.userId);
    await file?.dispose().catch(() => undefined);
  }
}
