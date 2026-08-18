import { Readable } from "node:stream";

import {
  parsePublicMediaPath,
  VERIFIED_MEDIA_REWRITE_HEADER,
} from "~/lib/origin";
import {
  checkPublicMediaRateLimit,
  isMediaHostRequest,
  requestSourceAddress,
} from "~/server/http/request";
import {
  buildPublicMediaHeaders,
  buildRangeNotSatisfiableHeaders,
  isNotModifiedSince,
  matchesIfNoneMatch,
  publicOptionsHeaders,
  sha256Etag,
} from "~/server/media/headers";
import {
  findPublicMedia,
  openPublicMedia,
  type PublicMediaRecord,
  validatePublicMedia,
} from "~/server/media/public-media";
import { parseSingleByteRange } from "~/server/media/range";
import type { UploadRateLimitResult } from "~/server/rate-limit";

type Context = { params: Promise<{ asset: string }> };
const MAX_CONCURRENT_PUBLIC_MEDIA = 24;
const MEDIA_CONTENT_SECURITY_POLICY = "sandbox; default-src 'none'";

let activePublicMedia = 0;

function unavailable(
  status: 404 | 429 | 503,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set(
    "Cache-Control",
    status === 404 ? "public, max-age=60, s-maxage=300" : "no-store",
  );
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Security-Policy", MEDIA_CONTENT_SECURITY_POLICY);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(null, {
    status,
    headers,
  });
}

function isVerifiedMediaRequest(request: Request): boolean {
  return (
    isMediaHostRequest(request) ||
    request.headers.get(VERIFIED_MEDIA_REWRITE_HEADER) === "1"
  );
}

function mediaRateLimitFailure(
  result: Exclude<UploadRateLimitResult, { allowed: true }>,
): Response {
  return result.reason === "rate_limited"
    ? unavailable(429, result.headers)
    : unavailable(503);
}

function acquirePublicMediaSlot(): (() => void) | null {
  if (activePublicMedia >= MAX_CONCURRENT_PUBLIC_MEDIA) return null;
  activePublicMedia += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activePublicMedia -= 1;
  };
}

function ifRangePermitsRange(
  value: string | null,
  media: PublicMediaRecord,
): boolean {
  if (!value) return true;
  const etag = sha256Etag(media.sha256);
  if (value.startsWith('"')) return value === etag;
  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) &&
    Math.floor(timestamp / 1000) >= Math.floor(media.createdAt.getTime() / 1000)
  );
}

async function resolveMedia(
  context: Context,
): Promise<PublicMediaRecord | Response> {
  const { asset } = await context.params;
  const parsed = parsePublicMediaPath(`/${asset}`);
  if (!parsed) return unavailable(404);
  try {
    return (
      (await findPublicMedia(parsed.slug, parsed.extension)) ?? unavailable(404)
    );
  } catch {
    return unavailable(503);
  }
}

async function serve(
  request: Request,
  context: Context,
  headOnly: boolean,
): Promise<Response> {
  if (!isVerifiedMediaRequest(request)) return unavailable(404);
  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) return unavailable(503);
  const rateLimit = await checkPublicMediaRateLimit({
    sourceAddress,
    rangeRequested: request.headers.has("range"),
  });
  if (!rateLimit.allowed) return mediaRateLimitFailure(rateLimit);

  const release = acquirePublicMediaSlot();
  if (!release) return unavailable(503, { "Retry-After": "1" });

  try {
    const resolved = await resolveMedia(context);
    if (resolved instanceof Response) {
      release();
      return resolved;
    }
    const media = resolved;
    const etag = sha256Etag(media.sha256);
    const ifNoneMatch = request.headers.get("if-none-match");
    if (
      matchesIfNoneMatch(ifNoneMatch, etag) ||
      (!ifNoneMatch &&
        isNotModifiedSince(
          request.headers.get("if-modified-since"),
          media.createdAt,
        ))
    ) {
      const headers = buildPublicMediaHeaders(media);
      headers.delete("Content-Disposition");
      headers.delete("Content-Length");
      headers.delete("Content-Type");
      release();
      return new Response(null, { status: 304, headers });
    }

    // RFC 9110 defines Range for GET and requires it to be ignored for other
    // methods, including HEAD. HEAD still advertises Accept-Ranges and the full
    // representation length through the normal metadata headers.
    const parsedRange =
      !headOnly && ifRangePermitsRange(request.headers.get("if-range"), media)
        ? parseSingleByteRange(request.headers.get("range"), media.byteSize)
        : { kind: "none" as const };
    if (parsedRange.kind === "invalid") {
      release();
      return new Response(null, {
        status: 416,
        headers: buildRangeNotSatisfiableHeaders(media.byteSize),
      });
    }
    const range = parsedRange.kind === "valid" ? parsedRange.range : undefined;
    const headers = buildPublicMediaHeaders(media, range);
    const status = range ? 206 : 200;

    if (headOnly) {
      await validatePublicMedia(media);
      release();
      return new Response(null, { status, headers });
    }

    const stream = await openPublicMedia(media, range);
    stream.once("end", release);
    stream.once("error", release);
    stream.once("close", release);
    return new Response(Readable.toWeb(stream) as BodyInit, {
      status,
      headers,
    });
  } catch {
    release();
    return unavailable(503);
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

export function OPTIONS(request: Request): Response {
  if (!isVerifiedMediaRequest(request)) return unavailable(404);
  return new Response(null, { status: 204, headers: publicOptionsHeaders() });
}
