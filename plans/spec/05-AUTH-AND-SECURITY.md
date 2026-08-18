# 05 — Authentication and security

Status: **implemented locally; production OIDC provisioning deferred**

## DavidApps OIDC contract

- Issuer: `https://id.davidapps.dev`.
- Discovery: `/.well-known/openid-configuration`.
- Client type: confidential server client.
- Flow: authorization code with PKCE S256 and state.
- Scopes: `openid profile email`; no `offline_access`.
- Auth.js provider id: `davidapps`.
- Production callback:
  `https://seedyn.dave.tips/api/auth/callback/davidapps` (recommended host).
- Local callbacks: `http://seedyn.localhost:3000/api/auth/callback/davidapps`
  and the plain-loopback fallback
  `http://localhost:3000/api/auth/callback/davidapps` on a separate localhost
  client because DavidApps subjects are pairwise per client.

The app stores the issuer/provider plus pairwise subject as the durable identity.
It must never use email as an identity key or auto-link a new provider account to
an existing user by email.

## Invite policy

Recommended MCP setup after URLs are locked:

```text
name: Seedyn
slug: seedyn
mode: oidc
signupPolicy: invite
hostnames: [seedyn.dave.tips]
devUrls: [http://seedyn.localhost:3000, http://localhost:3000]
consentInterstitial: true (recommended for the first integration)
```

Then explicitly ensure `david@davidilie.com` has owner/access through the
DavidApps control plane. Future users are invited there. Seedyn does not add an
email allowlist that can drift from the identity platform.

Provisioning preconditions:

1. Run `pnpm davidapps:agent doctor` from canonical `davidapps-auth`.
2. Call `setup_app` only after hostname confirmation.
3. Record public client id(s).
4. Hand each opaque secret reference to an approved non-model mover for local
   `.env` or SOPS placement.
5. Never open, print, paste, or commit the referenced secret.

## Session contract

- Auth.js v5 database sessions through Prisma.
- Secure, HttpOnly, SameSite=Lax cookies in production.
- Trust the external proxy/host only through explicit production config.
- Every protected RSC read, Server Action, and browser upload route calls a
  shared `requireUser()` guard.
- The UI layout redirect is convenience, not the authorization boundary.
- Sign-out invalidates the local database session; DavidApps global logout is
  not implied.

## API-key security

- Generate 256 random secret bits.
- Display once; store a display-only prefix and a unique SHA-256 digest of the
  complete 256-bit random key. Authentication hashes the full candidate and
  queries the unique digest; it never uses a collision-capable prefix lookup.
- Key names are unique per user and bounded/sanitized.
- Scopes use a positive allowlist. Unknown stored scopes never grant access.
- Revoked/expired keys return the same response as nonexistent keys.
- Authenticate and pass the Redis limiter before multipart parsing. Redis
  failure returns a safe 503 before body parsing or durable work.
- Limit failed auth attempts by source address and key prefix without logging
  the candidate key.
- Update `lastUsedAt` no more often than a bounded interval (for example five
  minutes) per key.
- Secret-bearing `.sxcu` downloads are `Cache-Control: no-store` and generated
  client-side or in the create response only.

## Authorization matrix

| Operation                  | Browser session | API key                     | Anonymous |
| -------------------------- | --------------- | --------------------------- | --------- |
| View own dashboard/uploads | own user        | no                          | no        |
| Upload original            | own user        | scoped owner                | no        |
| Create GIF variant         | own user        | no in V1                    | no        |
| Delete upload              | own user        | deferred API scope          | no        |
| Manage keys                | own user        | no                          | no        |
| Read HTML/Markdown docs    | invited user    | optional future `docs:read` | no        |
| Fetch exact CDN URL        | yes             | yes                         | yes       |
| List/search CDN            | no              | no                          | no        |

## Public-content threat model

Seedyn intentionally publishes uploaded bytes to an uncredentialed origin. The
separate CDN origin reduces risk to app cookies but does not make arbitrary
content harmless.

Required controls:

