# Seedyn — master product and architecture plan

Status: **implemented local product; production infrastructure deferred**
Date: **2026-08-18**

## 1. Product in one paragraph

Seedyn is David's small, private upload library: upload or ingest an object,
store it permanently in MinIO, and receive a stable public-by-link URL. An
invited user signs in with DavidApps and can use the browser, any compatible
HTTP client, or the supported ShareX integration. The web library can also turn
a stored image or short video into a GIF entirely in the visitor's browser,
upload that derivative once, and copy its permanent `.gif` URL for uses such as
Discord favorites.

## 2. Non-negotiable constraints

1. One application repository and one deployable Next.js container. No separate
   API service, worker service, docs deployment, or media-processing backend.
2. Next.js **16.3.x**, App Router, React Server Components, server rendering,
   Cache Components, Partial Prefetching, and Instant Navigation verification.
3. Client JavaScript is reserved for interactions that require the browser:
   selecting/dropping files, progress, clipboard, dialogs, and local GIF
   conversion.
4. Authentication is Auth.js/NextAuth v5 against the DavidApps OIDC issuer.
5. Access is invite-only. David (`david@davidilie.com`) is the initial owner.
6. PostgreSQL stores metadata and Auth.js sessions. MinIO stores file bytes.
7. Uploaded public URLs do not expire. MinIO credentials and presigned URLs are
   never exposed as the permanent public URL.
8. Fumadocs documentation ships inside the app and requires authentication.
9. Production is a Docker image reconciled by Flux on `home-cluster`.
10. Existing uncommitted work in this repository is preserved during planning.

## 3. Deliberately small architecture

```text
ShareX / browser
      |
      | HTTPS
      v
home-cluster external ingress
      |
      +-- seedyn.dave.tips -----------------------------------+
      |                                                       |
      +-- i.dave.tips ------- host rewrite to public media ---+
                                                              v
                                                   one Next.js 16.3 app
                                                   - Auth.js OIDC
                                                   - RSC dashboard
                                                   - Server Actions
                                                   - upload Route Handlers
                                                   - CDN Route Handler
                                                   - Fumadocs
                                                      |       |
                                      metadata/session|       |objects
                                                      v       v
                                              PostgreSQL     MinIO
```

There is no internal REST layer for the dashboard. Server Components query
Prisma directly. Server Actions perform normal UI mutations. Route Handlers
exist only for contracts that must be HTTP endpoints: Auth.js, ShareX uploads,
browser uploads/progress, public media GET/HEAD, health checks, and agent-readable
documentation.

The two public origins terminate at this same process. They are origin roles,
not separate apps, deployments, repositories, or services.

The existing tRPC and TanStack Query plumbing is removed unless implementation
uncovers a concrete interaction that cannot be expressed cleanly with the model
above. "It is already in the scaffold" is not sufficient reason to keep it.

## 4. Product surfaces

### Protected application

- Sign-in page with one “Continue with DavidApps” action.
- Library: total objects/bytes, latest uploads, and the global upload action.
- Images, files, and texts library views with URL-state pagination/filtering.
- Upload detail: preview, metadata, checksum, URLs, copy/download/delete.
- API keys: create, reveal once, download `.sxcu`, inspect last use, revoke.
- Docs: browser uploads, the general upload API, keys/scopes, serving semantics,
  GIF conversion, ShareX setup, compatibility endpoints, and operations.

### Public-by-link surface

- Raw media at the CDN origin with the correct MIME type, range support, ETag,
  CORS, safe content disposition, and cache headers.
- No index, search, directory listing, or unauthenticated metadata API.
- Slugs are high entropy and unguessable; public-by-link is not authorization.

### Machine-facing surface

- A canonical client upload endpoint plus ShareX-compatible aliases matching the
  old repository's image/file/text contracts.
- API-key authentication, size/type checks, uniform JSON responses, request IDs,
  and a generated ShareX configuration that removes manual setup.

## 5. Rendering and navigation thesis

The visible application chrome is an App Shell. Authentication and user data
remain request-time work. Each data-bearing region has a local Suspense boundary
with a real skeleton, so clicking between Dashboard, Images, Files, Texts, API
Keys, and Docs commits visible destination UI immediately while fresh content
streams from the server.

The initial config target is:

```ts
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
};
```

The build must use Next's 16.3 `instant()` Playwright helper for both document
loads and client navigations. “Fast on my machine” is not acceptance.

Authenticated upload lists and authorization decisions are dynamic by default;
they are not put in a cross-user server cache. Static docs content and other
truly shared work may use `use cache`. Mutations use Server Actions and redirect
or `updateTag` only where a real cache tag exists.

## 6. Browser GIF thesis

The original asset is stored first. “Copy as GIF” works as follows:

