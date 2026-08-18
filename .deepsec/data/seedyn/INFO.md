# seedyn

## What this codebase does

Seedyn turns an uploaded file into a permanent short URL. It is one Next.js 16.3 App
Router application (React 19, Prisma/PostgreSQL, ioredis, MinIO, Auth.js v5 beta)
serving two host roles from a single process, split in `src/proxy.ts`:

- app role (`seedyn.dave.tips`) — session dashboard, library, API keys, gated docs.
- media role (`i.dave.tips`) — anonymous, exact-URL media streaming only; the proxy
  rewrites `/:slug.:ext` to the internal route `/internal/media/[asset]` and 404s the
  internal path when it is requested on the app host.

Ingress families present: HTTP route handlers under `src/app/api/**`, the internal
media streaming route, React Server Actions (`"use server"` modules), the Auth.js
catch-all `/api/auth/[...nextauth]`, liveness/readiness probes, and operational CLI
scripts (`scripts/reconcile-storage.ts`, `prisma/seed.ts`, run via
`scripts/run-with-next-env.ts`). There are no queues, cron jobs, inbound webhook
receivers, or agent/MCP tool handlers in this repository.

Upload path: Busboy parses multipart into a mode-0600 temp file under
`/tmp/seedyn-uploads`, `classifyUpload` decides kind by magic bytes (`file-type` +
`sharp`) rather than the client's filename or Content-Type, the object is written to a
private MinIO bucket keyed `users/<userId>/uploads/<uuid>/...`, and only then does a
Database row publish a 192-bit random `publicSlug`. A failed DB write compensates by
deleting the object; deletes go READY → DELETING → object removal → row removal, with
`DELETE_FAILED` as the retryable state.

## Auth shape

- Production identity is DavidApps OIDC (`issuer https://id.davidapps.dev`, PKCE +
  state, `allowDangerousEmailAccountLinking: false`) with the Prisma adapter and
  **database** sessions. A Credentials provider (`seedyn-development`) with JWT
  sessions exists but throws if `SEEDYN_DEV_AUTH` is set while `NODE_ENV=production`;
  it also requires the loopback-only `pnpm dev` launcher marker.
- Browser/UI reads gate on `requireSessionUser()` (`src/components/data/session.ts`),
  which awaits `connection()` then `getOptionalUser()` and redirects to `/sign-in`.
  `SessionGate` is documented as a convenience redirect, **not** the authorization
  boundary — every service call is scoped by `userId`.
- Browser mutation routes funnel through `authorizeBrowserMutation()`
  (`src/server/http/browser-mutation.ts`): app-host check → exact `Origin` equality
  against `APP_URL` → session → source and account-wide Redis limits. Server
  Actions reconstruct the same trusted request boundary; public sign-in has its
  own source and global pre-auth ceilings.
- Machine uploads use `parseApiKeyAuthorization()` (Bearer only; query-string keys are
  explicitly rejected with 401) then `resolveApiKeyIdentity()`, which looks up a unique
  SHA-256 `secretHash` and checks `revokedAt`/`expiresAt`, then a per-kind scope check
  (`upload:image` / `upload:text` / `upload:file`).
- Server Actions re-derive the user from the session and treat form ids as claims;
  `revokeApiKey`/`deleteOwnedUpload` scope every query by `userId`.
- Media serving is intentionally unauthenticated: possession of the random slug is the
  capability. Docs, `/api/search`, `/llms.txt`, `/llms-full.txt`, and `/llms.mdx/**`
  are session-gated and marked `private, no-store` + `Vary: Cookie`.

## Threat model

- Host confusion between the app and media roles: any path that lets media-host traffic
  reach an app route (or the reverse) breaks the whole split. `resolveOriginRole` /
  `normalizeAuthority` (`src/lib/origin.ts`) and `isAppHostRequest` / `isMediaHostRequest`
  are the choke points; unknown hosts get 421 except for direct literal-IP probe
  authorities. Dependency readiness is unavailable on public app/media hosts.
  Multipart POST paths bypass Proxy to avoid Next body cloning; explicit handlers for
  their other methods preserve app 204/405, media 404, and unknown-host 421 semantics.
