import { createMDX } from "fumadocs-mdx/next";

import {
  parseMediaDomainCatalog,
  resolveMediaHostAllowlist,
} from "./src/lib/media-domains.js";

const isDevelopment = process.env.NODE_ENV !== "production";

const mediaDomainCatalog = parseMediaDomainCatalog({
  allowHttp: isDevelopment,
  // `next typegen` and local production builds evaluate this config with
  // NODE_ENV=production after loading the developer's `.env.local`. Permit
  // only *.localhost HTTP here; runtime env validation stays HTTPS-only.
  allowLocalHttp: true,
  fallbackOrigin:
    process.env.CDN_URL ??
    (isDevelopment ? "http://i.localhost:3000" : "https://i.dave.tips"),
  serialized: process.env.MEDIA_DOMAINS,
});
const mediaHosts = resolveMediaHostAllowlist(
  mediaDomainCatalog,
  process.env.MEDIA_HOSTS ??
    (isDevelopment ? "i.dave.tips,i.localhost" : "i.dave.tips"),
);
const mediaOrigins = mediaDomainCatalog.origins.join(" ");

/**
 * @param {readonly string[]} hosts
 * @param {string} fallback
 * @returns {string}
 */
function hostPattern(hosts, fallback) {
  const patterns = hosts
    .filter(Boolean)
    .map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return patterns.length === 1
    ? (patterns[0] ?? fallback)
    : `(?:${patterns.join("|")})`;
}

const mediaHostPattern = hostPattern(mediaHosts, "i.dave.tips");
// Next 16.3 preserves config headers over same-name Route Handler headers.
// One media-host policy therefore has to protect both raw bytes and the small
// password-unlock document. Uploaded HTML is never served as HTML (and every
// response is nosniff); the sandbox still disables scripts, navigation,
// popups, and same-origin privileges while allowing only our same-origin form.
const mediaContentSecurityPolicy = [
  "sandbox allow-forms allow-same-origin",
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");
const appHeaderSource = "/((?!internal/media(?:/|$)).*)";

/** @returns {{ key: string; type: "header"; value: string }[]} */
const markdownAcceptHeader = () => [
  { key: "accept", type: "header", value: "(.*)text/markdown(.*)" },
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaOrigins}`,
  `media-src 'self' blob: ${mediaOrigins}`,
  // URL ingestion is an explicit user gesture and fetches arbitrary HTTPS
  // origins in the browser. This relaxes connection destinations only; script,
  // style, frame, worker, and form policies remain independently constrained.
  `connect-src 'self' blob: ${mediaOrigins} https:`,
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://id.davidapps.dev",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: ["seedyn.localhost", "i.localhost"],
  cacheComponents: true,
  output: "standalone",
  partialPrefetching: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    exposeTestingApiInProductionBuild:
      process.env.NEXT_INSTANT_TESTING === "true",
    instantInsights: {
      validationLevel: "warning",
    },
    proxyClientMaxBodySize: "256kb",
    serverActions: {
      allowedOrigins: isDevelopment
        ? ["seedyn.dave.tips", "seedyn.localhost:3000", "localhost:3000"]
        : ["seedyn.dave.tips"],
      bodySizeLimit: "256kb",
    },
    // Next 16.3 enables this persistent cache by default. On this project it
    // grows to roughly 1 GiB and can restore a state where next dev spins a CPU
    // core while accepting connections but returning no HTTP bytes. Keep
    // Turbopack itself; disable only the unstable cross-restart dev cache.
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      {
        // The private media handler is reached only through Proxy. Excluding
        // its internal second pass prevents this app policy from overwriting
        // the handler's stricter sandbox CSP under Next's listen authority.
        source: appHeaderSource,
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Accel-Buffering", value: "no" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Config headers are installed before a Route Handler response. Next
        // 16.3 keeps the pre-existing CSP rather than the handler's CSP, so the
        // media-host override must live here and come after the app policy.
        source: "/:path*",
        has: [{ type: "host", value: mediaHostPattern }],
        headers: [
          {
            key: "Content-Security-Policy",
            value: mediaContentSecurityPolicy,
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/docs/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Vary", value: "Cookie, Accept" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { destination: "/llms.mdx/docs", source: "/docs.md" },
        { destination: "/llms.mdx/docs/:path*", source: "/docs/:path*.md" },
        {
          destination: "/llms.mdx/docs",
          has: markdownAcceptHeader(),
          source: "/docs",
        },
        {
          destination: "/llms.mdx/docs/:path*",
          has: markdownAcceptHeader(),
          source: "/docs/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

const withMDX = createMDX();

export default withMDX(config);