1. Reuse an already stored GIF derivative if one exists.
2. Otherwise fetch the original from Seedyn's CORS-enabled CDN in the browser.
3. Convert locally in a dedicated worker.
4. Show progress, preview, output size, and a cancel action.
5. Upload the derivative through an authenticated variant endpoint.
6. Commit the derivative row only after MinIO succeeds.
7. Copy the permanent `.gif` CDN URL.

Recommended implementation split:

- Still images: lightweight `gifenc` worker for a one-frame GIF.
- Animated images and short video: lazily loaded, self-hosted single-thread
  `ffmpeg.wasm` worker. Do not require cross-origin isolation in V1.

This avoids server-side FFmpeg, background jobs, and persistent queues. Input
duration/dimensions and output bytes must be capped because browser WebAssembly
holds large working sets in memory.

## 7. Auth thesis

Use a DavidApps confidential OIDC client with discovery at
`https://id.davidapps.dev/.well-known/openid-configuration`, PKCE S256, state,
nonce, and scopes `openid profile email`. The provider id is `davidapps`.

Identity is the canonical `(iss, sub)` represented by Auth.js's provider and
provider-account id, not email. Email is display/contact data. DavidApps owns
the invite policy; Seedyn does not grow a second invitation system.

The invite-only DavidApps OIDC application is provisioned for
`seedyn.dave.tips` and `seedyn.localhost:3000`. David resolves to its signed
`admin` application role. An approved non-model mover consumed the opaque
one-time output into the SOPS-encrypted production sink without exposing it to
the application repository or model context.

## 8. Persistence thesis

### PostgreSQL

Prisma owns migrations for:

- Auth.js `User`, `Account`, `Session`, and `VerificationToken` records.
- `ApiKey` with one-way secret hash, prefix, scopes, timestamps, and revocation.
- `Upload` with owner, public slug, kind, original name, MIME, extension, byte
  size, checksum, MinIO key, timestamps, and deletion state.
- `UploadVariant` for the GIF derivative and future format variants without
  widening the base upload row.

### MinIO

- A dedicated private `seedyn` bucket and dedicated least-privilege service
  account. Do not reuse ZeroCut's bucket credentials.
- Deterministic, non-public object keys under an owner/upload prefix.
- Content metadata written at upload time.
- Bucket versioning and TrueNAS snapshot/backup policy before “permanent” is a
  trustworthy product promise.

Database commit and object write are not transactional. The write protocol and
cleanup reconciliation are specified in `spec/06-STORAGE-CDN-AND-GIF.md`.

## 9. Deployment thesis

Recommended target: `home-cluster`, namespace `default`, matching its existing
personal application convention. One replica is intentional for V1: it keeps
Next.js's cache behavior and migrations simple on a home cluster, while the
shared PostgreSQL and MinIO hold all durable state.

The deployment uses:

- `ghcr.io/davidilie/seedyn` image built by GitHub Actions.
- Next standalone output in a non-root, read-only-root container.
- Writable `emptyDir` mounts only for `/tmp` and `.next/cache`.
- Existing home-cluster PostgreSQL through a `postgres-init` init container.
- SOPS-encrypted application secrets.
- External ingress for the app and CDN hosts.
- Liveness/readiness probes and graceful termination.
- Flux image automation following existing `default` namespace patterns.

Cluster repository edits and live changes require a separate explicit approval;
the planning and application build do not authorize them.

## 10. What V1 does not contain

- Organizations, billing, quotas sold as plans, public signup, or local invites.
  Seedyn does enforce a personal per-account storage ceiling: members inherit
  5 GB, administrators are unlimited, and administrators can raise a member's
  limit without introducing plans or billing.
- Server-side media transcoding, background workers, queues, or cron processing.
- Albums, folders, tags, comments, social feeds, or public gallery browsing.
- URL shortener, custom domains per user, expiring links, passwords, or ACLs on
  individual uploads.
- S3-compatible API exposure to clients.
- Mobile/desktop apps beyond ShareX's custom uploader.
- Multiple storage backends or local-filesystem production storage.
- Multi-region or multi-replica cache coordination.
- Download/view tracking, historical deletion analytics, or identity-platform
  user-directory analytics. The read-only admin ledger reports current Seedyn
  metadata only.

## 11. Completion standard

Planning is complete only when:

- every item in `spec/12-INPUTS-AND-OPEN-QUESTIONS.md` is locked or deferred;
- route, API, data, security, storage, navigation, and failure contracts agree;
- production and local secret flows are named without exposing values;
- acceptance tests cover the critical user journeys and destructive paths;
- the build order has no circular dependency;
- `BUILD-RESULTS.md` records the implemented surface, acceptance evidence, and
  separately authorized production work.
