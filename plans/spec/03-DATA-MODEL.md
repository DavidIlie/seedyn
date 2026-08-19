# 03 — Data model and lifecycle

Status: **implemented baseline**

## Identity tables

Use the Auth.js Prisma schema for `User`, `Account`, `Session`, and
`VerificationToken`, with database sessions.

Important invariants:

- `Account(provider, providerAccountId)` is unique.
- `provider = "davidapps"` and `providerAccountId` is the pairwise OIDC `sub`.
- Never locate or merge an account by email after sign-in.
- A User deletion cascades sessions/accounts but must not silently orphan upload
  objects; user deletion is out of V1 unless a complete object lifecycle exists.

## Proposed Prisma domain schema

Field names may change for Prisma conventions; meanings and constraints are the
contract.

```prisma
enum UploadKind {
  IMAGE
  VIDEO
  TEXT
  FILE
}

enum UploadState {
  READY
  DELETING
  DELETE_FAILED
}

enum VariantKind {
  GIF
}

enum VariantState {
  READY
  DELETING
  DELETE_FAILED
}

model ApiKey {
  id         String   @id
  userId     String
  name       String
  prefix     String
  secretHash Bytes    @unique
  scopes     String[]
  createdAt  DateTime @default(now())
  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
  @@index([userId, revokedAt])
}

model Upload {
  id             String      @id
  userId         String
  publicSlug     String      @unique
  kind           UploadKind
  state          UploadState @default(READY)
  originalName   String
  passwordHash   String?
  passwordVersion Int       @default(0)
  extension      String
  contentType    String
  byteSize       BigInt
  sha256         Bytes
  storageKey     String      @unique
  width          Int?
  height         Int?
  durationMs     Int?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deleteErrorAt  DateTime?

  user     User            @relation(fields: [userId], references: [id], onDelete: Restrict)
  variants UploadVariant[]

  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([userId, kind, createdAt(sort: Desc), id(sort: Desc)])
}

model UploadVariant {
  id          String       @id
  uploadId    String
  publicSlug  String       @unique
  kind        VariantKind
  state       VariantState @default(READY)
  extension   String
  contentType String
  byteSize    BigInt
  sha256      Bytes
  storageKey  String       @unique
  width       Int?
  height      Int?
  durationMs  Int?
  createdAt   DateTime     @default(now())
  deleteErrorAt DateTime?

  upload Upload @relation(fields: [uploadId], references: [id], onDelete: Restrict)

  @@unique([uploadId, kind])
}

model StorageReservation {
  id         String @id
  userId     String
  storageKey String @unique
  byteSize   BigInt
  kind       StorageReservationKind
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`passwordHash` is an Argon2id PHC string and never leaves server-only code.
`passwordVersion` increments on every set/change/remove operation and is bound
into short-lived signed media grants. GIF variants inherit their parent
upload's password boundary rather than storing a second credential.

`User.storageUsedBytes` and `User.storageReservedBytes` are non-negative
materialized counters. `User.storageLimitBytes = null` means the 5 GB member
default; administrators are unlimited regardless of the override field.

## API-key format

Recommended plaintext shape:

```text
sdn_live_<8-character-public-prefix>_<32-random-byte-base64url-secret>
```

- Generate with `node:crypto`, never `Math.random`.
- Store the displayed prefix and `SHA-256(full plaintext key)` only. The key has
  enough entropy that a fast hash is safe; no password KDF is needed.
- Hash the full candidate and use the unique digest for indexed lookup. Prefix
  is display-only; authentication never scans prefix candidates.
- Show raw key once. Logs redact the format anywhere it appears.
- Suggested scopes: `upload:image`, `upload:file`, `upload:text`. `upload:file`
  covers video unless David chooses a distinct video permission.
- Expiry is optional; revocation is immediate.

## Slug format

- URL-safe, case-sensitive random identifier with at least 128 bits of entropy.
- No sequential ids, filenames, email, user id, checksum, timestamp, or media
  kind in the public identifier.
- Extension is normalized separately and checked against the database row;
  requesting the right slug with the wrong extension is a 404, not a redirect.

## Cursor pagination

Lists order by `(createdAt DESC, id DESC)`. Cursor encodes both fields and is
validated/signed or treated as an opaque base64url structure. Default page size
24, maximum 100. Search uses a bounded normalized filename query and does not
change the ownership predicate.

## Upload create lifecycle

```text
validate/authenticate
  -> derive application-generated immutable identifiers and metadata
  -> lock the User row and reserve exact bytes before object storage
  -> PUT object to predetermined MinIO key
  -> INSERT READY database row and move reserved bytes to used bytes atomically
       success: return canonical URL
       conflict/DB failure: delete predetermined object
                           release reservation
                           if cleanup fails, log orphan record for reconciliation
```

An `Upload` row is never visible as READY before its object exists.

## GIF variant lifecycle

```text
validate session + upload ownership + eligibility
  -> reject if READY GIF already exists (return it)
  -> reserve exact GIF bytes under the same account quota
  -> PUT candidate to predetermined unique object key
  -> INSERT READY variant and commit reservation under unique(uploadId, GIF)
       success: return URL
       unique race: delete candidate and return winner
       DB failure: delete candidate; record cleanup failure if needed
```

V1 does not keep a durable `PROCESSING` state because conversion occurs in the
browser before the server receives a candidate.

## Delete lifecycle

1. Transactionally change READY rows to DELETING after ownership check.
2. Delete variants from MinIO, then original.
3. Delete database rows in a transaction only when object deletes succeed or
   return idempotent not-found; decrement used storage in that same transaction.
4. On failure, mark `DELETE_FAILED`, store only a bounded safe error category and
   timestamp, and expose Retry in the authenticated UI.
5. A maintenance command can list/retry failed deletes and discover orphan
   objects by expected-key prefix.

## Size arithmetic

Database byte sizes are `BigInt`. UI and JSON contracts serialize them as
decimal strings or bounded numbers only after checking safe range. Aggregate
sums use database bigint/numeric, never JavaScript number accumulation over an
unbounded library.

Quota enforcement uses durable reservations and a locked user row, so concurrent
browser, API, ShareX, and GIF writes cannot each pass an aggregate check and
collectively exceed the limit. Originals and GIF variants both count. A member
already above a newly lowered limit keeps existing objects but cannot add more.

## Data not stored

- Raw API keys, ID/access tokens, MinIO credentials, or presigned URLs.
- Arbitrary EXIF/GPS metadata extracted into searchable columns.
- Uploaded text bodies in PostgreSQL.
- Browser conversion working files or logs.
- Recipient/view analytics in V1.
