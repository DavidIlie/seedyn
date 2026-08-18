# Seedyn build results

Status: **application complete and verified locally; production provisioning and
home-cluster deployment require separate authority**

Date: **2026-08-18**

## Delivered

- One exact-pinned Next.js 16.3.0 application serves the authenticated
  `seedyn.dave.tips` role and anonymous exact-media `i.dave.tips` role.
- Auth.js uses DavidApps OIDC in production and an explicit, production-rejected
  local provider for `david@davidilie.com`; the supported dev launcher binds
  loopback only and the provider refuses to initialize without its marker.
- PostgreSQL owns Auth.js, API-key, upload, variant, and deletion state; Redis
  owns fail-closed layered abuse limits; a private MinIO bucket owns bytes.
- The product is organized around the general upload/store/serve job. Its
  canonical HTTP upload endpoint accepts any supported client; ShareX remains a
  first-class optional integration with three compatible aliases, scoped
  digest-only keys, one-time reveal, `.sxcu` export, and revocation.
- Browser upload supports file selection, drop, paste, HTTPS/CORS URL ingest,
  real progress, cancellation, and authoritative RSC refresh.
- Still images use a small `gifenc` worker; supported video uses lazy self-hosted
  `ffmpeg.wasm`. The untrusted result is validated and stored as one reusable
  permanent GIF variant.
- Protected Fumadocs HTML, Markdown, search, and LLM representations describe
  the real contracts without exposing credentials or even the page tree to a
  signed-out request. The UI uses Fumadocs' actual layout, page, sidebar, TOC,
  search, breadcrumb, and footer primitives rather than an MDX-only imitation.
- The application now has its own “Blue Port” identity: a custom object-to-link
  mark, Onest/Geologica/Azeret typography, cool neutral surfaces, true cobalt
  actions, literal Library-first information architecture, an explanatory
  split sign-in surface, a compact progressive upload dialog, and an account
  menu that shows the current identity alongside account destinations and
  sign-out. It was verified at narrow and wide widths in both color schemes.
- Cache Components, PPR, Partial Prefetching, shared Server Component shells,
  and Next's `instant()` assertions cover sign-in, every primary destination,
  and upload detail navigation.
- The standalone Docker image is digest-pinned at its base/frontend, runs as a
  non-root user, includes clean-checkout FFmpeg assets and Prisma migrations,
  rejects missing or build-only authentication before starting, and exposes
  liveness plus internal-only dependency readiness.
- Release builds remove Next-generated standalone `.env*` copies, pin the
  Instant-testing API off unless the dedicated E2E opt-in is present, and
  preflight the complete production environment before importing Next.
- GitHub Actions provisions disposable PostgreSQL, Redis, and MinIO, then runs
  formatting, static checks, integration, development/production browser tests,
  and a container build.

## Local acceptance evidence

The final handoff completed these gates from the release tree:

```text
pnpm format:check
pnpm check
pnpm storage:setup
pnpm db:migrate
pnpm db:seed
pnpm test:integration
pnpm storage:check
pnpm test:e2e
pnpm test:e2e:production
pnpm audit --prod --audit-level=high
pnpm build
docker build --tag seedyn:local .
```

`pnpm check` passed 33 test files / 234 tests. Both development and standalone
production browser matrices passed eight cases, including sensitive Server
Actions staying inert without JavaScript, one-time key/download/revoke, a real
PNG upload, browser worker GIF conversion, permanent original/GIF retrieval,
deletion/post-delete 404s, authored docs order, malformed docs paths, strict host
semantics on Proxy-excluded methods, signed-out docs non-disclosure, and an
intact upload above 10 MiB. The integration smoke passed canonical and legacy
ShareX, MinIO, CDN, Range, HEAD,
ETag, rejection, and >10 MiB streaming contracts. Reconciliation ended with
zero expected, anomalous, orphaned, or missing objects.

The final UI refinement used the Harness Teamwork protocol with Codex as merge
owner, Claude Opus 5 as design director, Fable 5 as taste reviewer, and a
separate GPT-5.6 edge scan. Opus kept the Blue Port tokens, Library naming,
global Upload action, URL disclosure, and Fumadocs integration while flagging
small-mark legibility, file-picker focus, public-slug visibility, header order,
and excess dialog containers. Fable kept the split composition but removed its
DavidApps-like uppercase-mono grammar, simplified the mark to solid primitives,
and flattened the dialog. The edge scan added 320 px/zoom, label-in-name,
fallback geometry, DOM order, and stale-selector gates. All passes were
advisory; the primary reviewed, implemented, and validated every accepted
change.

The final container smoke passed non-root UID/GID 1001, read-only root, writable
bounded temp/cache mounts, liveness, dependency readiness, host isolation,
media CSP, explicit upload-method isolation, Prisma/migration availability, and
the missing-auth exit-1 guard. Both exact test containers were removed.

DeepSec's Opus 5 passes surfaced 67 concrete issues in credential lifetime,
rate-limit composition, build-only auth fallbacks, public sign-in amplification,
progressive enhancement, reconciliation races, temporary-file cleanup, and test
safety. The implementation was hardened against each finding; all 67 were
revalidated as fixed against the changed source. The final focused revalidation
returned zero true positives and eight fixed verdicts, including the three
Proxy candidates. Generated findings and run data remain ignored; the reviewed
threat model/config is checked in.

## Next.js 16.3 observations

These are retained for framework-team investigation rather than hidden by the
application handoff:

