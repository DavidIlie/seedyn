# 13 — Research record

Status: **build-time research complete; refresh before deployment**

## Local repositories inspected

### Seedyn

Baseline is one 2025-era T3-style commit plus uncommitted auth/env edits. Useful:
Prisma/Auth.js/MinIO intent. Replace: Next 15.5, placeholder Post model, tRPC +
TanStack layer, partial/broken DavidApps provider, inconsistent env names, and
placeholder UI.

### `~/dev/sharex-upload-server`

The local checkout matches `github.com/DavidIlie/sharex-upload-server` at its
2022 master commit. Product concepts to retain:

- Dashboard, Images, Files, Texts, Control Panel/Profile/API Keys concepts.
- `/api/images|files|texts`, multipart names, API keys/scopes, `{message: url}`.
- recent uploads, counts/bytes, preview cards, file/text views, copy/delete.

Implementation not to copy:

- Express + separate Next Pages frontend + MongoDB/TypeORM + local disk;
- password/JWT auth and five-character slugs;
- client-after-mount data fetching and blank loading states;
- permission-check bugs and synchronous file IO;
- old decorative motion/UI implementation.

“Recreate 1:1” therefore means feature parity and recognizable structure, not
line-for-line obsolete code.

### `~/dev/webhook-relay`

Reference for:

- Next 16.3, standalone Docker, Fumadocs source and Markdown/LLM rewrites;
- semantic OKLCH token system and Fumadocs theme bridge;
- compact app header/navigation/UI primitives;
- deep `plans/spec` structure, explicit decisions, inputs/secrets, build gates.

### `~/dev/davidapps-auth`

Reference for:

- OIDC integration rules, one-host pairwise clients, owner-only secret flow;
- MCP availability and invite policy;
- concise dashboard navigation and planning/build prompt conventions.

No DavidApps resource was provisioned during this planning pass.

### `~/dev/zerocut`

Reference for:

- MinIO client/env naming and private bucket prefixes;
- canonical managed-object markers, object quota/lifecycle patterns;
- compensating delete after uncertain PUT outcomes;
- browser/media UI lessons.

Its credentials/bucket are not a security boundary to copy into Seedyn.

ZeroCut's `proxy.ts` proves the single-process multi-origin pattern: it
normalizes the Host header and rewrites alternate hosts into an internal App
Router subtree. Seedyn keeps that routing seam but uses two fixed origin roles
instead of ZeroCut's database-backed custom-domain tenancy, Cloudflare hostname
lifecycle, and billing state.

### `~/dev/home-cluster`

Reference for:

- live Flux GitOps approval boundary;
- `default` namespace personal-app layout;
- app-template HelmRelease, external ingress, GHCR, SOPS, security contexts;
- shared single-instance PostgreSQL and `postgres-init` convention;
- existing DavidApps OIDC integration on Paperless.

## Next.js 16.3 primary sources

- [Next.js 16.3 release](https://nextjs.org/blog/next-16-3) — stable release,
  Instant Navigations, two opt-in flags, `instant()` helper, Node stream SSR,
  versioned agent docs.
- [Ensuring instant navigations](https://nextjs.org/docs/app/guides/instant-navigation)
  — App Shell definition, validation, Navigation Inspector, CI helper.
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching) — static,
  cached, dynamic/Suspense model.
- [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting) — standalone,
  reverse proxy, streaming, multi-instance cache/version/action considerations.
- [Version 16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16) —
  async APIs, `proxy.ts`, Cache Components migration.

Important correction to older project knowledge: 16.3 Instant Navigation needs
both `cacheComponents: true` and `partialPrefetching: true`. PPR is part of Cache
Components, not the old experimental PPR flag.

## Next.js 16.3.0 → 16.3.1-canary.22 A/B

The raw-HTML incident was traced to a whole-process `next dev` stall, not a CSS
pipeline failure: the Next child pinned a core, accepted TCP, and returned no
bytes for HTML, RSC, CSS, or health routes while the persistent Turbopack dev
cache was roughly 1.0 GiB. Disabling only
`turbopackFileSystemCacheForDev` eliminated the failure across a workload beyond
the prior failure window.

Replaying 16.3.0 against the preserved database did not immediately reproduce,
so the database is not simply and deterministically poisoned. The strongest
working hypothesis is a live persistence writer/snapshot/compaction or task
coordination loop reached by a particular HMR and route workload.

The npm `canary` tag was `16.3.1-canary.22`. Its cache is version-keyed and could
not consume the 16.3.0 database; a fresh-cache soak remained healthy for more
than 18 minutes. The same canary did expose an independent regression: the
documented `@next/playwright` `instant()` helper consistently failed to commit
an otherwise completed `/api-keys` → `/docs` navigation. The destination RSC
completed in tens of milliseconds, the server remained idle, and disabling the
persistent cache did not change the result. The identical test passes on
16.3.0, which remains the release pin.

Related framework records inspected during the diagnosis:

- [Issue #96093](https://github.com/vercel/next.js/issues/96093)
- [Discussion #87283](https://github.com/vercel/next.js/discussions/87283)
- [Discussion #87796](https://github.com/vercel/next.js/discussions/87796)
- [Discussion #90691](https://github.com/vercel/next.js/discussions/90691)
- [PR #96043](https://github.com/vercel/next.js/pull/96043)
- [PR #95975](https://github.com/vercel/next.js/pull/95975)
- [PR #96929](https://github.com/vercel/next.js/pull/96929)
- [PR #96941](https://github.com/vercel/next.js/pull/96941)

## Browser GIF primary sources

- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) and its
  [usage guide](https://ffmpegwasm.netlify.app/docs/getting-started/usage/) —
  browser worker transcoding, roughly 31 MB core, single/multithread distinction,
  SharedArrayBuffer requirement for multithread.
- [gifenc](https://github.com/mattdesl/gifenc) — small browser/Node GIF encoder,
  manual worker parallelism, strong still/simple-frame path.

Inference recorded in the plan: use `gifenc` for stills and lazy single-thread
ffmpeg.wasm for video/animation to avoid cross-origin isolation and keep the
initial bundle small. This remains subject to an implementation proof with the
exact pinned packages.

## Refresh checklist before build

- Read installed `node_modules/next/dist/docs` after upgrading.
- Verify Next 16.3 latest patch/security status and exact config names.
- Verify Auth.js provider typing/callback behavior against its installed code.
- Verify ShareX `.sxcu` current official schema and a real client import.
- Verify Fumadocs versions work together; its core/ui/mdx versions may differ.
- Verify ffmpeg.wasm codec/filter set and self-hosted worker URLs under Next.
- Verify home-cluster ingress supports PPR streaming and desired CDN headers.
- Verify MinIO bucket provisioning/backup outside source code.
