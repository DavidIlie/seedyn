# 06 — Storage, CDN, and browser GIF conversion

Status: **implemented baseline**

## MinIO topology

Recommended production resources:

- private bucket: `seedyn`;
- dedicated service account limited to list/get/put/delete within that bucket;
- endpoint and credentials supplied through SOPS;
- bucket versioning enabled;
- TrueNAS dataset snapshots plus an off-machine/independent backup policy if
  “permanent” is a durability claim rather than just a URL claim.

Do not reuse `zerocut` credentials. That project proves the MinIO client and
SOPS deployment pattern, not a shared security principal. Seedyn's explicit
contract is `MINIO_URL`, `MINIO_PORT`, `MINIO_SECURE`, `MINIO_KEY_ID`,
`MINIO_PASSWORD`, and `MINIO_BUCKET`.

## Object-key layout

Recommended opaque layout:

```text
users/<user-id>/uploads/<upload-id>/original.<ext>
users/<user-id>/uploads/<upload-id>/variants/gif/<variant-id>.gif
```

The public URL never exposes this key. User/upload ids are safe inside the
private bucket but filenames and emails are not.

Object metadata:

- `Content-Type` from server classification;
- safe original filename in application metadata, not relied on by MinIO;
- SHA-256 hex or base64;
- upload/variant database id;
- managed marker and schema version;
- cache control is set by the public gateway, not trusted from the uploader.

## Storage client

The existing `minio` npm client is acceptable and already proven in Seedyn and
ZeroCut. Encapsulate it behind a narrow interface:

```ts
type ObjectStore = {
  put(input: PutInput): Promise<void>;
  head(key: string): Promise<ObjectHead | null>;
  stream(key: string, range?: ByteRange): Promise<ObjectStream>;
  delete(key: string): Promise<"deleted" | "missing">;
  listManaged(prefix: string, cursor?: string): AsyncIterable<ObjectSummary>;
};
```

No route or component constructs MinIO URLs directly.

The MinIO client uses the minimum 5 MiB multipart part size rather than its
64 MiB default buffer threshold. A process-local, abort-aware FIFO limiter caps
object writes at four concurrent uploads; Redis request ceilings remain the
cross-replica abuse boundary.

## Public URL gateway

Recommended URL:

```text
https://i.dave.tips/<public-slug>.<normalized-extension>
```

On cache miss:

1. Validate hostname, slug, and extension syntax.
2. Lookup READY Upload or UploadVariant by slug and matching extension.
3. Parse `Range`, `If-None-Match`, and `If-Modified-Since` conservatively.
4. HEAD/stream the private MinIO object.
5. Return headers based on trusted database/object metadata.
6. Stream body with cancellation propagated when the client disconnects.

The gateway is a Route Handler behind a host-based `proxy.ts` rewrite. It runs
on Node, bypasses Auth.js, and imports only the read-only public storage service.

## Cache policy

The URL is content-immutable after creation: Seedyn never replaces bytes behind
an existing slug. Recommended response:

```text
Cache-Control: public, max-age=3600, s-maxage=86400, immutable
```

Browser TTL and CDN TTL are intentionally different. Origin deletion is
immediate, but recipients and compliant edge caches may retain bytes for up to
24 hours. The product states that exact caveat. A future authenticated purge
integration may make revocation faster.

That shared immutable policy is for the complete `200` representation and its
matching `HEAD`. A `206` is browser-private for one hour, includes
`no-transform`, and varies on `Range`, so an intermediary cannot store a partial
body under the complete URL's shared cache entry.

ETag should be derived from stored SHA-256 rather than MinIO's ETag, which is not
always a content hash for multipart uploads.

## Range behavior

- HEAD returns the same representation headers as GET without a body.
- `Range: bytes=start-end`, `start-`, and suffix ranges are supported for one
  range.
- Valid range returns `206`, exact `Content-Range`, and partial length.
- A well-formed but unsatisfiable range returns `416` and
  `Content-Range: bytes */<length>`.
