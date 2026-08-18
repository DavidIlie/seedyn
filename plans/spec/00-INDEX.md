# 00 — Specification index and authority

Status: **implemented baseline**

## Documents

| File                              | Owns                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `01-PRODUCT.md`                   | Actors, jobs, scope, user journeys, terminology                       |
| `02-ARCHITECTURE.md`              | Runtime boundaries, module shape, request/data flows                  |
| `03-DATA-MODEL.md`                | PostgreSQL entities, constraints, lifecycle                           |
| `04-HTTP-AND-SHAREX-PROTOCOL.md`  | Upload API, auth, response/error contracts, `.sxcu`                   |
| `05-AUTH-AND-SECURITY.md`         | DavidApps OIDC, invite policy, API keys, abuse and content safety     |
| `06-STORAGE-CDN-AND-GIF.md`       | MinIO layout, atomicity, CDN behavior, browser conversion             |
| `07-UX-AND-WIREFRAMES.md`         | Information architecture, page behavior, responsive wireframes        |
| `08-NEXTJS-16.3-RENDERING.md`     | RSC boundaries, caching, Suspense, Partial Prefetching, instant tests |
| `09-DEPLOYMENT-AND-OPERATIONS.md` | Docker, home-cluster, secrets, migrations, health, recovery           |
| `10-TESTING-AND-ACCEPTANCE.md`    | Test pyramid, adversarial matrix, product definition of done          |
| `11-BUILD-PLAN.md`                | Ordered implementation waves and freeze gates                         |
| `12-INPUTS-AND-OPEN-QUESTIONS.md` | Resolved V1 decisions and deferred production prerequisites           |
| `13-RESEARCH.md`                  | Inspected repositories and authoritative external references          |
| `../BUILD-RESULTS.md`             | Implemented surface, local evidence, framework notes, deferred work   |

## Conflict order

1. Latest explicit entry in `../DECISIONS.md`.
2. Security and protocol invariants in `05` and `04`.
3. Data lifecycle rules in `03` and `06`.
4. Architecture in `02` and rendering rules in `08`.
5. UX in `07`.
6. Build sequencing in `11`.
7. The summary in `../PLAN.md`.

If implementation reveals a contradiction, stop at that seam and update the
spec plus decision log before changing code. Do not make two incompatible parts
"temporarily" coexist.

## Frozen seams before feature work

The build must freeze these contracts first:

1. Route and host map.
2. Prisma schema and lifecycle enums.
3. Public upload/API-key contract.
4. MinIO object-key and compensation protocol.
5. Auth/session identity contract.
6. Browser GIF worker interface.
7. Design tokens and app-shell structure.
8. Environment-variable and secret manifest.

Everything else may be built vertically once those seams have passing contract
tests.
