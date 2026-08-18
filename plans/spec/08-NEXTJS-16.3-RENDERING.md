# 08 — Next.js 16.3 rendering and instant navigation

Status: **implemented and verified on Next.js 16.3.0**

## Version policy

Use the current patched 16.3 stable line, pinned exactly in `package.json` and
the lockfile. On 2026-08-17 npm reported `next@16.3.1`; do not downgrade to
16.3.0 merely to match the initial phrase “around 16.3.0”. Recheck official
release/security notes immediately before the build.

Pair it with the React/Auth.js/Fumadocs versions proven compatible by the final
install, and use the versioned documentation bundled by Next 16.3. Do not let
old Next 15 patterns from the scaffold override local 16.3 docs.

## Required config

```ts
import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
};

export default createMDX()(nextConfig);
```

Also evaluate during the build:

- `deploymentId` from the image/git version if rolling more than one build;
- `X-Accel-Buffering: no` on app responses so PPR streams through nginx;
- production-only testing API for the `instant()` CI suite;
- explicit Fumadocs Markdown rewrites;
- host-aware CDN rewrite in `proxy.ts`.

Do not enable experimental Rust React Compiler or offline behavior just because
16.3 offers them. They do not solve a Seedyn requirement.

## Content categories

### Static shell

- wordmark, primary navigation frame, page heading/description;
- empty panel geometry and honest skeletons;
- sign-in page chrome;
- documentation layout structure.

### Shared cached content

- compiled documentation source/content;
- media support/limit tables derived from code constants;
- other data demonstrably shared across users and safe to cache.

Use `use cache`, `cacheLife`, and tags only where invalidation has a named owner.

### Request-time dynamic content

- Auth.js session/cookies;
- user and authorization state;
- upload lists/details/stats;
- API keys and last-use state;
- all ownership-sensitive reads;
- CDN object lookup/stream.

Dynamic content sits below local Suspense boundaries. Do not pass cookies or
headers into a shared cache, and do not use `use cache: private` unless a measured
navigation requires it and its browser-only caching semantics are understood.

## Route shell table

| Route           | Instant shell must contain                                         | May stream                            |
| --------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `/dashboard`    | app header, Dashboard heading, Upload action, stat/list skeletons  | totals, recents, ShareX status        |
| `/images`       | header, title, upload action, search/order controls, list skeleton | image rows                            |
| `/files`        | same                                                               | file/video rows                       |
| `/texts`        | same                                                               | text rows                             |
| `/uploads/[id]` | header, back target, detail/preview skeleton                       | owned record and variant state        |
| `/api-keys`     | header, title, Create action, key-list skeleton                    | key rows                              |
| `/docs/...`     | app/docs chrome and article skeleton/title when cached             | auth resolution, any uncached content |

The destination heading should be instant where route structure makes it
available without request data. Dynamic filenames remain skeleton content.

## Authentication boundary

The protected layout may read the session at request time, but it must not make
all client navigation visually block. Use a route-level App Shell/loading state
and page-local Suspense. Data service functions independently enforce user id,
so a shell rendering before redirect cannot leak protected content.

Do not put the entire application tree into a Suspense fallback that repeats
`children`; that can remount providers and execute children twice. Providers are
synchronous and minimal.

## Navigation rules

- Use `<Link>` for internal destinations.
- Default Partial Prefetching should prefetch one reusable App Shell per route.
- Use `prefetch={true}` only after measuring and only when per-link URL data or
  cached content materially improves a key transition.
- Do not disable prefetch globally to hide server load.
- URL search params are awaited and drive server-rendered filter/pagination.
- Mutations use redirect/refresh/invalidation without a full document reload.
- Preserve useful browser state on back navigation through Cache Components'
  Activity behavior; do not add a global store for it.

## Suspense rules

- Boundary at the smallest meaningful visual region, not one blank full-page
  spinner.
- Fallback dimensions match resolved content to prevent layout shift.
- Parallel independent reads start together; avoid sequential waterfalls.
- Never hide a fast header/action behind a slow aggregate.
- Errors have a local recovery boundary and safe retry where possible.
- Direct visits and sibling client navigations are tested separately because
  they reuse different portions of the layout tree.

## Data and mutation rules

- Server Components call Prisma/service modules directly.
- Server Actions own internal form mutations.
- Route Handlers own external clients and byte streams.
- No internal fetch to `/api/*` from RSC.
- No client `useEffect` for page-critical reads.
- No optimistic deletion until storage semantics are robust; show pending state
  through the form/action transition and render authoritative result.

## Instant Insights workflow

1. Enable the two required flags before building pages.
2. Keep automatic Instant Insights validation at its default warning level.
3. Navigate through every page in the real dev server.
4. Use Navigation Inspector to inspect initial document shells and client-nav
   App Shells.
5. Fix each blocking insight by choosing Cache, Stream/Suspense, or intentional
   blocking—not by moving the page to `use client`.
6. Add `instant()` assertions for the content users must see immediately.
7. Run the same assertions against a production build in CI with the documented
   testing API config.

## Required instant tests

- Dashboard document load and Sign-in → Dashboard transition.
- Dashboard → Images/Files/Texts/API Keys/Docs.
- Images list → upload detail and sibling upload detail.
- Back navigation retains reasonable UI/scroll state.
- Slow database fixture still commits destination shell immediately.
- A refactor that moves auth/cookie access above the relevant boundary causes a
  test failure.

## Self-hosting constraints

V1's recommended single replica avoids shared Cache Component handlers. If the
deployment scales beyond one replica, the design must add or explicitly avoid:

- shared cache handler for server and `use cache: remote` data;
- cross-instance tag coordination/`refreshTags`;
- version-skew `deploymentId` behavior during rolling deploys;
- consistent Server Action encryption behavior;
- identical build output across pods.

Streaming must survive Next → service → nginx ingress → Cloudflare tunnel. Test
time-to-shell from outside the cluster; a local app response is insufficient.
