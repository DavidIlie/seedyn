import { Readable } from "node:stream";

import { env } from "~/env";
import {
  parsePublicMediaPath,
  VERIFIED_MEDIA_REWRITE_HEADER,
} from "~/lib/origin";
import {
  checkPublicMediaPasswordRateLimit,
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
import {
  basicMediaPassword,
  createMediaGrant,
  mediaGrantCookieName,
  mediaGrantSetCookie,
  readCookieValue,
  verifyMediaGrant,
  verifyMediaPassword,
} from "~/server/media/passwords";
import type { UploadRateLimitResult } from "~/server/rate-limit";

type Context = { params: Promise<{ asset: string }> };
const MAX_CONCURRENT_PUBLIC_MEDIA = 24;
const MAX_CONCURRENT_PASSWORD_VERIFICATIONS = 4;
const MEDIA_CONTENT_SECURITY_POLICY =
  "sandbox allow-forms allow-same-origin; default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const MAX_UNLOCK_BODY_BYTES = 2_048;

let activePublicMedia = 0;
let activePasswordVerifications = 0;

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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function unlockResponse(input: {
  media: PublicMediaRecord;
  headOnly?: boolean;
  error?: string;
  status?: 401 | 413 | 415 | 429 | 503;
  extraHeaders?: HeadersInit;
}): Response {
  const status = input.status ?? 401;
  const headers = new Headers(input.extraHeaders);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Content-Security-Policy", MEDIA_CONTENT_SECURITY_POLICY);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Vary", "Cookie, Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Seedyn-Password-Required", "1");
  if (input.headOnly) return new Response(null, { status, headers });

  headers.set("Content-Type", "text/html; charset=utf-8");
  const error = input.error
    ? `<p class="error" role="alert">${escapeHtml(input.error)}</p>`
    : "";
  const action = `/${input.media.publicSlug}.${input.media.extension}`;
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unlock file · Seedyn</title>
<style>:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#edf4ff}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#07111f}.card{width:min(100%,420px);padding:28px;border:1px solid #263952;border-radius:18px;background:#0e1b2c;box-shadow:0 20px 70px #0006}.mark{display:inline-grid;place-items:center;width:38px;height:38px;margin-bottom:24px;border-radius:11px;background:#2667e8;font-weight:800}h1{margin:0 0 8px;font-size:24px;letter-spacing:-.02em}p{margin:0 0 22px;color:#9eb0c8;line-height:1.5}.error{padding:10px 12px;border:1px solid #9a4250;border-radius:9px;color:#ffb2bd;background:#3b1720}label{display:block;margin-bottom:8px;font-size:14px;font-weight:650}input{width:100%;height:44px;border:1px solid #314761;border-radius:10px;padding:0 12px;background:#07111f;color:#edf4ff;font:inherit}input:focus{outline:2px solid #6da3ff;outline-offset:2px}button{width:100%;height:44px;margin-top:14px;border:0;border-radius:10px;background:#377cf2;color:white;font:inherit;font-weight:700;cursor:pointer}small{display:block;margin-top:18px;color:#71859f;text-align:center}@media(prefers-color-scheme:light){:root,body{background:#f5f8fd;color:#17253a}.card{background:white;border-color:#dce5f0;box-shadow:0 20px 70px #1c3d6820}p{color:#63758c}input{background:#f8faff;color:#17253a;border-color:#cdd9e7}small{color:#718096}}</style></head>
<body><main class="card"><div class="mark" aria-hidden="true">S</div><h1>This file is protected</h1><p>Enter its password to open or download it. The password stays in this secure request and is never added to the URL.</p>${error}<form action="${action}" method="post"><label for="password">Password</label><input id="password" name="password" type="password" minlength="8" maxlength="256" autocomplete="current-password" required autofocus><button type="submit">Unlock file</button></form><small>Shared with Seedyn</small></main></body></html>`;
  return new Response(body, { status, headers });
}

async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  }
}

function mediaGrantIsValid(
  request: Request,
  media: PublicMediaRecord,
): boolean {
  const name = mediaGrantCookieName(media.uploadId);
  const value = readCookieValue(request.headers.get("cookie"), name);
  return verifyMediaGrant(value, {
    uploadId: media.uploadId,
    passwordVersion: media.passwordVersion,
  });
}

async function passwordRateLimit(
  sourceAddress: string,
  media: PublicMediaRecord,
): Promise<Response | null> {
  const result = await checkPublicMediaPasswordRateLimit({
    sourceAddress,
    uploadId: media.uploadId,
  });
  if (result.allowed) return null;
  return result.reason === "rate_limited"
    ? unlockResponse({
        media,
        status: 429,
        error: "Too many attempts. Wait a moment and try again.",
        extraHeaders: result.headers,
      })
    : unlockResponse({
        media,
        status: 503,
        error: "Password verification is temporarily unavailable.",
      });
}

async function verifyPasswordWithCapacity(
  encodedHash: string,
  password: string,
): Promise<"match" | "mismatch" | "unavailable"> {
  if (activePasswordVerifications >= MAX_CONCURRENT_PASSWORD_VERIFICATIONS) {
    return "unavailable";
  }
  activePasswordVerifications += 1;
  try {
    return (await verifyMediaPassword(encodedHash, password))
      ? "match"
      : "mismatch";
  } finally {
    activePasswordVerifications -= 1;
  }
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
    if (media.passwordHash && !mediaGrantIsValid(request, media)) {
      const authorization = request.headers.get("authorization");
      if (!authorization) {
        release();
        return unlockResponse({ media, headOnly });
      }
      const passwordLimit = await passwordRateLimit(sourceAddress, media);
      if (passwordLimit) {
        release();
        return headOnly
          ? unlockResponse({
              media,
              headOnly: true,
              status: passwordLimit.status as 429 | 503,
              extraHeaders: passwordLimit.headers,
            })
          : passwordLimit;
      }
      const password = basicMediaPassword(authorization);
      const verification = password
        ? await verifyPasswordWithCapacity(media.passwordHash, password)
        : "mismatch";
      if (verification === "unavailable") {
        release();
        return unlockResponse({
          media,
          headOnly,
          status: 503,
          error: headOnly
            ? undefined
            : "Password verification is busy. Try again in a moment.",
        });
      }
      if (verification === "mismatch") {
        release();
        return unlockResponse({
          media,
          headOnly,
          error: headOnly ? undefined : "That password did not match.",
        });
      }
    }
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

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  if (!isVerifiedMediaRequest(request)) return unavailable(404);
  const origin = request.headers.get("origin");
  const sandboxedSameOriginNavigation =
    origin === "null" &&
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("sec-fetch-mode") === "navigate";
  // A CSP-sandboxed top-level form may serialize its Origin as `null` even
  // with allow-same-origin. Fetch Metadata still identifies the form as a
  // same-origin navigation; cross-site/null-origin submissions do not pass.
  if (
    origin &&
    origin !== new URL(env.CDN_URL).origin &&
    !sandboxedSameOriginNavigation
  ) {
    return unavailable(404);
  }
  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) return unavailable(503);
  const generalLimit = await checkPublicMediaRateLimit({
    sourceAddress,
    rangeRequested: false,
  });
  if (!generalLimit.allowed) return mediaRateLimitFailure(generalLimit);

  const resolved = await resolveMedia(context);
  if (resolved instanceof Response) return resolved;
  const media = resolved;
  const publicPath = `/${media.publicSlug}.${media.extension}`;
  if (!media.passwordHash) {
    return new Response(null, {
      status: 303,
      headers: { "Cache-Control": "no-store", Location: publicPath },
    });
  }

  const passwordLimit = await passwordRateLimit(sourceAddress, media);
  if (passwordLimit) return passwordLimit;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/x-www-form-urlencoded") {
    return unlockResponse({
      media,
      status: 415,
      error: "Submit the password using the unlock form.",
    });
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d{1,4}$/u.test(contentLength) ||
      Number(contentLength) > MAX_UNLOCK_BODY_BYTES)
  ) {
    return unlockResponse({
      media,
      status: 413,
      error: "That unlock request is too large.",
    });
  }
  const body = await readBoundedBody(request, MAX_UNLOCK_BODY_BYTES);
  if (body === null) {
    return unlockResponse({
      media,
      status: 413,
      error: "That unlock request is too large.",
    });
  }
  const password = new URLSearchParams(body).get("password") ?? "";
  const verification = await verifyPasswordWithCapacity(
    media.passwordHash,
    password,
  );
  if (verification === "unavailable") {
    return unlockResponse({
      media,
      status: 503,
      error: "Password verification is busy. Try again in a moment.",
    });
  }
  if (verification === "mismatch") {
    return unlockResponse({
      media,
      error: "That password did not match.",
    });
  }

  const grant = createMediaGrant({
    uploadId: media.uploadId,
    passwordVersion: media.passwordVersion,
  });
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Location: publicPath,
    Vary: "Cookie, Authorization",
  });
  headers.append(
    "Set-Cookie",
    mediaGrantSetCookie({
      cookieName: mediaGrantCookieName(media.uploadId),
      value: grant.value,
      path: publicPath,
      maxAge: grant.maxAge,
      secure: process.env.NODE_ENV === "production",
    }),
  );
  return new Response(null, { status: 303, headers });
}

export function OPTIONS(request: Request): Response {
  if (!isVerifiedMediaRequest(request)) return unavailable(404);
  return new Response(null, { status: 204, headers: publicOptionsHeaders() });
}
