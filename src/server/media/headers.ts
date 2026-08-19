import { contentDispositionHeader } from "./disposition";
import type { ByteRange } from "~/server/storage/object-store";

const MEDIA_CONTENT_SECURITY_POLICY =
  "sandbox allow-forms allow-same-origin; default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export type PublicMediaMetadata = {
  byteSize: number;
  contentType: string;
  disposition: "INLINE" | "ATTACHMENT";
  originalName: string;
  sha256: Uint8Array;
  createdAt: Date;
  passwordProtected: boolean;
};

export function sha256Etag(sha256: Uint8Array): string {
  return `"${Buffer.from(sha256).toString("hex")}"`;
}

export function buildPublicMediaHeaders(
  media: PublicMediaMetadata,
  range?: ByteRange,
): Headers {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": media.passwordProtected
      ? "private, no-store, max-age=0"
      : range
        ? "private, max-age=3600, no-transform"
        : "public, max-age=3600, s-maxage=86400, immutable",
    "Content-Disposition": contentDispositionHeader(
      media.disposition,
      media.originalName,
    ),
    "Content-Length": String(range?.length ?? media.byteSize),
    "Content-Security-Policy": MEDIA_CONTENT_SECURITY_POLICY,
    "Content-Type": media.contentType,
    "Cross-Origin-Resource-Policy": "cross-origin",
    ETag: sha256Etag(media.sha256),
    "Last-Modified": media.createdAt.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });
  if (range) {
    // Keep an intermediary from collapsing a cached 206 onto the complete
    // representation. `private` is the primary guard; Vary makes the response
    // safe for intermediaries that do store it despite that directive.
    headers.set("Vary", "Range");
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${media.byteSize}`,
    );
  }
  if (media.passwordProtected) {
    headers.set(
      "Vary",
      range ? "Cookie, Authorization, Range" : "Cookie, Authorization",
    );
  }
  return headers;
}

export function buildRangeNotSatisfiableHeaders(totalLength: number): Headers {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Security-Policy": MEDIA_CONTENT_SECURITY_POLICY,
    "Content-Range": `bytes */${totalLength}`,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
}

export function matchesIfNoneMatch(
  value: string | null,
  etag: string,
): boolean {
  if (!value) return false;
  return value
    .split(",")
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === "*" || candidate === etag || candidate === `W/${etag}`,
    );
}

export function isNotModifiedSince(
  value: string | null,
  lastModified: Date,
): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(parsed / 1000);
}

export function publicOptionsHeaders(): Headers {
  return new Headers({
    Allow: "GET, HEAD, OPTIONS, POST",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=86400",
    "Content-Security-Policy": MEDIA_CONTENT_SECURITY_POLICY,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
}
