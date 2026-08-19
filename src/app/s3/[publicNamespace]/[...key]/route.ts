import { env } from "~/env";
import { db } from "~/server/db";
import {
  checkPublicMediaRateLimit,
  isMediaHostRequest,
  requestSourceAddress,
} from "~/server/http/request";
import { parseSafeObjectKey } from "~/server/s3/target";

type Context = Readonly<{
  params: Promise<{ key: string[]; publicNamespace: string }>;
}>;

const PUBLIC_NAMESPACE = /^[A-Za-z0-9_-]{32}$/u;

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function unavailable(status: 429 | 503, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(null, { status, headers: responseHeaders });
}

function canonicalMediaUrl(publicSlug: string, extension: string): string {
  const base = env.CDN_URL.endsWith("/") ? env.CDN_URL : `${env.CDN_URL}/`;
  return new URL(`${publicSlug}.${extension}`, base).toString();
}

async function resolveAlias(
  request: Request,
  context: Context,
): Promise<Response> {
  if (!isMediaHostRequest(request)) return notFound();

  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) return unavailable(503);
  try {
    const rateLimit = await checkPublicMediaRateLimit({
      sourceAddress,
      rangeRequested: false,
    });
    if (!rateLimit.allowed) {
      return rateLimit.reason === "rate_limited"
        ? unavailable(429, rateLimit.headers)
        : unavailable(503);
    }
  } catch {
    return unavailable(503);
  }

  const { key: keyParts, publicNamespace } = await context.params;
  if (!PUBLIC_NAMESPACE.test(publicNamespace)) return notFound();

  let objectKey: string;
  try {
    objectKey = parseSafeObjectKey(keyParts);
  } catch {
    return notFound();
  }

  try {
    const upload = await db.upload.findFirst({
      where: {
        s3ObjectKey: objectKey,
        s3PublicNamespaceSnapshot: publicNamespace,
        state: "READY",
      },
      select: { extension: true, publicSlug: true },
    });
    if (!upload) return notFound();

    return new Response(null, {
      status: 307,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "cross-origin",
        Location: canonicalMediaUrl(upload.publicSlug, upload.extension),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    // Keep namespace/key existence and dependency state indistinguishable at
    // this unauthenticated edge.
    return notFound();
  }
}

export function GET(request: Request, context: Context): Promise<Response> {
  return resolveAlias(request, context);
}

export function HEAD(request: Request, context: Context): Promise<Response> {
  return resolveAlias(request, context);
}
