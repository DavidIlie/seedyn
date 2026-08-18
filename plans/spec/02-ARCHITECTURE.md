# 02 — Application architecture

Status: **implemented baseline**

## Runtime boundary

One Next.js Node.js runtime serves all code. Edge runtime is not used: Cache
Components do not support it, Auth.js/Prisma/MinIO need Node APIs, and production
is a normal container.

```text
app/
├── (auth)/
│   └── sign-in/
├── (app)/
│   ├── layout.tsx
│   ├── dashboard/
│   ├── images/
│   ├── files/
│   ├── texts/
│   ├── uploads/[id]/
│   ├── api-keys/
│   └── docs/
├── api/
│   ├── auth/[...nextauth]/
│   ├── upload/
│   ├── images/              # legacy-compatible alias
│   ├── files/               # legacy-compatible alias
│   ├── texts/               # legacy-compatible alias
│   ├── uploads/[id]/gif/
│   ├── healthz/
│   └── readyz/
├── _cdn/[filename]/route.ts # internal destination of cdn-host rewrite
├── llms.txt/
├── llms-full.txt/
└── llms.mdx/docs/[[...slug]]/

content/docs/                 # Fumadocs MDX
prisma/
├── schema.prisma
└── migrations/
src/
├── auth/
├── components/
│   ├── shell/
│   ├── ui/
│   └── upload/
├── server/
│   ├── db/
│   ├── uploads/
│   ├── api-keys/
│   └── storage/
├── gif/
│   ├── client.ts
│   ├── still.worker.ts
│   └── ffmpeg.worker.ts
└── styles/
```

Exact `src/app` versus root `app` placement follows the final scaffold; the
ownership boundaries above are normative.

## Component boundary rules

### Server Components by default

- page and layout components;
- all Prisma reads;
- auth/session resolution;
- list pagination and filtering;
- stats and metadata rendering;
- Fumadocs page rendering;
- `<form action={serverAction}>` mutations where progress is unnecessary.

### Small Client Components

- theme toggle and narrow-screen disclosure;
- copy-to-clipboard feedback;
- upload picker/drop/paste/progress/cancel;
- GIF conversion and worker control;
- destructive confirmation dialog;
- one-time API-key reveal/download.

A Client Component receives serializable data and action references; it never
imports Prisma, MinIO, auth config, or server-only modules.

## Read path

```text
request/navigation
  -> shared static app shell
  -> authenticated boundary reads Auth.js session
  -> page-local Suspense regions query Prisma directly
  -> server-rendered HTML/RSC payload streams
  -> only interactive islands hydrate
```

No page calls Seedyn's own HTTP API from a Server Component. No `useEffect`
fetches primary page data after mount.

## Mutation path

### Server Action

Used for API-key create/revoke, upload delete, and ordinary settings-like form
mutations. Every action validates input, authenticates, checks ownership, runs
the service operation, and returns a typed result or redirects.

### Route Handler

Used where the caller needs a real HTTP contract or upload progress:

- Auth.js callbacks;
- ShareX/custom clients;
- browser multipart upload and GIF derivative upload;
- public CDN GET/HEAD/OPTIONS;
- health/readiness;
- Markdown/LLM documentation.

## Service modules

Route/page code remains thin. Domain behavior lives in server-only modules:

- `api-keys`: generate, hash, authenticate, revoke, update last-use;
- `uploads`: classify, validate, create, list, attach variant, delete;
- `storage`: MinIO client, object metadata, range reads, compensation cleanup;
- `public-url`: canonical app/CDN URL construction and slug validation;
- `auth`: provider config, session helpers, authorization guards;
- `docs`: source loader and authenticated Markdown rendering.

Each service accepts explicit identity/input. Do not hide authorization inside a
global singleton or trust a user id supplied by the browser.

## Host routing

Locked origin roles:

- Requests for `seedyn.dave.tips` use normal App Router routes.
- Requests for `i.dave.tips/<slug>.<ext>` are rewritten by `proxy.ts` to
  the internal CDN Route Handler.
- CDN host requests to any other route return a small 404; they never render the
  dashboard, auth callback, or docs.
- App-origin requests cannot bypass auth by spoofing `Host`; trust only the host
  value validated against an environment allowlist. Ignore client-supplied
  `X-Forwarded-Host`.
- The internal media handler repeats the authority check so `proxy.ts` is not a
  single authorization boundary. App/auth routes fail closed on the media host,
  and the internal CDN route fails closed on app/unknown hosts.
- Upload Route Handlers repeat the app-host boundary and are deliberately
  excluded from the Proxy matcher. Next 16.3 clones and buffers non-GET/HEAD
  bodies before Proxy runs, with silent truncation at its clone cap; bypassing
  Proxy preserves multipart streaming and lets pre-body auth/rate limits run
  before application buffering. Remaining proxied bodies are capped at 256 KiB.
- Upload, callback, and `.sxcu` URLs come only from fixed validated `APP_URL`
  and `CDN_URL`, never request headers.

This borrows the proven shape of ZeroCut's one-process custom-domain proxy but
not its product machinery. Seedyn uses a static, exhaustively typed resolver:

```ts
type OriginRole = "app" | "media" | "local" | "unknown";

resolveOriginRole(hostname); // no database or network I/O
```

`app` continues normally, `media` can reach only the internal media route tree,
`local` supports explicit development hosts, and `unknown` returns `421` or
`404`. There is no domain table, Cloudflare custom-hostname lifecycle, billing,
or database query in `proxy.ts`.

## Concurrency and idempotency

- Public slug and object key are generated before the MinIO PUT.
- Upload finalization uses a unique slug constraint.
- GIF variants have `@@unique([uploadId, kind])`; concurrent conversion uploads
  result in one winner and cleanup of the losing object.
- API-key last-use writes are throttled/coalesced so every screenshot does not
  create a hot write if traffic increases.
- Delete is a lifecycle transition, not a blind `Promise.all`.

## Dependency policy

- Prefer platform/Next APIs and small focused packages.
- Remove tRPC, TanStack Query, superjson, and duplicate client caches from the
  current scaffold.
- Keep Auth.js, Prisma, Zod, MinIO or AWS S3 client, Fumadocs, and the two GIF
  toolchains only where their jobs are concrete.
- Pin exact versions in the lockfile for the one-shot build. Upgrade deliberately.
- Do not build a home-grown multipart parser, GIF codec, OAuth client, markdown
  engine, or focus-trap/dialog primitive.

## Error model

Domain errors are typed into these stable categories:

- `unauthenticated`, `forbidden`;
- `invalid_input`, `unsupported_media`, `payload_too_large`;
- `not_found`, `conflict`;
- `rate_limited`;
- `storage_unavailable`, `database_unavailable`;
- `conversion_rejected` (client-side);
- `internal` with a request id.

Public APIs map categories to documented HTTP statuses. UI actions show safe,
specific messages. Production logs retain causes and request ids but never API
keys, cookies, auth tokens, or uploaded text bodies.
