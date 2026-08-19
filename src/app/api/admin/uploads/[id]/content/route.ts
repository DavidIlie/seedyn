import { Readable } from "node:stream";

import { contentDispositionHeader } from "~/server/media/disposition";
import { parseSingleByteRange } from "~/server/media/range";
import { matchesManagedMetadata } from "~/server/storage/object-store";
import type { ByteRange } from "~/server/storage/object-store";
import { objectStore } from "~/server/storage/minio";
import { db } from "~/server/db";
import { adminNotFound, authorizeAdminRead } from "~/server/admin/http";

type Context = { params: Promise<{ id: string }> };

const MAX_TEXT_PREVIEW_BYTES = 64 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const PREVIEW_CSP =
  "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

type PreviewUpload = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "TEXT" | "FILE";
  originalName: string;
  contentType: string;
  byteSize: bigint;
  sha256: Uint8Array;
  storageKey: string;
};

function unavailable(): Response {
  return new Response(null, {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": PREVIEW_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function previewHeaders(input: {
  contentLength: number;
  contentType: string;
  filename: string;
  range?: ByteRange;
  totalLength: number;
  truncatedText?: boolean;
}): Headers {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": contentDispositionHeader("INLINE", input.filename),
    "Content-Length": String(input.contentLength),
    "Content-Security-Policy": PREVIEW_CSP,
    "Content-Type": input.contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    Vary: "Cookie, Range",
    "X-Content-Type-Options": "nosniff",
  });
  if (!input.truncatedText) headers.set("Accept-Ranges", "bytes");
  if (input.range) {
    headers.set(
      "Content-Range",
      `bytes ${input.range.start}-${input.range.end}/${input.totalLength}`,
    );
  }
  if (input.truncatedText) {
    headers.set("X-Seedyn-Preview-Truncated", "true");
  }
  return headers;
}

async function serve(
  request: Request,
  context: Context,
  headOnly: boolean,
): Promise<Response> {
  const authorization = await authorizeAdminRead(request);
  if (authorization instanceof Response) return authorization;

  const { id } = await context.params;
  if (!SAFE_ID.test(id)) return adminNotFound(authorization.requestId);

  let upload: PreviewUpload | null;
  try {
    upload = await db.upload.findFirst({
      where: {
        id,
        state: "READY",
        kind: { in: ["IMAGE", "VIDEO", "TEXT"] },
      },
      select: {
        id: true,
        kind: true,
        originalName: true,
        contentType: true,
        byteSize: true,
        sha256: true,
        storageKey: true,
      },
    });
  } catch {
    return unavailable();
  }
  if (!upload) return adminNotFound(authorization.requestId);
  // Prisma's generated return type is not narrowed by the `kind.in` filter.
  // Keep this explicit guard so a future query change cannot expose files.
  if (upload.kind === "FILE") return adminNotFound(authorization.requestId);

  const totalLength = Number(upload.byteSize);
  if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
    return unavailable();
  }

  try {
    const stored = await objectStore.head(upload.storageKey);
    if (
      !stored ||
      stored.byteSize !== totalLength ||
      !matchesManagedMetadata(stored.metadata, {
        recordId: upload.id,
        kind: "original",
        sha256: Buffer.from(upload.sha256).toString("hex"),
      })
    ) {
      return unavailable();
    }

    if (upload.kind === "TEXT") {
      const contentLength = Math.min(totalLength, MAX_TEXT_PREVIEW_BYTES);
      const truncatedText = totalLength > contentLength;
      const range =
        truncatedText && contentLength > 0
          ? { start: 0, end: contentLength - 1, length: contentLength }
          : undefined;
      const headers = previewHeaders({
        contentLength,
        contentType: "text/plain; charset=utf-8",
        filename: upload.originalName,
        totalLength,
        truncatedText,
      });
      if (headOnly) return new Response(null, { status: 200, headers });
      const stream = await objectStore.stream(upload.storageKey, range);
      return new Response(Readable.toWeb(stream) as BodyInit, {
        status: 200,
        headers,
      });
    }

    const parsedRange = headOnly
      ? ({ kind: "none" } as const)
      : parseSingleByteRange(request.headers.get("range"), totalLength);
    if (parsedRange.kind === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "Content-Range": `bytes */${totalLength}`,
          "Content-Security-Policy": PREVIEW_CSP,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const range = parsedRange.kind === "valid" ? parsedRange.range : undefined;
    const contentType = upload.contentType.startsWith(
      upload.kind === "IMAGE" ? "image/" : "video/",
    )
      ? upload.contentType
      : "application/octet-stream";
    const headers = previewHeaders({
      contentLength: range?.length ?? totalLength,
      contentType,
      filename: upload.originalName,
      range,
      totalLength,
    });
    const status = range ? 206 : 200;
    if (headOnly) return new Response(null, { status, headers });
    const stream = await objectStore.stream(upload.storageKey, range);
    return new Response(Readable.toWeb(stream) as BodyInit, {
      status,
      headers,
    });
  } catch {
    return unavailable();
  }
}

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  return serve(request, context, false);
}

export async function HEAD(
  request: Request,
  context: Context,
): Promise<Response> {
  return serve(request, context, true);
}
