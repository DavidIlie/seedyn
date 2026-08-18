# Seedyn

Seedyn turns a file into a permanent short URL. It is one Next.js 16.3
application with two host roles:

- `seedyn.dave.tips` — authenticated library, admin ledger, API keys, and docs.
- `i.dave.tips` — anonymous, exact-URL media streaming only.

The same process serves both hosts. A fixed host resolver rejects unknown hosts
and rewrites only valid public media paths to the internal streaming route.

## Local development

Seedyn expects reachable local PostgreSQL and Redis services plus MinIO
credentials allowed to create the named development bucket. Copy `.env.example`
to `.env.local` and provide local values without committing the file. The
checked-in commands load `.env.local` with Next's own precedence rules. For the
explicit local-only session provider, set:

```dotenv
APP_URL=http://seedyn.localhost:3000
CDN_URL=http://i.localhost:3000
APP_HOSTS=seedyn.localhost,localhost
MEDIA_HOSTS=i.localhost
SEEDYN_DEV_AUTH=true
SEEDYN_DEV_AUTH_EMAIL=david@davidilie.com
```

Then run:

```bash
pnpm install
pnpm storage:setup
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://seedyn.localhost:3000>. The public media origin is
<http://i.localhost:3000>; it intentionally has no index or authenticated UI.
The `.localhost` names resolve to loopback without a hosts-file entry in modern
browsers. `pnpm dev` binds Next to `127.0.0.1`; the passwordless local provider
refuses to initialize under a manually launched, network-exposed dev server.

The seed and local credentials provider require development mode plus localhost
application and PostgreSQL targets. They refuse to adopt an existing federated
user with the configured email. `NODE_ENV=production pnpm db:seed` fails closed.
Production uses DavidApps OIDC with an invite-only DavidApps application.
The loopback development identity is an explicit admin so local `/admin`
exercises the same authorization path without comparing emails.

## DavidApps registration

Seedyn is registered as invite-only OIDC application
`application_90fb0334-3ca6-4f3d-981a-a60b45f438c0`, with public client id
`N3HqSugmik9n4eSjXybKFybxlyWfKn3K`. The non-secret receipt is checked in at
`.davidapps/auth.public.json`. David resolves to the application role `admin`;
production authorization uses that signed role, never an email allowlist.

An approved non-model mover consumed the one-time client secret directly into
Seedyn's SOPS-encrypted home-cluster Secret and deleted the owner-only transport
artifact after verification. The inactive template under `deploy/` remains
deliberately empty and is not a deployable plaintext Secret.

## Quality gates

```bash
pnpm check          # TS7-aware lint, typecheck, unit/contract tests
pnpm format:check
pnpm build
pnpm test:e2e
pnpm test:e2e:production
pnpm test:integration
```

`next` is intentionally pinned to exactly `16.3.0`. Cache Components, partial
prefetching, Server Components, and the Instant Navigation testing API are
enabled so framework behavior remains reproducible. Production-build instant
testing is exposed only when `SEEDYN_BUILD_INSTANT_TESTING=true` in controlled CI.
The checked-in GitHub Actions workflow runs the same gates against disposable
PostgreSQL, Redis, and MinIO services, including the standalone production
browser suite and a clean container build.

## HTTP contracts

- `POST /api/upload` — canonical client upload (`file`, Bearer API key).
- `POST /api/images`, `/api/files`, `/api/texts` — legacy-compatible aliases.
- `POST /api/uploads` — cookie-authenticated browser upload with progress.
- `POST /api/uploads/:id/gif` — finalize a browser-generated GIF variant.
- `GET|HEAD|OPTIONS https://i.dave.tips/:slug.:ext` — public media with
  conditional requests and single-range support.
- `GET /api/healthz` — app-origin/direct-probe liveness; `/api/readyz` is
  dependency readiness restricted to loopback or the downward-API `POD_IP`.

The authenticated product documentation under `/docs` is the normative user
and agent guide. The complete design record and acceptance plan live in
[`plans/`](plans/README.md).

The admin-only `/admin` route aggregates Seedyn's own PostgreSQL data: signed-in
users, original and GIF storage, active API keys, upload activity, content
types, and recent objects. DavidApps does not expose a broad user-directory
analytics API, so granted users appear after their first Seedyn sign-in.

## Storage and operations

Uploads stream through bounded mode-0600 files in `/tmp/seedyn-uploads`, then to
the private MinIO bucket. Database rows publish application-generated slugs only
after storage succeeds; failed database writes compensate the object. Run the
read-only consistency report with:

```bash
pnpm storage:check
```

The Docker image runs as a non-root user, exposes port 3000, includes Prisma
migrations for an init-container command, and supports a read-only root when
`/tmp` and `.next/cache` are writable mounts.
