# 12 — Resolved inputs and deferred production prerequisites

Status: **V1 product decisions resolved; production prerequisites deferred**

## Resolved V1 decisions

### Q-001 — Copy as GIF persistence

Resolved: preserve the original and store at most one reusable GIF derivative.
The first conversion uploads it; later visits reuse its permanent URL.

### Q-002 — Inputs converted to GIF

Resolved: PNG, JPEG, WebP, and AVIF stills use the small `gifenc` worker. Video
uses lazy single-thread `ffmpeg.wasm`; actual codec support is reported by the
browser instead of promising desktop FFmpeg parity. Existing GIFs reuse their
original URL.

### Q-003 — GIF limits

Resolved: video uploads use the generic 64 MiB source cap. Video conversion uses
the first 10 seconds at 15 fps and a 640-pixel maximum edge; V1 has no trimming
UI. Still conversion preserves the source size up to 1920 × 1080. GIF output is
capped at 25 MiB. The server independently validates GIF
structure, dimensions, frames, duration, and size.

### Q-004 — Remote URL ingestion

Resolved: browser-direct HTTPS only. Redirects must remain HTTPS, the fetch sends
no credentials or referrer, and CORS-hostile URLs fail with instructions to
download and choose the file. There is no server-side URL proxy.

### Q-005 — Public URL and deletion promise

Resolved: URLs are public-by-link and stable until deletion. Origin access stops
immediately after deletion; recipients or compliant edge caches may retain bytes
for the declared 24-hour cache window, and storage backups may retain versions.

### Q-006 — Origins

Resolved: `seedyn.dave.tips` is the authenticated app/API/docs origin and
`i.dave.tips` is the exact-path media origin. One Next.js process serves both.
Local equivalents are `seedyn.localhost` and `i.localhost`.

### Q-007 — Upload limits

Resolved: 16 MiB for image/text compatibility endpoints, 64 MiB for generic
original uploads, and 25 MiB for GIF variants. Multipart parsing is streaming,
bounded, timed, cancellable, and uses mode-0600 temporary files.

### Q-008 — Legacy compatibility

Resolved: preserve `/api/images`, `/api/files`, and `/api/texts`, raw or Bearer
`Authorization`, legacy status/`message` shape, a canonical `/api/upload`, and a
generated `.sxcu`. Query-string credentials and old validation bugs are not
preserved. No old database/object import is part of V1.

### Q-009 — Invited-user isolation

Resolved: every member manages only their own keys and uploads. Exact signed
DavidApps `app_role=admin` grants a read-only cross-user ledger; it does not
grant cross-user mutation. Email never grants the role.

### Q-010 — Agent-readable docs

Resolved: HTML, Markdown/Accept-Markdown, and `llms.txt` representations require
the normal Auth.js browser session. Upload API keys do not read docs.

### Q-011 — Namespace and replicas

Resolved design: `home-cluster`, namespace `default`, one replica, one Service,
and both ingress hosts. Applying this design remains separately authorized.

### Q-012 — MinIO

Resolved locally: the private `seedyn-dev` bucket uses the existing development
MinIO. Production needs a dedicated private bucket/service account plus explicit
versioning, snapshot, and restore decisions during the deployment phase.

### Q-013 — Repository and image

Resolved for source: use the existing `davidilie/seedyn` GitHub repository.
GHCR publication and any private pull-secret requirement are deployment work.

### Q-014 — Production authority

Partially resolved: the invite-only DavidApps production client and David's
admin grant are provisioned. Moving the opaque secret to encrypted SOPS,
production MinIO mutation, `home-cluster` edits, production migrations, Flux
reconciliation, DNS, TLS, backups, and restore proof remain separate authority
boundaries.

## Verified implementation versions

Runtime and build packages are exact-pinned in `package.json`, including Next.js
16.3.0, React 19.2.8, Auth.js 5 beta, Prisma 6.19, Fumadocs, Playwright,
`@next/playwright`, MinIO, `gifenc`, and ffmpeg.wasm. The lockfile is the
authoritative transitive dependency record.