- app auth cookies are host-only and never scoped to `.davidapps.dev`;
- Auth.js cookies are issued only for `seedyn.dave.tips`, never parent-scoped to
  `.dave.tips`, so browsers do not send them to `i.dave.tips`;
- no credentials or permissive cookie-based CORS on the CDN origin;
- `nosniff` on all objects;
- safe inline allowlist limited to raster images, GIF, supported video/audio,
  and plain text as decided; HTML/SVG/PDF/script/executable default to attachment;
- restrictive `Content-Security-Policy: default-src 'none'; sandbox` on raw
  responses where it is valid;
- sanitize filenames for Content-Disposition, including CR/LF and quote removal;
- high-entropy slugs; uniform 404; no public listing;
- content length and decompression/metadata parsing limits;
- uploaded text is escaped in any rich viewer.

## URL-ingest threat model

The recommended direct-browser fetch intentionally avoids a server-side URL
fetcher and its SSRF surface. Validate only `https:` URLs, cap streamed bytes,
reject embedded URL credentials, omit credentials/referrer, and reject
redirects to non-HTTPS origins in the browser where observable. The app CSP
therefore permits `https:` in `connect-src`; this exception must never be copied
to `script-src`, `style-src`, `frame-src`, or `form-action`.

If David later requires ingestion from CORS-hostile sites, add a separate design
for a server fetcher with DNS resolution pinning, private/link-local/metadata IP
blocking before and after redirects, response/time caps, and an explicit
allowlist. Do not add a naive `fetch(userUrl)` fallback.

## Upload parsing and content validation

- Ingress and app enforce aligned byte limits.
- One file per request; bounded form field count/name/value sizes.
- Reject malformed multipart and truncated transfers.
- Hash bytes while writing where the selected parser/storage client allows.
- Inspect magic bytes; never trust original extension or MIME alone.
- Normalize extension to a known safe lowercase value or `bin`.
- Preserve the display filename separately; never include it in a filesystem
  path, route matcher, log line, or response header without encoding.
- MinIO bucket stays private.

## Web security baseline

- Origin/CSRF protection on cookie-authenticated mutations through Server Action
  checks and explicit same-origin validation on Route Handlers.
- CSP appropriate to Next.js, Fumadocs, local workers, and self-hosted wasm; no
  wildcard script origin.
- HSTS at ingress, frame denial, Referrer-Policy, Permissions-Policy.
- Redirect destinations are fixed/same-origin, never raw query strings.
- Production errors hide causes; structured logs include request id.
- Dependency audit and lockfile review before deploy.
- Every Fumadocs representation is protected: HTML, RSC/prefetch, Markdown,
  search, and any `llms*` route. Protected responses are `Cache-Control:
private, no-store`; no static browser-readable search index is emitted.

## Secret inventory

| Secret                                              | Local sink                           | Production sink                | May model read it? |
| --------------------------------------------------- | ------------------------------------ | ------------------------------ | ------------------ |
| `AUTH_DAVIDAPPS_SECRET`                             | gitignored `.env` via approved mover | SOPS Secret via approved mover | No                 |
| `AUTH_SECRET`                                       | gitignored `.env`                    | SOPS Secret                    | No                 |
| `DATABASE_URL`                                      | local dev value                      | SOPS Secret                    | No raw value       |
| MinIO key/password                                  | gitignored `.env`                    | SOPS Secret                    | No raw value       |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` if runtime-set | gitignored `.env`                    | SOPS Secret                    | No                 |

Public ids, issuer URLs, bucket name, app/CDN origins, limits, and feature flags
are configuration rather than secrets.

## Logging redaction

Never log:

- request Authorization/cookie headers;
- Auth.js/OIDC tokens or callback query parameters;
- full API keys or `.sxcu` content;
- MinIO credentials/presigned URLs;
- uploaded text/file bodies;
- raw browser conversion logs containing filenames unless sanitized.

Log event name, safe user/upload/key ids, key prefix, byte count, MIME category,
duration, result category, and request id.