1. After successful `@next/playwright instant()` suites, `next dev --turbopack`
   twice pinned a CPU core, accepted TCP connections, and returned no HTTP bytes;
   a stylesheet request therefore left the browser showing raw HTML. This was
   not a CSS compilation failure: HTML, RSC, CSS, and health routes all hung on
   the same process while its Next child stayed around 102% CPU. Next 16.3's
   default dev filesystem cache had grown to 1.0 GiB. Seedyn now disables only
   `turbopackFileSystemCacheForDev`, keeps Turbopack itself, and asserts computed
   styles in E2E. The same cache-disabled process subsequently survived 30
   styled navigation runs plus 1,290 page/CSS/health requests across the prior
   failure window, remained idle, and touched no persistent-cache files.
2. Re-enabling the cache on 16.3.0 against the preserved 1.0 GiB database did
   _not_ reproduce the stall: warm restore answered in 39 ms then roughly 5 ms,
   and the complete browser matrix passed. The cache is therefore not a
   universally poisoned snapshot. The leading hypothesis is an in-session
   persistence writer, snapshot/compaction, invalidation, or task-coordination
   loop that only occurs after a particular development workload. A useful
   capture should start with `--internal-trace --experimental-cpu-prof`, retain
   `RUST_BACKTRACE=full`, and collect a macOS `sample` plus thread/process state
   before terminating the spinning child.
3. The npm `canary` tag was `16.3.1-canary.22` at the time of the A/B. It uses a
   version-keyed cache directory separate from 16.3.0, so it could not consume
   the preserved failing database. Its fresh cache remained responsive for more
   than 18 minutes through route compilation and HMR while growing to about
   436 MiB / 61 files. That is a successful fresh-cache soak, not evidence that
   the original persistence loop is fixed.
4. `16.3.1-canary.22` introduced a separate deterministic Instant Navigation
   regression in this application. Inside the documented `instant()` helper,
   `/api-keys` → `/docs` fetched the destination RSC in 18–108 ms but never
   committed the URL before the 90-second timeout. The same failure reproduced
   with `turbopackFileSystemCacheForDev: false`; 16.3.0 passes the identical
   route and test. Both stable and canary also log failed `instant` validation
   when a protected route intentionally redirects its unauthenticated
   validation render. Seedyn therefore remains pinned to 16.3.0 with the dev
   persistence mitigation while these are investigated.
5. An otherwise static Server Action form required `await connection()` before
   Auth.js/action-reference work to avoid Cache Components prerender crypto
   behavior, making the action-bearing header stream instead of join the shell.
6. App Router output overwrote the configured docs `Vary: Cookie, Accept` with
   its RSC `Vary` fields. `Cache-Control: private, no-store` keeps the route safe.
7. The bundled Instant Navigation docs note that the testing cookie is shared
   across ports on one hostname; the production suite therefore uses a dedicated
   port and server lifecycle.
8. A JavaScript-disabled native Server Action form works in development, but a
   production PPR POST executes the mutation and returns its action state only in
   inline scripts/hidden streamed segments; the no-JS page is blank and a
   one-time secret becomes unrecoverable. Seedyn therefore keeps secret-creating
   and destructive controls disabled until hydration.
9. Node 26 reports `module.register()` deprecation from the current TS/Next test
   toolchain. Oxlint with its TS7 plugin is used because the contemporary ESLint
   stack is not TypeScript 7 compatible.
10. A rejected production instrumentation hook logs an unhandled rejection but
    leaves the standalone Node process alive. The Docker entrypoint therefore
    performs a complete environment preflight before importing `server.js`.
11. Proxy clones/buffers matched request bodies and silently truncates above its
    configured ceiling. Multipart POST paths therefore bypass Proxy and repeat
    host/origin/auth checks in handlers; explicit handlers preserve strict host
    semantics for every other method on those excluded paths.
12. A malformed `%25` docs segment reaches the guarded not-found UI in dev, but a
    standalone build's static-param matcher double-decodes and throws before the
    page guard. Proxy now rejects encoded docs segments with a bounded 404.
13. Local standalone output copied the root `.env` despite it being ignored by
    Git and Docker. The hermetic build wrapper now deletes exact generated
    `.env*` copies after every successful build and the container asserts none
    are present.
14. `request.nextUrl` can carry Next's listen authority rather than the validated
    public Host. An internal rewrite therefore re-enters Proxy under `localhost`
    in development; replacing it with the public media authority instead turns
    the rewrite into an external proxy in a container. Seedyn keeps Next's local
    authority and authenticates the internal second pass before host classification
    with a process-random 256-bit header that is removed before application code.
15. One cached Linux Docker rebuild failed nondeterministically while evaluating
    the unchanged PostCSS config (`__turbopack_context__.a is not a function`).
    The immediately following cache-independent build completed, as did native
    release builds before and after it. The successful clean image passed the
    full container smoke; the failed evaluator trace is retained here for the
    Next.js team rather than attributed to application code.

## Explicitly deferred production work

- DavidApps production client provisioning did not complete: the installed
  setup service returned an internal 500 and a subsequent exact lookup returned
  not found. No secret was printed or committed. The production client must be
  created with invite-only access before deployment.
- No `home-cluster`, production MinIO, DNS, TLS, SOPS, production database, Flux,
  GHCR, backup, or restore state was mutated by this build.
- Production readiness still requires the separately authorized Phase 8 steps
  in `spec/11-BUILD-PLAN.md`, including backup/restore proof before calling the
  storage promise permanent.
