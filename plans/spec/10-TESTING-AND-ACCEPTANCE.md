# 10 — Testing and acceptance

Status: **local acceptance implemented; external deployment checks deferred**

## Testing layers

### Unit

- slug/key generation and parsing;
- filename/extension/MIME classification;
- byte-range parser;
- content-disposition encoding;
- API-key format/hash/scope/expiry;
- cursor encoding/validation;
- URL builder and trusted-host policy;
- GIF option validation;
- error-to-HTTP mapping.

### Contract

- canonical and three compatibility upload endpoints;
- exact success/error JSON and headers;
- generated `.sxcu` schema fixture;
- public CDN GET/HEAD/OPTIONS and conditional/range behavior;
- Fumadocs Markdown/LLM auth behavior;
- Auth.js provider configuration/discovery assumptions using a local double.

### Integration

Use real ephemeral PostgreSQL and MinIO containers:

- migration from empty database;
- object PUT → row commit → CDN stream;
- database failure after object PUT triggers delete;
- cleanup failure is observable/reconcilable;
- variant race produces one row/object winner;
- delete success and partial failure lifecycle;
- pagination never crosses user boundary;
- revoked/expired/scopeless keys fail uniformly;
- MinIO range reads produce exact bytes.

### Browser/E2E

- DavidApps flow through a controlled auth test path or approved test client;
- protected-route redirect and session navigation;
- create/reveal/copy/download/revoke key;
- import-equivalent `.sxcu` request succeeds;
- browser upload with progress/cancel/retry;
- copy URL clipboard behavior;
- still image → GIF in worker → preview/upload/copy;
- short test video → GIF with lazy worker load;
- conversion cancellation leaves no server variant;
- accessible keyboard/dialog/menu flows;
- light/dark/system and narrow viewport visual regression;
- Next 16.3 `instant()` suite.

## Instant Navigation acceptance

For every main route, test:

1. direct document load through `instant(page, page.goto)`;
2. client navigation from a sibling/shared-layout route;
3. meaningful destination shell is visible inside the instant scope;
4. request-time content is absent/skeletonized inside the scope;
5. resolved content appears afterward;
6. slow database fixture does not prevent shell commit.

Critical path failures block merge.

## Security matrix

| Case                                  | Expected                                            |
| ------------------------------------- | --------------------------------------------------- |
| No/garbled API key                    | 401 JSON, no multipart/object work                  |
| Revoked/expired/unknown key           | indistinguishable 401                               |
| Valid key missing scope               | 403, no object                                      |
| Query key contains secret             | rejected everywhere before authentication/body work |
| User A requests User B detail/action  | 404 or 403 by fixed policy, no metadata             |
| Forged user id form field             | ignored                                             |
| CSRF browser upload/delete            | rejected                                            |
| HTML/SVG upload then visit CDN        | attachment/sandbox, no app cookies                  |
| MIME/extension mismatch               | classified by bytes or rejected                     |
| CRLF filename                         | safe Content-Disposition                            |
| Path traversal filename               | display-only; object key unaffected                 |
| Oversize body                         | 413 JSON, no durable object                         |
| Valid multipart body over 10 MiB      | stored intact; never cloned/truncated by Proxy      |
| Multipart field flood                 | bounded rejection                                   |
| Malformed/unsupported Range           | ignored; complete 200 representation                |
| Well-formed unsatisfiable Range       | 416, no excessive upstream read                     |
| Wrong extension for valid slug        | uniform 404                                         |
| CDN hostname tries app route          | 404, no auth/app response                           |
| App hostname tries internal CDN route | inaccessible/404 per routing policy                 |
| Arbitrary IP Host invokes readiness   | 421; no dependency fan-out                          |
| Logs after failures                   | no key/token/body/credential                        |

## Failure-injection matrix

| #   | Failure                                                 | Expected durable outcome                                             |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | MinIO unavailable before PUT                            | no DB row; 503                                                       |
| 2   | Client disconnect during upload                         | incomplete PUT aborted/removed; no READY row                         |
| 3   | DB unavailable after successful PUT                     | compensating object delete; 503                                      |
| 4   | Compensating delete also fails                          | no READY row; structured orphan record/log discoverable by CLI       |
| 5   | Variant unique race                                     | one READY variant; loser object deleted                              |
| 6   | Original deleted during GIF work                        | finalize rejected; candidate cleaned                                 |
| 7   | Delete original succeeds but DB final transaction fails | retry-safe DELETE_FAILED/tombstone; no false success                 |
| 8   | CDN DB lookup succeeds, MinIO object missing            | 404/503 fixed policy plus consistency signal; never HTML stack trace |
| 9   | PostgreSQL restored without matching object snapshot    | read-only scan reports exact mismatch set                            |
| 10  | Pod SIGTERM during upload                               | drain or compensate; no READY row pointing to partial object         |
| 11  | Browser worker OOM/crash                                | original intact; no server state                                     |
| 12  | Ingress buffers PPR                                     | external timing test fails even if local test passes                 |

## Accessibility acceptance

- axe (or equivalent) has no serious/critical violations on main states;
- full key creation and upload selection possible without pointer;
- focus is visible and restored after dialog/menu close;
- errors tied to fields; progress/status announced appropriately;
- no motion required to understand state;
- contrast checked in both themes;
- 200% zoom and 320 CSS-pixel layout remain usable.

## Performance budgets

These are targets to validate, not invented benchmark guarantees:

- no GIF/FFmpeg code in initial app route bundles;
- app-shell navigation commit is verified structurally by `instant()`;
- dashboard RSC reads execute in parallel/local Suspense regions;
- CDN responses stream rather than buffer;
- browser upload cap fits pod memory with one concurrent buffered request under
  the chosen resource limit;
- static image GIF path loads a small encoder, not FFmpeg;
- no request-per-card client data waterfall.

## Product definition of done

V1 is done when:

1. invited DavidApps user can sign in/out and no uninvited identity can create a
   Seedyn session;
2. a key can be created, revealed once, exported as `.sxcu`, used, and revoked;
3. ShareX image/file/text uploads return usable permanent CDN URLs;
4. browser file/drop/paste/URL upload behaves per the locked contract;
5. library pages and details are server-rendered, ownership safe, and instant on
   navigation by test;
6. still image and supported short video can produce a client-side GIF stored in
   MinIO and copied by URL;
7. Fumadocs HTML and Markdown/LLM docs are auth protected;
8. object/DB failure compensation and delete retry paths pass;
9. Docker runs non-root/read-only and production health checks pass;
10. approved GitOps deployment serves both origins through TLS;
11. backup/restore risks are documented and at least one object/database restore
    smoke has been performed before calling storage permanent.
