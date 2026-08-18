# 11 — One-shot build plan

Status: **phases 1–7 complete locally; phase 8 requires new authority**

## Sequencing model

```text
Phase 0  Freeze decisions and contracts
   |
Phase 1  Replace scaffold + foundations
   |
Phase 2  Auth + data/storage seams
   |
Phase 3  Vertical upload/API/CDN slice
   |
Phase 4  Server-rendered dashboard + keys
   |
Phase 5  Browser GIF + URL ingest
   |
Phase 6  Fumadocs + instant navigation
   |
Phase 7  hardening, Docker, CI
   |
Phase 8  separately authorized infrastructure + production proof
```

## Phase 0 — freeze the specification

- Resolve every launch-blocking item in `12` one question at a time.
- Lock hostnames, public/deletion semantics, media limits, conversion scope,
  namespace/replicas, and agent docs access.
- Verify exact current package releases and security notices.
- Produce final route map, env manifest, Prisma schema, API fixtures, object-key
  rules, and UI page list.
- Freeze the accepted baseline in this dossier before implementation.

Gate: no launch-blocking open question; docs have no contradictions.

## Phase 1 — replace the accidental scaffold

- Preserve a diff/reference of existing uncommitted edits; do not lose user work
  silently.
- Upgrade/pin Next 16.3 patched line, React, Auth.js, Prisma, Fumadocs, Tailwind,
  Zod, test tools.
- Remove tRPC/TanStack/superjson and placeholder Post model.
- Establish `src/app`, server-only module boundaries, aliases, lint/format/type
  scripts, typed env, logging/request ids.
- Add semantic design tokens, fonts, root layout, static shell, error/not-found/
  unauthorized states.
- Enable Cache Components, Partial Prefetching, standalone output, agent-versioned
  docs behavior.

Gate: clean install; lint/type/unit; production build; no current app feature yet.

## Phase 2 — frozen foundations

- Final Prisma/Auth.js/domain schema and migration.
- ObjectStore implementation and real MinIO integration tests.
- API-key format/hash/auth/scopes with vectors.
- Upload classification, slug, URL, range, error contracts with vectors.
- DavidApps Auth.js config and local test double.
- Shared `requireUser`/ownership helpers.
- GIF worker request/response types and option validator.

Gate: migrations clean; contract tests frozen; no UI imports server-only code.

## Phase 3 — first end-to-end vertical slice

Build image upload all the way through:

- create API key through temporary test helper/service;
- canonical multipart route and `/api/images` alias;
- MinIO PUT + DB commit/compensation;
- CDN host rewrite and GET/HEAD/range response;
- integration test submits a PNG and verifies exact returned/served bytes;
- failure injection for MinIO/DB/cleanup.

Then generalize the same service to file/video/text aliases without copying it.

Gate: real ephemeral Postgres+MinIO suite; API fixtures stable; no orphan on
injected normal failure paths.

## Phase 4 — application UI

- Protected Auth.js layout/sign-in/error/sign-out.
- Dashboard shell, parallel stats/recent components.
- Images/Files/Texts server-rendered URL-state lists.
- Upload detail and delete lifecycle.
- Browser upload client island with progress/cancel and authoritative refresh.
- API Keys page, hydrated create/revoke, one-time reveal and `.sxcu`.
- Theme, responsive navigation, accessibility and visual tests.

Gate: core browser journeys green without client-side page data fetching.

## Phase 5 — browser media features

- Direct browser URL ingest with CORS error behavior.
- Still-image GIF worker with `gifenc`.
- Self-hosted lazy FFmpeg core and video/animated worker.
- Conversion UI/options/progress/cancel/memory cleanup.
- Variant upload/finalize/race/reuse.
- Browser and integration tests with tiny deterministic fixtures.

Gate: no FFmpeg in initial bundle; output constraints enforced both sides;
failure/cancel leaves original intact and no half variant.

## Phase 6 — docs and instant navigation

- Fumadocs source, nine agreed pages, Seedyn theme bridge.
- Protected HTML, `.md`/Accept Markdown, `llms.txt`, `llms-full.txt` routes.
- Document real `.sxcu`, curl, response/error, limits, GIF behavior.
- Fix every Instant Insights warning intentionally.
- Navigation Inspector pass.
- `@next/playwright` `instant()` tests for the route-shell table.

Gate: docs match contract fixtures; anonymous docs access fails; all instant
tests pass against production build.

## Phase 7 — hardening and delivery artifacts

- Full security/failure matrices.
- Docker non-root/read-only verification.
- Health/readiness and graceful shutdown.
- CI install→tests→build→E2E→image.
- Maintenance consistency/reconcile commands.
- Operator runbooks for migrations, backup/restore, key/auth failure, MinIO
  mismatch, and rollback.
- Dependency/license/vulnerability review.

Gate: application image is deployable, but no external provisioning or cluster
mutation is implied.

## Phase 8 — new-authority production work

Only with explicit approval:

1. Provision dedicated MinIO bucket/service account and backup settings.
2. Run DavidApps MCP doctor, provision OIDC app/dev client, grant David access,
   and move opaque secret references to approved sinks.
3. Add SOPS secret and Seedyn Flux resources in `home-cluster`.
4. Validate kustomize/full Flux graph; push/reconcile only when authorized.
5. Migrate database, deploy image, verify both origins and streaming externally.
6. Import `.sxcu` into actual ShareX and complete production upload.
7. Create GIF in production browser and retrieve it unauthenticated from CDN.
8. Perform backup/restore smoke and storage consistency scan.

Gate: every item in `10` product definition of done is evidenced.

## Anti-drift rules for the build agent

- Read the decision register before each phase; do not re-ask settled questions.
- Inspect current version-matched Next docs under installed `node_modules/next`
  before using caching/navigation APIs.
- Do not retain a dependency because the old scaffold had it.
- Do not create a second service for upload or conversion.
- Do not turn a page into a Client Component to silence a rendering problem.
- Do not expose MinIO or a presigned URL as canonical public media.
- Do not fetch arbitrary URLs on the server without a new approved SSRF design.
- Do not put credentials into shell output, prompts, logs, git, or plan docs.
- Do not mutate `home-cluster`, DavidApps, MinIO, or production DB without the
  authority named in Phase 8.
- Update `plans/BUILD-RESULTS.md` with commands, evidence, and remaining work.
