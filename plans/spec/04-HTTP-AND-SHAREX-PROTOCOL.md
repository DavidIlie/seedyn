# 04 — HTTP and ShareX protocol

Status: **implemented baseline**

## Authentication

Machine upload endpoints accept:

```http
Authorization: Bearer sdn_live_...
```

For compatibility with the old server, aliases also accept the raw key in
`Authorization`, but the generated `.sxcu` always uses Bearer. Query-string
keys are rejected: ingress, Cloudflare, browser history, referrers, and
observability may capture a URL before application redaction. Browser session
cookies are not accepted as API-key authentication on the canonical ShareX
endpoint; the browser uploader has its own session-authenticated route.

## Canonical endpoint

```http
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <key>

file=<binary>
```

Optional form fields:

- `kind`: `auto | image | file | text`; default `auto`.
- `filename`: only if the client cannot supply a multipart filename. It is
  sanitized and never becomes an object key.

Success (`201`):

```json
{
  "id": "upload-id",
  "kind": "image",
  "url": "https://i.dave.tips/unguessable.png",
  "message": "https://i.dave.tips/unguessable.png"
}
```

`message` is intentionally the same URL for compatibility with the previous
ShareX config. `url` is the canonical new field.

## Compatibility aliases

| Endpoint           | Multipart field | Required scope | Forced/expected kind                   |
| ------------------ | --------------- | -------------- | -------------------------------------- |
| `POST /api/images` | `image`         | `upload:image` | image MIME required                    |
| `POST /api/files`  | `file`          | `upload:file`  | any accepted non-text, including video |
| `POST /api/texts`  | `text`          | `upload:text`  | accepted text MIME/extension           |

All aliases call the same service and have no independent validation or storage
behavior. On success they adapt the canonical result to the exact legacy wire
shape and status:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"message":"https://i.dave.tips/unguessable.png"}
```

The endpoint name does not override server-classified bytes. An image-only key
cannot upload arbitrary bytes through `/api/images`, fixing a legacy scope
bypass.

## Browser upload endpoint

```http
POST /api/uploads
Cookie: Auth.js database session
Content-Type: multipart/form-data

file=<binary>
```

This route exists because Server Actions do not expose reliable upload-progress
events. The browser island sends via an API supporting progress/cancel and then
refreshes/navigates to server-rendered state.

## GIF derivative endpoint

```http
POST /api/uploads/:id/gif
Cookie: Auth.js database session
Content-Type: multipart/form-data

file=<image/gif>
```

The server does not trust the extension or client claim. It checks GIF magic,
dimensions/frame/duration constraints where feasible, byte cap, ownership, and
the uniqueness rule. Success returns the stored variant and canonical URL.

## Public CDN contract

```http
GET  https://i.dave.tips/:slug.:ext
HEAD https://i.dave.tips/:slug.:ext
OPTIONS https://i.dave.tips/:slug.:ext
```

Required behavior:

- GET/HEAD map only a validated slug+extension to a READY original/variant.
- Stream from MinIO; do not buffer the full response.
- Honor a single valid byte range for video/download resumption. Ignore unknown
  units, malformed syntax, and multipart ranges by serving the complete `200`
  representation; reserve `416` for a well-formed but unsatisfiable byte range.
- Return `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`,
  `Accept-Ranges`, and a safe `Content-Disposition`.
- `Access-Control-Allow-Origin: *` so Seedyn's browser worker can fetch its own
  CDN origin and users can embed images.
- `Cross-Origin-Resource-Policy: cross-origin`, `X-Content-Type-Options:
nosniff`, and a restrictive CSP for anything browser-renderable.
- Unknown, deleting, deleted, or extension-mismatched items return a uniform
  cacheable 404 without revealing which condition occurred.

## Error envelope

```json
{
  "error": {
    "code": "payload_too_large",
    "message": "The upload exceeds the 64 MiB limit.",
    "requestId": "req_..."
  }
}
```

| Status | Code examples                                                           |
| ------ | ----------------------------------------------------------------------- |
| 400    | `invalid_input`, `missing_file`, `unsupported_media`                    |
| 401    | `invalid_api_key`, `unauthenticated`                                    |
| 403    | `missing_scope`, `forbidden`                                            |
| 404    | `not_found`                                                             |
| 409    | `conflict`, `variant_exists`                                            |
| 413    | `payload_too_large`                                                     |
| 415    | `unsupported_media`                                                     |
| 429    | `rate_limited` with `Retry-After`                                       |
| 500    | `internal` with safe message/request id                                 |
| 503    | `storage_unavailable`, `database_unavailable`, `rate_limit_unavailable` |

Legacy aliases still use the envelope on failure. Never return an HTML Next.js
error page to ShareX.

## Limits

Implemented V1 limits:

- canonical/browser original upload: 64 MiB;
- image/text: 16 MiB;
- GIF derivative output: 25 MiB;
- filename: 255 UTF-8 bytes after normalization;
- authenticate and rate-limit before reading the body;
- one multipart file and a small bounded field set, enforced by a vetted
  streaming parser with actual-byte, field, timeout, abort, and cancellation
  limits;
- request timeout long enough for home uplink but finite;
- application and ingress enforce the same maximum, with ingress slightly above
  the app cap so the app can return its JSON error.

## Type classification

Use magic-byte detection for known image/video formats, then vetted MIME and
normalized extension allowlists. Client-supplied MIME is a hint. Text is accepted
only when its bytes satisfy the size/encoding policy. Unknown bytes are `file`,
not rejected, unless the forced endpoint requires a narrower type.

SVG, HTML, and executable/script-like files may be stored as generic files but
are served as attachment with `nosniff`; they are never inserted inline into the
authenticated origin.

## Generated `.sxcu`

Generated while the raw key is still in memory:

```json
{
  "Version": "17.0.0",
  "Name": "Seedyn",
  "DestinationType": "ImageUploader, FileUploader, TextUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://seedyn.dave.tips/api/upload",
  "Headers": {
    "Authorization": "Bearer <one-time-key>",
    "Accept": "application/json"
  },
  "Body": "MultipartFormData",
  "FileFormName": "file",
  "URL": "{json:url}",
  "ErrorMessage": "{json:error.message}"
}
```

This matches the current official ShareX custom-uploader schema. The key-bearing
file is a secret; the UI says so before download.

## Idempotency

V1 does not silently deduplicate uploads by checksum: taking the same screenshot
twice creates two stable URLs. A future optional `Idempotency-Key` can prevent
client retries from duplicating writes, but it is not required until ShareX retry
behavior demonstrates a need. Storage compensation still prevents half-created
records.
