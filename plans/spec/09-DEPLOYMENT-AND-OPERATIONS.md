# 09 — Deployment and operations

Status: **application image implemented; home-cluster deployment deferred**

## Environments

### Local

- Next.js at `http://seedyn.localhost:3000`, with media at
  `http://i.localhost:3000`.
- Explicit local-only Auth.js Credentials provider for the configured developer
  email; production refuses this provider.
- Existing local PostgreSQL and Redis plus the private `seedyn-dev` MinIO bucket.
- No filesystem storage fallback: local and production exercise the same object
  store contract.
- Idempotent development seeding creates only the configured local identity.

### Production

- `home-cluster`, recommended namespace `default`.
- App origin `seedyn.dave.tips` and public origin `i.dave.tips`.
- Both ingress hosts target the same Kubernetes Service and container; media has
  no second Deployment, image, process, or repository.
- Image `ghcr.io/davidilie/seedyn`.
- Existing home-cluster PostgreSQL service; dedicated database/user created via
  the existing `postgres-init` pattern.
- TrueNAS MinIO private bucket/service account.

## Docker image

Multi-stage, reproducible build:

1. Corepack/pnpm dependency stage with frozen lockfile.
2. Builder stage runs Fumadocs generation, Prisma generation, typecheck/tests as
   appropriate, and `next build`.
3. Runtime stage contains standalone output, `.next/static`, `public`,
   self-hosted FFmpeg worker assets, Prisma schema/migrations plus deploy CLI,
   and no source/dev toolchain not needed at runtime.
4. Non-root user, read-only root filesystem compatible.
5. `HOSTNAME=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`.
6. Graceful SIGTERM with 10–30 seconds for inflight uploads/`after()` work.

The builder receives explicitly named, non-secret build-only placeholders for
authentication values. The runtime stage does not inherit them and requires its
own production environment.

## Database creation and migration

Two distinct operations:

1. Existing `postgres-init` image creates the production database/user from
   SOPS values when absent.
2. `prisma migrate deploy` applies checked-in application migrations.

Recommended V1: a migration init container from the same image runs before the
single app container. The runtime image therefore intentionally includes the
minimal Prisma migration tooling and files. Never use `prisma db push` in
production and never make `postinstall` mutate a production database.

Backward-compatible migration rule:

- expand schema;
- deploy code that tolerates both states if needed;
- backfill through explicit command;
- contract/remove only in a later deploy.

## Kubernetes resources

Recommended shape:

```text
kubernetes/apps/default/seedyn/
├── ks.yaml
└── app/
    ├── helmrelease.yaml
    ├── kustomization.yaml
    └── secret.sops.yaml
```

HelmRelease expectations:

- `bjw-s/app-template` version already used by the cluster, verified at build;
- one replica;
- image pull secret if GHCR remains private;
- reloader annotation;
- non-root pod/container security context, all capabilities dropped,
  RuntimeDefault seccomp, no privilege escalation;
- read-only root;
- `emptyDir` for `/tmp` and standalone `.next/cache`;
- service on 3000;
- liveness `/api/healthz`, readiness `/api/readyz`;
- external ingress with both hosts;
- per-host annotations/cache/body-size rules kept separate if necessary;
- resource request based on idle measurement; memory limit includes one buffered
  upload plus Next image/wasm-independent overhead;
- preStop/drain delay.

The `default` namespace kustomization and Flux image automation must include the
new app. Exact files follow current home-cluster layout at implementation time.

## Ingress split

App origin:

- dynamic HTML/RSC streaming, buffering disabled;
- browser and ShareX upload body size slightly above app cap;
- no CDN caching of authenticated HTML;
- standard security headers.

CDN origin:

- GET/HEAD/OPTIONS only at ingress if practical;
- Cloudflare/proxy caching allowed from application Cache-Control;
- no auth subrequest/gate;
- rate/connection controls suitable for public media;
- no request body.

Both resolve through home-cluster external ingress. DNS automation for
`dave.tips` must be verified; existing home-cluster apps demonstrate the
domain but do not by themselves prove the desired CDN cache policy.

## Health endpoints

`GET /api/healthz`:

- process-only liveness;
- no dependency calls;
- app-origin and direct IP/localhost probes;
- small JSON/status; never cached.

`GET /api/readyz`:

- numeric loopback or the exact configured pod IP only; public app/media,
  arbitrary IP, and literal `localhost` authorities cannot invoke it;