- Unknown units, malformed byte-range syntax, and multiple ranges are ignored
  in V1 rather than building `multipart/byteranges`; the full `200` is served.
- Conditional `If-Range` support is recommended for video resume but may follow
  after core single-range tests.

## Orphan reconciliation

Because MinIO and PostgreSQL cannot share a transaction:

- upload writes use predetermined keys and compensating deletes;
- failed cleanup emits a structured `storage_orphan` log with safe key/id, but
  recovery never depends on logs being durable;
- a maintenance CLI supports dry-run and apply modes;
- it lists only managed prefixes/markers, compares them with database storage
  keys, observes a safety age (for example 24 hours), and deletes only confirmed
  orphans;
- it also detects READY rows with missing objects and reports them without
  silently deleting metadata.

This can be an operator-invoked command in the same image; no cron is required
for V1.

## Browser conversion capability matrix

| Source                                                    | Engine                                         | Output                         |
| --------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| PNG/JPEG/WebP/AVIF still                                  | `createImageBitmap` + canvas + `gifenc` worker | one-frame GIF                  |
| Existing GIF                                              | no conversion; optionally attach/copy as GIF   | original or stored association |
| Animated GIF/APNG/WebP                                    | `ffmpeg.wasm` worker                           | normalized animated GIF        |
| Short MP4/WebM/MOV-like video supported by bundled codecs | `ffmpeg.wasm` worker                           | animated GIF                   |
| Arbitrary file/text/audio                                 | ineligible                                     | clear disabled reason          |

Codec support must be verified against the exact `@ffmpeg/core` build. Do not
promise every container/codec merely because desktop FFmpeg supports it.

## Worker architecture

```text
Client conversion controller
  -> chooses still or ffmpeg worker
  -> sends source ArrayBuffer/transferable + bounded options
  -> receives progress / preview metadata / output ArrayBuffer
  -> terminates worker on cancel or completion
  -> uploads output Blob
```

Rules:

- conversion modules are absent from the initial dashboard bundle;
- load the FFmpeg core only after explicit user intent and show its roughly
  31 MB engine download;
- self-host JS/WASM/worker assets so CSP, version, and availability are under
  Seedyn's control;
- use single-thread core in V1 to avoid SharedArrayBuffer and cross-origin
  isolation coupling;
- terminate and release object URLs/buffers after use;
- never store working files in IndexedDB/localStorage by default;
- progress is best-effort and must not fake precision.

## GIF output policy

Implemented V1 output policy:

- video uploads use the generic 64 MiB source cap;
- video conversion uses the first 10 seconds (V1 has no trimming UI);
- maximum output dimensions: 640 × 640 preserving aspect ratio;
- default frame rate: 15 fps;
- infinite loop;
- palette generation/use for video quality;
- 25 MiB maximum encoded output;
- preserve transparency for still sources with the GIF one-bit alpha caveat;
- original remains untouched.

The UI estimates that GIF can be much larger than source video and reports final
size before uploading.

## Conversion command intent

For video, the implementation should use the equivalent of a two-pass palette
filter (`fps`, bounded Lanczos scale, `palettegen`, `paletteuse`) rather than a
naive direct GIF encode. The exact FFmpeg filter string belongs in tested code,
not the product contract, because bundled codec/filter availability must be
verified.

## Failure behavior

- CDN fetch failed: keep original, offer retry.
- Unsupported browser/codec: explain and leave original usable.
- Worker crash/out-of-memory: terminate, release memory, no server state.
- Output too large: offer shorter duration/lower dimensions/fps; do not upload.
- Upload fails after conversion: preserve output in memory long enough for a
  deliberate Retry, then release on navigation/cancel.
- Variant race: server returns existing winner; client copies winner URL.
- Original deleted during conversion: variant finalize returns 404 and deletes
  candidate object through compensation.