- Cross-tenant access to uploads, variants, API keys, and object keys — every Prisma
  query and every MinIO key must carry `userId`.
- Stored XSS via served media: HTML/SVG/XML/JS must never become inline. Classification
  forces those to `application/octet-stream` + `ATTACHMENT`, and media responses carry
  `Content-Security-Policy: sandbox; default-src 'none'` plus `nosniff`.
- Slug/enumeration: slugs are 192 random bits and carry no user, time, or filename data.
- Upload resource abuse: byte caps (64/16/25 MiB), one file, four scalar fields,
  110-second parsing timeout, stale temp-file reaping, and layered Redis limits.
  GIF validation has a six-per-minute account ceiling and one active slot.
- Client-IP spoofing feeding rate-limit keys: `extractClientAddress` indexes
  `X-Forwarded-For` by `TRUSTED_PROXY_HOPS` and ignores the header entirely at 0 hops.
- SSRF is deliberately out of scope server-side: URL ingest runs in the browser
  (`src/components/upload/url-ingest.ts`) and the server never fetches a user URL.
- Secret handling: raw API keys exist exactly once, in the `createApiKeyAction`
  return, and the state holding one is unmounted on dismissal. Application code
  does not log raw keys, request bodies, or storage credentials.

## Project-specific patterns to flag

- Any new authentication fallback that reads a key from a URL, cookie, or non-`Authorization`
  header — `parseApiKeyAuthorization` documents that callers must not add one.
- A route handler that omits `isAppHostRequest()` / `isMediaHostRequest()`, or a browser
  mutation that skips `authorizeBrowserMutation()` (losing the exact-Origin CSRF check).
- A Prisma query on `Upload`, `UploadVariant`, or `ApiKey` whose `where` lacks `userId`
  (directly or via `upload: { userId }`).
- Classification changes that add an extension/content-type to `SAFE_IMAGES`/`SAFE_VIDEOS`
  or return `disposition: "INLINE"` for a text-ish format, or that trust
  `claimedContentType`/`originalName` instead of sniffed bytes.
- Object keys or list prefixes built without `originalObjectKey` /
  `gifVariantObjectKey` / `assertManagedListPrefix`, or `storageKey` derived from
  user-controlled strings.
- Widening `next.config.mjs` CSP (`script-src`, `form-action`, `frame-ancestors`) or
  `experimental.serverActions.allowedOrigins`, or removing `no-store`/`Vary: Cookie`
  from docs and search responses.
- Server-side fetching of a user-supplied URL (a proxy fallback for URL ingest).
- Error paths that surface `cause`, filenames, storage keys, or key material instead of
  the bounded `SafeErrorCode` set in `safeJsonError` / `domainErrorResponse`.

## Known false-positives

- `trustHost: true` in the Auth.js config is paired with `process.env.AUTH_URL = env.APP_URL`
  in `src/server/auth/index.ts`, so forwarded Host headers do not choose callback origins.
- `scripts/build.mjs` supplies named build-only OIDC placeholders only to its
  `next build` child; the runtime does not inherit them, and the Docker
  entrypoint rejects those exact values and incomplete production environments.
  The build wrapper removes Next's generated `.next/standalone/.env*` copies.
  The local-development provider also hard-fails in production.
- `Access-Control-Allow-Origin: *` and `immutable` caching on `/internal/media/**` are
  intended: that origin is a public, capability-URL CDN with no cookies or credentials.
- SHA-256 (not bcrypt/argon2) for `secretHash` is intentional — the key is 256 bits of
  CSPRNG output, not a password; lookup is a unique-index equality match.
- `SessionGate` rendering under `<Suspense fallback={null}>` is not an auth bypass; the
  shell contains no protected data and each page/service re-checks the user.
- The `revokeApiKeyAction` early `return` on a malformed id and `decodeCursor` silently
  falling back to page one are deliberate; both are ownership-scoped afterwards.
- `/api/healthz` is safe on the app host. `/api/readyz` and both probe paths on an
  unknown authority require a literal IP/localhost authority and return only
  bounded state without dependency detail.
- `AGENTS.md`/`CLAUDE.md` are generated by `next dev`, not project security policy.