- verifies PostgreSQL, Redis, and a bounded MinIO bucket capability;
- strict short timeout;
- returns only component names/status, not endpoint/credential details;
- readiness failure removes pod from service without causing restart loops.

Inject `POD_IP` from `status.podIP` with the Kubernetes downward API. The
kubelet's default HTTP probe authority is the pod IP, so omitting this value
intentionally fails readiness closed. Keep ingress request-body and timeout
limits at or below Seedyn's documented upload limits as an independent outer
bound.

## Environment contract

Implemented names:

```text
NODE_ENV
APP_URL
CDN_URL
AUTH_SECRET
AUTH_DAVIDAPPS_ID
AUTH_DAVIDAPPS_SECRET
DATABASE_URL
REDIS_URL
APP_HOSTS
MEDIA_HOSTS
TRUSTED_PROXY_HOPS
POD_IP
MINIO_URL
MINIO_PORT
MINIO_SECURE
MINIO_KEY_ID
MINIO_PASSWORD
MINIO_BUCKET
SEEDYN_DEV_AUTH
SEEDYN_DEV_AUTH_EMAIL
SEEDYN_BUILD_INSTANT_TESTING
```

Use a typed server-side env schema. Do not expose MinIO configuration as
`NEXT_PUBLIC_*`; only app/CDN public origins may reach client bundles.

## CI/CD

Application repository workflow:

1. install with frozen lockfile;
2. generate Fumadocs and Prisma artifacts;
3. format check, lint, typecheck;
4. unit/contract/integration tests with PostgreSQL + MinIO;
5. Next production build;
6. Playwright functional and `instant()` tests against production build;
7. container build.

The checked-in workflow implements these verification gates. Image publication,
vulnerability attestation, GHCR tagging, and Flux automation remain part of the
separately authorized production-delivery phase.

No workflow decrypts long-lived app secrets into logs. CI integration services
use ephemeral test credentials.

## Observability

V1 keeps operations small but not blind:

- structured JSON logs to stdout for existing fluent-bit;
- request id on API errors and key upload events;
- event names for upload accepted/failed, storage compensation, key auth failed,
  key created/revoked, variant stored, delete failed, readiness failed;
- duration and byte counts but no bodies/secrets;
- optional Prometheus endpoint only if the cluster pattern makes it cheap; not a
  reason to add another service.

Minimum useful measurements:

- upload success/error by kind/status;
- upload bytes and duration;
- CDN upstream misses/errors/range requests (prefer ingress/app logs);
- GIF variant finalization errors;
- DB/MinIO readiness failures;
- orphan/delete-failed counts from maintenance CLI.

## Backup and recovery

Metadata:

- verify existing home PostgreSQL backup includes the Seedyn database;
- document point-in-time/restore procedure and ownership recreation.

Objects:

- enable bucket versioning;
- document TrueNAS snapshot retention;
- define off-machine backup or explicitly label its absence an accepted risk;
- periodically sample restore an object and verify stored SHA-256.

Disaster recovery order:

1. restore database and object bucket to a mutually understood point;
2. run read-only consistency scan;
3. report missing objects/orphans;
4. start app read-only if inconsistency is material;
5. repair or accept named losses before writes resume.

## S3 credential root secret

The deployment must provide a stable, randomly generated `S3_MASTER_SECRET` of
at least 32 characters. Seedyn derives client signing secrets from it and never
stores those client secrets in Postgres. The S3 route fails closed when the
variable is absent. Replacing it invalidates every issued S3 credential, so
users must rotate their per-key S3 credentials after an intentional root-secret
rotation.

## Operator commands

The implemented image/package exposes:

- `db:migrate`;
- `db:seed` and `storage:setup` for explicit local development only;
- `storage:check` consistency report;

`storage:check` is deliberately read-only and advisory. It uses a safety age and
two database snapshots to avoid classifying in-flight writes as orphans. Mutating
repair commands are deferred until a production recovery policy is approved.

## Deployment approval boundary

Building application code does not authorize:

- editing or pushing `home-cluster`;
- provisioning/rotating OIDC credentials;
- creating/changing MinIO users/buckets;
- applying migrations to production;
- reconciling Flux or running mutating kubectl commands.

Deployment work must stop at each new-authority boundary or rely on explicit
authorization granted for that operation.
