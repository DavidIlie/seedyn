# Seedyn decision register

Status: **living document**

Later entries win if two entries conflict. A decision changes only when David
explicitly revisits it; implementation convenience is not a decision.

## Locked from the kickoff

| ID    | Decision                                                      | Consequence                                                                                                                             |
| ----- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Seedyn is intentionally very small.                           | Reject service splits and speculative subsystems.                                                                                       |
| D-002 | Use one Next.js 16.3 application and Docker image.            | Dashboard, API, docs, and CDN gateway share one deployable.                                                                             |
| D-003 | Maximize Server Components and server rendering.              | Direct RSC reads; client islands only for browser interactions.                                                                         |
| D-004 | Adopt Instant Navigations, Cache Components, and PPR.         | Enable 16.3 flags and test visible shells in CI.                                                                                        |
| D-005 | Authenticate through DavidApps using NextAuth/Auth.js.        | Standard OIDC RP; no local password login.                                                                                              |
| D-006 | The application is invite-only; David is the initial user.    | DavidApps owns admission; no public registration.                                                                                       |
| D-007 | Durable file storage is MinIO.                                | PostgreSQL stores metadata, never file bodies.                                                                                          |
| D-008 | Recreate the useful product and UX of `sharex-upload-server`. | Preserve its upload categories, dashboard concepts, API-key flow, and ShareX compatibility while replacing its obsolete implementation. |
| D-009 | Fumadocs documentation is part of the authenticated app.      | HTML docs plus Markdown/LLM representations share the app's auth boundary.                                                              |
| D-010 | GIF conversion runs in the user's browser.                    | No FFmpeg server or processing queue in V1.                                                                                             |
| D-011 | Production runs on `home-cluster`.                            | GitOps work belongs in that repository and needs separate approval.                                                                     |

## Locked from repository/platform evidence

| ID    | Decision                                                                                                                         | Evidence                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-012 | DavidApps OIDC uses issuer `https://id.davidapps.dev`, PKCE S256, and provider id `davidapps`.                                   | `davidapps-auth/.agents/skills/integrate-oidc`.                                                                                                            |
| D-013 | Production and localhost use distinct pairwise OIDC clients.                                                                     | DavidApps one-host-per-client rule.                                                                                                                        |
| D-014 | OIDC secrets never enter the model transcript or git.                                                                            | DavidApps owner-only MCP secret-store protocol.                                                                                                            |
| D-015 | The current uncommitted Seedyn edits are preserved during planning.                                                              | Worktree ownership rule; they predate this plan.                                                                                                           |
| D-016 | `home-cluster` application changes require explicit approval.                                                                    | `home-cluster/CLAUDE.md`.                                                                                                                                  |
| D-017 | `default` is the recommended home-cluster namespace.                                                                             | Existing personal web applications live there; no `personal-projects` namespace exists.                                                                    |
| D-018 | Pin Next.js exactly to `16.3.0` for the first complete build.                                                                    | David explicitly wants the 16.3.0 behavior exercised and any framework issues reported; 16.3.1 is a deliberate follow-up comparison, not a silent upgrade. |
| D-019 | Use two origins from one Next.js deployment: `seedyn.dave.tips` for the authenticated app and `i.dave.tips` for public media.    | One pod, Service, image, and process serve both; host routing isolates uploaded bytes without creating a second app.                                       |
| D-020 | Never accept API keys in query strings.                                                                                          | Legacy aliases keep raw/Bearer `Authorization` compatibility, but URLs cross logging/history boundaries before application redaction.                      |
| D-021 | Legacy upload aliases return HTTP 200 with `{"message":"<url>"}`; the canonical endpoint returns HTTP 201 with the richer shape. | This preserves actual ShareX black-box compatibility without copying the old validation and scope bugs.                                                    |
| D-022 | Redis is mandatory for upload rate limits and fails closed with a safe 503 before request-body parsing.                          | Abuse controls remain true under dependency failure and the already-running Redis has a concrete job.                                                      |
| D-023 | Public media edge caching is capped at 24 hours until an authenticated purge integration exists.                                 | Origin deletion is immediate while the UI/docs state the bounded recipient/cache-retention caveat honestly.                                                |
| D-024 | Upload routes authenticate before a bounded streaming multipart parser.                                                          | `Request.formData()` is not acceptable for the 64 MiB contract or concurrency envelope.                                                                    |
| D-025 | Runtime-protected docs contain no secrets and every representation/search surface is authenticated and private/no-store.         | Runtime auth prevents casual exposure; repository visibility is a separate boundary and may expose checked-in source.                                      |
| D-026 | Admin authorization comes only from DavidApps' signed application role.                                                          | Exact `app_role=admin` maps to local `ADMIN`; email remains display data and all other values fail closed to member.                                       |
| D-027 | Deliberate clipboard-file paste and file drop start uploading immediately.                                                       | The low-step path is Paste → Copy original, or Paste → Create GIF URL → Copy GIF; picker selection still confirms explicitly.                              |
| D-028 | Seedyn's invite-only OIDC application is registered in DavidApps.                                                                | Public app/client ids are checked in; its one-time secret stays in the owner-only handoff until encrypted cluster delivery.                                |

## V1 implementation decisions

These recommendations were accepted by the sustained build instruction and are
now implemented. Production-only resource mutations remain subject to D-011,
D-016, and the Phase 8 authority boundary.

| ID    | Recommendation                                                                             | Why                                                                                      |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| R-003 | One production replica in V1.                                                              | Honest fit for home-cluster and avoids distributed Next cache coordination.              |
| R-004 | PostgreSQL + Prisma, not SQLite.                                                           | Auth.js database sessions and a cluster-safe metadata store already fit the environment. |
| R-005 | Remove tRPC and TanStack Query.                                                            | The app's reads and UI mutations fit direct RSC + Server Actions.                        |
| R-006 | Private dedicated MinIO bucket/user.                                                       | Least privilege and clean lifecycle ownership.                                           |
| R-007 | Stable high-entropy public slugs.                                                          | Public-by-link URLs must be unguessable and collision resistant.                         |
| R-008 | Store original and GIF derivative.                                                         | “Copy as GIF” becomes repeatable without destroying source quality.                      |
| R-009 | Preserve legacy upload aliases and generate `.sxcu`.                                       | Old concepts remain compatible while setup becomes one click.                            |
| R-010 | Still image conversion via `gifenc`; video/animation via lazy single-thread `ffmpeg.wasm`. | Keeps the common path tiny and the expensive codec off the initial bundle.               |

## Interview log

### 2026-08-17 — hostname direction

David wants a short `dave.tips` hostname such as `i.dave.tips` because the app
runs on home-cluster. Repository evidence confirms `dave.tips` and
`*.dave.tips` are already routed by the cluster and included in public
external-dns. David confirmed `seedyn.dave.tips` for the authenticated app and
`i.dave.tips` for public media. Both are served by the same Next.js deployment.
Seedyn adapts ZeroCut's host-classification/rewrite pattern, but uses a fixed
origin-role map instead of database-backed custom-domain tenancy.
