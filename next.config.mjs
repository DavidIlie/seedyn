import { createMDX } from "fumadocs-mdx/next";

const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * @param {string | undefined} value
 * @param {string} fallback
 */
function httpOrigin(value, fallback) {
  try {
    const url = new URL(value ?? fallback);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : fallback;
  } catch {
    return fallback;
  }
}

const cdnOrigin = httpOrigin(process.env.CDN_URL, "https://i.dave.tips");

/**
 * @param {string | undefined} value
 * @param {string} fallback
 * @returns {string}
 */
function hostPattern(value, fallback) {
  const hosts = (value?.trim() ? value : fallback)
    .split(",")
    .map((host) => host.trim().toLowerCase().split(":", 1)[0] ?? "")
    .filter(Boolean)
    .map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return hosts.length === 1 ? (hosts[0] ?? fallback) : `(?:${hosts.join("|")})`;
}

const mediaHostPattern = hostPattern(
  process.env.MEDIA_HOSTS,
  isDevelopment ? "i.dave.tips,i.localhost" : "i.dave.tips",
);
const mediaContentSecurityPolicy = "sandbox; default-src 'none'";
const appHeaderSource = "/((?!internal/media(?:/|$)).*)";

/** @returns {{ key: string; type: "header"; value: string }[]} */
const markdownAcceptHeader = () => [
  { key: "accept", type: "header", value: "(.*)text/markdown(.*)" },
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${cdnOrigin}`,
  `media-src 'self' blob: ${cdnOrigin}`,
  // URL ingestion is an explicit user gesture and fetches arbitrary HTTPS
  // origins in the browser. This relaxes connection destinations only; script,
  // style, frame, worker, and form policies remain independently constrained.
  `connect-src 'self' blob: ${cdnOrigin} https:`,
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
