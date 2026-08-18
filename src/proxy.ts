import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

import {
  normalizeAuthority,
  parseHostSet,
  parsePublicMediaPath,
  resolveOriginRole,
  VERIFIED_MEDIA_REWRITE_HEADER,
} from "~/lib/origin";

const APP_HOSTS = parseHostSet(
  process.env.APP_HOSTS ??
    (process.env.NODE_ENV === "production"
      ? "seedyn.dave.tips"
      : "seedyn.dave.tips,seedyn.localhost,localhost"),
);
const MEDIA_HOSTS = parseHostSet(
  process.env.MEDIA_HOSTS ??
    (process.env.NODE_ENV === "production"
      ? "i.dave.tips"
      : "i.dave.tips,i.localhost"),
);
const LIVENESS_PATH = "/api/healthz";
const READINESS_PATH = "/api/readyz";
const INTERNAL_MEDIA_REWRITE_HEADER = "x-seedyn-internal-media-rewrite";
const INTERNAL_MEDIA_REWRITE_TOKEN = randomBytes(32).toString("base64url");

function hasEncodedDocsSegment(pathname: string): boolean {
  return (
    (pathname.startsWith("/docs/") || pathname.startsWith("/llms.mdx/docs/")) &&
    pathname.includes("%")
  );
}

function isDirectLivenessAuthority(authority: string | null): boolean {
  const host = normalizeAuthority(authority);
  return host !== null && (isIP(host) !== 0 || host === "localhost");
}

function configuredPodIp(): string | null {
  const host = normalizeAuthority(process.env.POD_IP ?? null);
  return host !== null && isIP(host) !== 0 ? host : null;
}

function isDirectReadinessAuthority(authority: string | null): boolean {
  const host = normalizeAuthority(authority);
  if (host === null || isIP(host) === 0) return false;

  return host === "127.0.0.1" || host === "::1" || host === configuredPodIp();
}

function unavailable(status: 404 | 421): NextResponse {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const authority = request.headers.get("host") ?? request.nextUrl.host;

  // Internal rewrites can re-enter Proxy. Authenticate that second pass before
  // classifying its listen authority: Next may replace the public Host with
  // the server's own localhost/0.0.0.0 authority for an internal rewrite.
  if (
    pathname.startsWith("/internal/media/") &&
    request.headers.get(INTERNAL_MEDIA_REWRITE_HEADER) ===
      INTERNAL_MEDIA_REWRITE_TOKEN
  ) {
    const forwarded = new Headers(request.headers);
    forwarded.delete(INTERNAL_MEDIA_REWRITE_HEADER);
    forwarded.set(VERIFIED_MEDIA_REWRITE_HEADER, "1");
    return NextResponse.next({ request: { headers: forwarded } });
  }

  const role = resolveOriginRole(authority, APP_HOSTS, MEDIA_HOSTS);

  // Liveness is a constant local process check, so direct IP and localhost
  // probes remain available. Readiness fans out to dependencies and is limited
  // to loopback or the exact pod IP injected by Kubernetes.
  if (role === "unknown") {
    if (pathname === LIVENESS_PATH && isDirectLivenessAuthority(authority)) {
      return NextResponse.next();
    }
    if (pathname === READINESS_PATH && isDirectReadinessAuthority(authority)) {
      return NextResponse.next();
    }
    return unavailable(421);
  }

  if (role === "app") {
    if (pathname.startsWith("/internal/media")) return unavailable(404);
    if (pathname === READINESS_PATH) return unavailable(404);
    // The current authored slugs are ASCII and never percent-encoded. In a
    // standalone production build, Next can decode a valid `%25` once before
    // passing the resulting bare `%` through its static-param matcher, which
    // throws before the page's notFound() guard can run. Reject encoded docs
    // segments at the host boundary so malformed and ambiguous paths are a
    // bounded 404 in both development and production.
    if (hasEncodedDocsSegment(pathname)) return unavailable(404);
    return NextResponse.next();
  }

  if (pathname.startsWith("/internal/media/")) {
    return unavailable(404);
  }

  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method)) {
    return unavailable(404);
  }

  const asset = parsePublicMediaPath(pathname);
  if (!asset) return unavailable(404);

  const destination = request.nextUrl.clone();
  // Keep Next's own listen authority. Replacing it with the public media Host
  // turns this into an external proxy in standalone/container runtimes, where
  // the public hostname may not resolve back to the process. The random header
  // above safely recognizes the resulting internal second pass.
  destination.pathname = `/internal/media/${asset.slug}.${asset.extension}`;
  const forwarded = new Headers(request.headers);
  forwarded.delete(VERIFIED_MEDIA_REWRITE_HEADER);
  forwarded.set(INTERNAL_MEDIA_REWRITE_HEADER, INTERNAL_MEDIA_REWRITE_TOKEN);
  return NextResponse.rewrite(destination, { request: { headers: forwarded } });
}

export const config = {
  // Next clones every non-GET/HEAD body before Proxy runs. Upload routes own
  // the same host/origin/auth checks in their handlers and must bypass Proxy
  // so large multipart bodies remain streaming and are never silently cut off.
  matcher:
    "/((?!api/files/?$|api/images/?$|api/texts/?$|api/upload/?$|api/uploads/?$|api/uploads/[^/]+/gif/?$).*)",
};
