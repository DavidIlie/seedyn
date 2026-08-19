import { createMDX } from "fumadocs-mdx/next";

const isDevelopment = process.env.NODE_ENV !== "production";

/** @returns {{ key: string; type: "header"; value: string }[]} */
const markdownAcceptHeader = () => [
  { key: "accept", type: "header", value: "(.*)text/markdown(.*)" },
];

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
        // Origin-sensitive CSP and referrer policies are applied by Proxy or
        // the owning Route Handler at runtime. Keeping them out of this
        // build-time table lets MEDIA_DOMAINS change without rebuilding.
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          { key: "X-Accel-Buffering", value: "no" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
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
