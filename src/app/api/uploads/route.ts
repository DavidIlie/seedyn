import {
  decodeCursor,
  listUploadsByKind,
  publicUrl,
} from "~/components/data/uploads";
import { auth } from "~/server/auth";
import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { contentLengthIsPermitted, safeJsonError } from "~/server/http/request";
import {
  uploadMethodNotAllowed,
  uploadOptions,
} from "~/server/http/upload-route-methods";
import type { ForcedUploadKind } from "~/server/uploads/classification";
import {
  parseMultipartUpload,
  UPLOAD_LIMITS,
} from "~/server/uploads/multipart";
import { createUpload } from "~/server/uploads/service";

export const maxDuration = 120;
export const DELETE = uploadMethodNotAllowed;
export const HEAD = uploadMethodNotAllowed;
export const OPTIONS = uploadOptions;
export const PATCH = uploadMethodNotAllowed;
export const PUT = uploadMethodNotAllowed;

function requestedKind(value: string | undefined): ForcedUploadKind | null {
  if (value === undefined || value === "auto") return "auto";
  if (value === "image" || value === "file" || value === "text") return value;
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      {
        error: { code: "unauthenticated", message: "Sign in to view uploads." },
      },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (kind !== "images" && kind !== "files" && kind !== "texts") {
    return Response.json(
      {
        error: {
          code: "invalid_input",
          message: "The upload kind is invalid.",
        },
      },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const order = params.get("order") === "oldest" ? "oldest" : "newest";
  const limitValue = Number(params.get("limit") ?? "12");
  const limit = Number.isSafeInteger(limitValue)
    ? Math.min(50, Math.max(1, limitValue))
    : 12;
  const page = await listUploadsByKind({
    userId: session.user.id,
    kind,
    query: params.get("q") ?? undefined,
    order,
    cursor: decodeCursor(params.get("cursor") ?? undefined),
    limit,
  });
  return Response.json(
    {
      ...page,
      items: page.items.map((upload) =>
        Object.assign({}, upload, {
          url: publicUrl(upload.publicSlug, upload.extension),
        }),
      ),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;

  if (!contentLengthIsPermitted(request, UPLOAD_LIMITS.generic)) {
    return safeJsonError(
      413,
      "payload_too_large",
      "The multipart request exceeds the permitted size.",
      authorization.requestId,
    );
  }

  let file;
  try {
    file = await parseMultipartUpload(request, {
      permittedFileFields: new Set(["file"]),
      permittedScalarFields: new Set(["kind", "filename", "textLanguage"]),
      maxFileBytes: UPLOAD_LIMITS.generic,
    });
    const forcedKind = requestedKind(file.fields.kind);
    if (!forcedKind) {
      return safeJsonError(
        400,
        "invalid_input",
        "The kind field must be auto, image, file, or text.",
        authorization.requestId,
      );
    }
    const result = await createUpload({
      userId: authorization.userId,
      file,
      forcedKind,
      signal: request.signal,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    return Response.json(
      {
        id: result.upload.id,
        kind: result.upload.kind.toLowerCase(),
        url: result.url,
        message: result.url,
        upload: result.upload,
      },
      { status: 201, headers: authorization.rateHeaders },
    );
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  } finally {
    await file?.dispose().catch(() => undefined);
  }
}
