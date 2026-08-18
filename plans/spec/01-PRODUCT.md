# 01 — Product specification

Status: **implemented baseline**

## Actors

### Owner

David is the initial owner. He can use every normal feature, manage API keys,
delete uploads, read docs, and arrange future access through DavidApps.

### Invited user

An identity admitted by the Seedyn application in DavidApps. V1 treats invited
users as peers for their own data: they manage only their own keys and uploads.
No Seedyn-specific admin console or cross-user browsing is planned.

### HTTP client

An API client holding one user-created key. It can upload only the media types
covered by that key's scopes. It has no browser session and cannot read the
application or docs. ShareX is one supported HTTP client.

### Browser

An authenticated user agent. It renders Server Components, hosts the small
upload/clipboard islands, and performs all GIF transcoding locally.

### Read-only recipient

Anyone who possesses a CDN URL. They can retrieve that exact object without
signing in. They cannot browse or enumerate the library.

## Jobs to be done

1. Upload a normal file, image, video, or text item from the browser.
2. Upload from a script or desktop tool and immediately receive a pasteable URL.
3. Paste a remote media URL, ingest it, and receive a durable Seedyn URL.
4. Find a previous upload without searching MinIO or a filesystem.
5. Copy the original URL, download the original, or delete the upload.
6. Turn an existing still image or short video into a stored GIF and copy its
   `.gif` URL for Discord.
7. Create/revoke a scoped API key and optionally download a ready-to-import
   ShareX `.sxcu` file.
8. Read human and agent-friendly docs without exposing them publicly.

## Core terminology

- **Upload**: the database record representing one user-ingested source item.
- **Original**: the exact accepted bytes after filename/MIME validation; V1 does
  not recompress ordinary uploads.
- **Variant**: a stored derivative associated with an upload. V1 defines only
  `gif`.
- **Public slug**: high-entropy identifier in a CDN URL. It is not a database
  primary key and contains no user information.
- **Kind**: UI/API classification: `image`, `video`, `text`, or `file`.
- **Public-by-link**: retrieval requires no auth, but the URL is unguessable and
  no listing endpoint exists.
- **Permanent URL**: the URL has no expiry and is never a presigned MinIO URL.
  It does not mean a user can never delete the underlying object.
- **GIF conversion**: a client-side job that produces and stores a derivative.

## Primary journeys

### First use

1. Visit the app origin.
2. Redirect to the Seedyn sign-in page if no session exists.
3. Continue to DavidApps with PKCE.
4. DavidApps enforces invite policy and returns the user.
5. Auth.js creates/loads the local account and database session.
6. Recent renders its static shell immediately, then streams user totals and
   recent uploads.
7. Empty state explains local file, paste, and HTTPS URL upload paths.

### ShareX setup

1. Open API Keys.
2. Name a key, choose upload scopes, and optionally set an expiry.
3. Submit a hydrated Server Action. Before hydration, secret-creating and
   destructive controls remain disabled because Next.js 16.3 PPR encodes MPA
   action results in scripts that a no-JavaScript browser cannot consume.
4. Show the secret exactly once in a focused reveal panel.
5. Offer Copy, Download `.sxcu`, and “I saved it”.
6. Refreshing or leaving permanently removes the reveal; only prefix/metadata
   remain.
7. Import the `.sxcu` into ShareX and perform a test upload.

### Machine upload

1. A script, desktop tool, or ShareX sends one multipart file with the key.
2. Seedyn authenticates and rate/size checks before durable work.
3. The handler derives a safe kind, filename, extension, MIME, checksum, slug,
   and object key.
4. Bytes are written to MinIO.
5. Metadata is committed to PostgreSQL.
6. The canonical route returns the stable public URL in its structured response;
   compatibility routes also return the legacy `message` field.
7. The client copies or stores the parsed URL.

### Browser upload

1. User opens the upload dialog or drops/pastes a file.
2. Client shows local preview and validation before network transfer.
3. Upload route reports progress and supports cancellation.
4. On success, navigate to or refresh the upload detail/list without a full page
   reload.
5. The new row is authoritative server-rendered data.

### URL ingest

Implemented V1 behavior:

1. User pastes an `https:` URL.
2. Browser fetches it directly so remote bytes never pass through an SSRF-capable
   server fetcher.
3. A CORS failure produces an honest error with “download or drop the file”
   guidance; no silent server-proxy fallback.
4. Browser validates the received MIME/size and uploads it like a local file.

### Copy as GIF

1. Click “Copy as GIF” on an eligible upload.
2. If a ready GIF variant exists, copy immediately.
3. Otherwise load the appropriate worker, fetch the original from the CDN, and
   show conversion progress.
4. Let the user cancel before upload.
5. Upload and attach the derivative.
6. Copy its URL only after both object and metadata are durable.
7. Repeated clicks reuse the same ready derivative; concurrent attempts
   converge through a database uniqueness constraint.

### Delete

1. User opens destructive confirmation naming the item.
2. Server Action reauthenticates ownership.
3. Mark the upload `deleting`, remove variants and original from MinIO, then
   delete or tombstone metadata according to the storage protocol.
4. Report partial failure and leave a recoverable cleanup state; never claim
   success while durable bytes remain unexpectedly.
5. Previously cached public copies may remain until their declared CDN TTL.

## Information architecture

Recommended navigation:

```text
Seedyn
├── Recent
├── Images
├── Files
├── Texts
├── API Keys
└── Docs
```

Videos live under Files in the main navigation but receive their own kind and
preview/treatment. A single all-uploads search can be added to Recent without
adding another top-level page.

## V1 scope details

### Recent

- total uploads and total stored bytes;
- ten most recent uploads;
- primary upload action;
- no integration-specific onboarding in the primary library.

### Library lists

- cursor pagination driven by URL search params;
- type-specific cards/rows and accessible empty states;
- filename search and newest/oldest ordering;
- copy URL, view detail, delete;
- real skeletons during request-time reads.

### Upload detail

- safe preview for image/video/text where feasible;
- original filename, type, bytes, created time, SHA-256;
- public URL and copy state;
- GIF variant state/action for eligible kinds;
- download and delete.

### API keys

- name, prefix, scopes, created, last used, expires, status;
- one-time reveal on create;
- `.sxcu` generated only while the raw key is present, or generated client-side
  from the one-time value;
- revoke (no recovery) and create replacement; no secret reveal later.

## Deferred product ideas

The schema may leave room for variants, but the build must not add albums,
folders, tags, favorites, bulk editing, link passwords, view counters, per-item
ACLs, public profiles, reactions, comments, or server transforms.
