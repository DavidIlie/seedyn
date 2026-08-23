import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";

import { type DirectUploadSession, type Prisma } from "@prisma/client";

import { env } from "~/env";
import {
  normalizeCustomPublicSlug,
  customPublicSlugError,
} from "~/lib/public-slug";
import { db } from "~/server/db";
import {
  publicMediaUrl,
  validMediaOrigin,
} from "~/server/media/origin-preferences";
import {
  isMissingMultipartUpload,
  multipartStorage,
  type MultipartStorage,
} from "~/server/storage/multipart-client";
import { originalObjectKey } from "~/server/storage/keys";
import { objectStore } from "~/server/storage/minio";
import {
  matchesManagedMetadata,
  type ObjectStore,
} from "~/server/storage/object-store";
import {
  finalizeStorageReservation,
  releaseStorageReservationInTransaction,
  reserveStorageInTransaction,
} from "~/server/storage/quota";
import {
  isRenderedHtmlClassification,
  sanitizeOriginalName,
} from "~/server/uploads/classification";
import { DomainError } from "~/server/uploads/errors";
import { createPublicSlug, createRecordId } from "~/server/uploads/identifiers";
import { serializeUpload } from "~/server/uploads/serialization";
import {
  assertPublicSlugAvailable,
  lockPublicSlug,
  serializableUploadTransaction,
} from "~/server/uploads/service";

import {
  classifyDirectUploadPrefix,
  DIRECT_UPLOAD_HARD_LIFETIME_MS,
  DIRECT_UPLOAD_IDLE_MS,
  DIRECT_UPLOAD_LEASE_MS,
  DIRECT_UPLOAD_PRESIGN_SECONDS,
  directUploadPlan,
  expectedDirectUploadPartBytes,
  isSha256Hex,
  validateDirectPartNumbers,
  validateObservedUploadParts,
  type DirectUploadClassification,
  type ObservedUploadPart,
} from "./plan";

type DirectUploadDependencies = {
  multipart?: MultipartStorage;
  objects?: ObjectStore;
  now?: () => Date;
};

/**
 * The same envelope `/api/uploads` returns, so the browser reads one shape
 * whichever transport carried the bytes. `publicSlug` and `mediaOrigin` are
 * part of it because the upload dialog offers both after the transfer.
 */
export type DirectUploadRecord = {
  id: string;
  kind: string;
  contentType: string;
  extension: string;
  url: string;
  rendered: boolean;
  publicSlug: string;
  mediaOrigin: string | null;
};

export type DirectUploadStatus =
  | {
      state: "creating" | "uploading";
      uploadedBytes: number;
      uploadedParts: number[];
      expiresAt: string;
    }
  | { state: "verifying"; uploadedBytes: number; uploadedParts: number[] }
  | { state: "published"; record: DirectUploadRecord }
  | { state: "aborting" | "aborted" | "failed"; failureCode?: string };

function injected(value?: DirectUploadDependencies) {
  return {
    multipart: value?.multipart ?? multipartStorage,
    objects: value?.objects ?? objectStore,
    now: value?.now ?? (() => new Date()),
  };
}

function publishedRecord(upload: {
  id: string;
  kind: string;
  contentType: string;
  disposition: string;
  extension: string;
  publicSlug: string;
  mediaOrigin: string | null;
}): DirectUploadRecord {
  return {
    id: upload.id,
    kind: upload.kind.toLowerCase(),
    contentType: upload.contentType,
    extension: upload.extension,
    url: publicMediaUrl(upload),
    rendered: isRenderedHtmlClassification(upload),
    publicSlug: upload.publicSlug,
    mediaOrigin: upload.mediaOrigin,
  };
}

function directSessionMetadata(
  session: Pick<DirectUploadSession, "uploadId" | "declaredSha256">,
) {
  return {
    recordId: session.uploadId,
    kind: "original" as const,
    sha256: Buffer.from(session.declaredSha256).toString("hex"),
  };
}

function expiresWithin(now: Date, hardExpiresAt: Date): Date {
  return new Date(
    Math.min(now.getTime() + DIRECT_UPLOAD_IDLE_MS, hardExpiresAt.getTime()),
  );
}

function manifestJson(
  parts: ReadonlyArray<ObservedUploadPart>,
): Prisma.JsonArray {
  return parts.map((part) => ({
    partNumber: part.partNumber,
    byteSize: part.byteSize,
    eTag: part.eTag,
  }));
}

async function markCreationFailed(input: {
  sessionId: string;
  userId: string;
  failureCode: string;
}): Promise<void> {
  await serializableUploadTransaction(async (transaction) => {
    await releaseStorageReservationInTransaction(transaction, {
      id: input.sessionId,
      userId: input.userId,
    });
    await transaction.directUploadSession.updateMany({
      where: { id: input.sessionId, userId: input.userId },
      data: {
        state: "FAILED",
        failureCode: input.failureCode,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });
}

export async function createDirectUploadSession(
  input: {
    userId: string;
    originalName: string;
    byteSize: number;
    sha256Hex: string;
    sniffPrefix: Uint8Array;
    publicSlug?: string;
    mediaOrigin: string;
  },
  dependencies?: DirectUploadDependencies,
) {
  const { multipart, now } = injected(dependencies);
  if (!validMediaOrigin(input.mediaOrigin)) {
    throw new DomainError("invalid_input", {
      message: "Choose a configured media domain.",
    });
  }
  if (!isSha256Hex(input.sha256Hex)) {
    throw new DomainError("invalid_input", {
      message: "The prepared file digest is invalid.",
    });
  }
  const plan = directUploadPlan(input.byteSize, env.DIRECT_UPLOAD_MAX_BYTES);
  const classification = await classifyDirectUploadPrefix(input.sniffPrefix);
  const uploadId = createRecordId();
  const sessionId = createRecordId();
  const requestedSlug = input.publicSlug?.trim()
    ? normalizeCustomPublicSlug(input.publicSlug)
    : null;
  const slugError = requestedSlug ? customPublicSlugError(requestedSlug) : null;
  if (slugError) {
    throw new DomainError("invalid_input", { message: slugError });
  }
  const publicSlug = requestedSlug ?? createPublicSlug();
  const storageKey = originalObjectKey({
    userId: input.userId,
    uploadId,
    extension: classification.extension,
  });
  const createdAt = now();
  const hardExpiresAt = new Date(
    createdAt.getTime() + DIRECT_UPLOAD_HARD_LIFETIME_MS,
  );
  const expiresAt = expiresWithin(createdAt, hardExpiresAt);

  await serializableUploadTransaction(async (transaction) => {
    await lockPublicSlug(transaction, publicSlug);
    await assertPublicSlugAvailable(transaction, publicSlug);
    await reserveStorageInTransaction(transaction, {
      id: sessionId,
      userId: input.userId,
      storageKey,
      byteSize: input.byteSize,
      kind: "ORIGINAL",
      expiresAt,
    });
    await transaction.directUploadSession.create({
      data: {
        id: sessionId,
        userId: input.userId,
        uploadId,
        state: "CREATING",
        storageKey,
        declaredBytes: BigInt(input.byteSize),
        declaredSha256: Buffer.from(input.sha256Hex, "hex"),
        sniffPrefix: Buffer.from(input.sniffPrefix),
        partSize: plan.partSize,
        partCount: plan.partCount,
        kind: classification.kind,
        extension: classification.extension,
        contentType: classification.contentType,
        disposition: classification.disposition,
        originalName: sanitizeOriginalName(input.originalName || "upload"),
        publicSlug,
        mediaOrigin: input.mediaOrigin,
        expiresAt,
        hardExpiresAt,
      },
    });
  });

  let s3UploadId: string;
  try {
    s3UploadId = await multipart.create({
      key: storageKey,
      contentType: "application/octet-stream",
      metadata: {
        recordId: uploadId,
        kind: "original",
        sha256: input.sha256Hex,
      },
    });
  } catch (error) {
    await markCreationFailed({
      sessionId,
      userId: input.userId,
      failureCode: "storage_create_failed",
    }).catch(() => undefined);
    throw new DomainError("storage_unavailable", { cause: error });
  }

  try {
    const updated = await db.directUploadSession.updateMany({
      where: { id: sessionId, userId: input.userId, state: "CREATING" },
      data: { state: "UPLOADING", s3UploadId },
    });
    if (updated.count !== 1)
      throw new Error("Direct upload session was not activated");
  } catch (error) {
    await multipart
      .abort({ key: storageKey, uploadId: s3UploadId })
      .catch(() => undefined);
    await markCreationFailed({
      sessionId,
      userId: input.userId,
      failureCode: "session_activation_failed",
    }).catch(() => undefined);
    throw new DomainError("database_unavailable", { cause: error });
  }

  return {
    sessionId,
    partSize: plan.partSize,
    partCount: plan.partCount,
    expiresAt: expiresAt.toISOString(),
  };
}

async function touchUploadingSession(input: {
  sessionId: string;
  userId: string;
  now: Date;
}): Promise<DirectUploadSession> {
  return serializableUploadTransaction(async (transaction) => {
    const session = await transaction.directUploadSession.findFirst({
      where: { id: input.sessionId, userId: input.userId },
    });
    if (!session) throw new DomainError("not_found");
    if (
      session.state !== "UPLOADING" ||
      !session.s3UploadId ||
      session.expiresAt <= input.now ||
      session.hardExpiresAt <= input.now
    ) {
      throw new DomainError("conflict", {
        message: "This direct upload is no longer accepting parts.",
      });
    }
    const expiresAt = expiresWithin(input.now, session.hardExpiresAt);
    await transaction.directUploadSession.update({
      where: { id: session.id },
      data: { expiresAt },
    });
    await transaction.storageReservation.updateMany({
      where: { id: session.id, userId: input.userId },
      data: { expiresAt },
    });
    return { ...session, expiresAt };
  });
}

export async function signDirectUploadParts(
  input: { sessionId: string; userId: string; partNumbers: number[] },
  dependencies?: DirectUploadDependencies,
) {
  const { multipart, now } = injected(dependencies);
  const session = await touchUploadingSession({ ...input, now: now() });
  const partNumbers = validateDirectPartNumbers(
    input.partNumbers,
    session.partCount,
  );
  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url:
        env.DIRECT_UPLOAD_TRANSPORT === "proxy"
          ? `/api/uploads/direct/${session.id}/parts/${partNumber}`
          : await multipart.signPart({
              key: session.storageKey,
              uploadId: session.s3UploadId!,
              partNumber,
              expiresInSeconds: DIRECT_UPLOAD_PRESIGN_SECONDS,
            }),
    })),
  );
  return {
    transport: env.DIRECT_UPLOAD_TRANSPORT,
    parts: urls,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function ingestDirectUploadPart(
  input: {
    sessionId: string;
    userId: string;
    partNumber: number;
    contentLength: number;
    body: Readable;
    signal?: AbortSignal;
  },
  dependencies?: DirectUploadDependencies,
): Promise<string> {
  if (env.DIRECT_UPLOAD_TRANSPORT !== "proxy") {
    throw new DomainError("not_found");
  }
  const { multipart, now } = injected(dependencies);
  const session = await touchUploadingSession({
    sessionId: input.sessionId,
    userId: input.userId,
    now: now(),
  });
  const expectedBytes = expectedDirectUploadPartBytes({
    byteSize: Number(session.declaredBytes),
    partSize: session.partSize,
    partCount: session.partCount,
    partNumber: input.partNumber,
  });
  if (input.contentLength !== expectedBytes) {
    throw new DomainError("invalid_input", {
      message: "The upload part length is invalid.",
    });
  }
  let received = 0;
  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > expectedBytes) {
        callback(new DomainError("payload_too_large"));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(
        received === expectedBytes
          ? undefined
          : new DomainError("invalid_input", {
              message: "The upload part was truncated.",
            }),
      );
    },
  });
  const abort = () => input.body.destroy(new DomainError("request_aborted"));
  input.signal?.addEventListener("abort", abort, { once: true });
  input.body.pipe(inspector);
  try {
    return await multipart.uploadPart({
      key: session.storageKey,
      uploadId: session.s3UploadId!,
      partNumber: input.partNumber,
      byteSize: expectedBytes,
      body: inspector,
    });
  } catch (error) {
    if (input.signal?.aborted) throw new DomainError("request_aborted");
    throw error instanceof DomainError
      ? error
      : new DomainError("storage_unavailable", { cause: error });
  } finally {
    input.signal?.removeEventListener("abort", abort);
    if (!input.body.destroyed) input.body.destroy();
    if (!inspector.destroyed) inspector.destroy();
  }
}

async function readPublishedUpload(
  session: Pick<
    DirectUploadSession,
    "publishedUploadId" | "uploadId" | "userId"
  >,
) {
  return db.upload.findFirst({
    where: {
      id: session.publishedUploadId ?? session.uploadId,
      userId: session.userId,
    },
    select: {
      id: true,
      kind: true,
      contentType: true,
      disposition: true,
      extension: true,
      publicSlug: true,
      mediaOrigin: true,
    },
  });
}

export async function readDirectUploadStatus(
  input: { sessionId: string; userId: string },
  dependencies?: DirectUploadDependencies,
): Promise<DirectUploadStatus> {
  const { multipart } = injected(dependencies);
  const session = await db.directUploadSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
  });
  if (!session) throw new DomainError("not_found");
  if (session.state === "PUBLISHED") {
    const upload = await readPublishedUpload(session);
    if (!upload) throw new DomainError("database_unavailable");
    return { state: "published", record: publishedRecord(upload) };
  }
  if (session.state === "CREATING") {
    return {
      state: "creating",
      uploadedBytes: 0,
      uploadedParts: [],
      expiresAt: session.expiresAt.toISOString(),
    };
  }
  if (session.state === "UPLOADING") {
    if (!session.s3UploadId) throw new DomainError("storage_unavailable");
    const parts = await multipart.listParts({
      key: session.storageKey,
      uploadId: session.s3UploadId,
    });
    return {
      state: "uploading",
      uploadedBytes: parts.reduce((total, part) => total + part.byteSize, 0),
      uploadedParts: parts.map((part) => part.partNumber),
      expiresAt: session.expiresAt.toISOString(),
    };
  }
  if (session.state === "VERIFYING") {
    return {
      state: "verifying",
      uploadedBytes: Number(session.declaredBytes),
      uploadedParts: Array.from(
        { length: session.partCount },
        (_, index) => index + 1,
      ),
    };
  }
  return {
    state: session.state.toLowerCase() as "aborting" | "aborted" | "failed",
    ...(session.failureCode ? { failureCode: session.failureCode } : {}),
  };
}

async function readPrefix(
  objects: ObjectStore,
  session: Pick<DirectUploadSession, "storageKey" | "sniffPrefix">,
): Promise<Buffer> {
  const expectedBytes = Buffer.from(session.sniffPrefix).byteLength;
  const stream = await objects.stream(session.storageKey, {
    start: 0,
    end: expectedBytes - 1,
    length: expectedBytes,
  });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk as Uint8Array);
    total += bytes.byteLength;
    if (total > expectedBytes) {
      stream.destroy();
      throw new DomainError("integrity_mismatch");
    }
    chunks.push(bytes);
  }
  if (total !== expectedBytes) throw new DomainError("integrity_mismatch");
  return Buffer.concat(chunks, total);
}

function sameClassification(
  session: Pick<
    DirectUploadSession,
    "kind" | "extension" | "contentType" | "disposition"
  >,
  classification: DirectUploadClassification,
): boolean {
  return (
    session.kind === classification.kind &&
    session.extension === classification.extension &&
    session.contentType === classification.contentType &&
    session.disposition === classification.disposition
  );
}

async function renewLease(input: {
  sessionId: string;
  userId: string;
  leaseOwner: string;
  now: Date;
}): Promise<void> {
  const renewed = await db.directUploadSession.updateMany({
    where: {
      id: input.sessionId,
      userId: input.userId,
      state: "VERIFYING",
      leaseOwner: input.leaseOwner,
    },
    data: {
      leaseExpiresAt: new Date(input.now.getTime() + DIRECT_UPLOAD_LEASE_MS),
    },
  });
  if (renewed.count !== 1) {
    throw new DomainError("conflict", {
      message: "Another request took over upload verification.",
    });
  }
}

async function verifyStoredBytes(input: {
  session: DirectUploadSession;
  objects: ObjectStore;
  leaseOwner: string;
  now: () => Date;
}): Promise<string> {
  const stream = await input.objects.stream(input.session.storageKey);
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteSize = 0;
  let strictText = true;
  let lastLeaseRenewal = input.now().getTime();

  for await (const rawChunk of stream) {
    const chunk = Buffer.from(rawChunk as Uint8Array);
    byteSize += chunk.byteLength;
    if (byteSize > Number(input.session.declaredBytes)) {
      stream.destroy();
      throw new DomainError("integrity_mismatch");
    }
    hash.update(chunk);
    if (strictText) {
      try {
        const decoded = decoder.decode(chunk, { stream: true });
        for (const character of decoded) {
          const code = character.codePointAt(0)!;
          if (
            code === 0 ||
            (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
            (code >= 0x7f && code <= 0x9f)
          ) {
            strictText = false;
            break;
          }
        }
      } catch {
        strictText = false;
      }
    }
    const current = input.now();
    if (current.getTime() - lastLeaseRenewal >= 30_000) {
      await renewLease({
        sessionId: input.session.id,
        userId: input.session.userId,
        leaseOwner: input.leaseOwner,
        now: current,
      });
      lastLeaseRenewal = current.getTime();
    }
  }
  if (strictText) {
    try {
      decoder.decode();
    } catch {
      strictText = false;
    }
  }
  if (byteSize !== Number(input.session.declaredBytes)) {
    throw new DomainError("integrity_mismatch");
  }
  if (strictText) {
    throw new DomainError("payload_too_large", {
      message: "Text uploads remain limited to 16 MiB.",
    });
  }
  return hash.digest("hex");
}

async function clearVerificationLease(input: {
  sessionId: string;
  userId: string;
  leaseOwner: string;
  returnToUploading?: boolean;
}): Promise<void> {
  await db.directUploadSession.updateMany({
    where: {
      id: input.sessionId,
      userId: input.userId,
      state: "VERIFYING",
      leaseOwner: input.leaseOwner,
    },
    data: {
      ...(input.returnToUploading ? { state: "UPLOADING" as const } : {}),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

async function publishVerifiedSession(input: {
  session: DirectUploadSession;
  leaseOwner: string;
  sha256Hex: string;
}) {
  return serializableUploadTransaction(async (transaction) => {
    const current = await transaction.directUploadSession.findFirst({
      where: {
        id: input.session.id,
        userId: input.session.userId,
        state: "VERIFYING",
        leaseOwner: input.leaseOwner,
      },
    });
    if (!current) throw new DomainError("conflict");
    const existing = await transaction.upload.findUnique({
      where: { id: current.uploadId },
      include: { variants: true },
    });
    if (existing) {
      await transaction.directUploadSession.update({
        where: { id: current.id },
        data: {
          state: "PUBLISHED",
          publishedUploadId: existing.id,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return existing;
    }

    await lockPublicSlug(transaction, current.publicSlug);
    await assertPublicSlugAvailable(
      transaction,
      current.publicSlug,
      current.uploadId,
    );
    const created = await transaction.upload.create({
      data: {
        id: current.uploadId,
        userId: current.userId,
        publicSlug: current.publicSlug,
        kind: current.kind,
        state: "READY",
        originalName: current.originalName,
        textLanguage: null,
        origin: "BROWSER",
        mediaOrigin: current.mediaOrigin,
        extension: current.extension,
        contentType: current.contentType,
        disposition: current.disposition,
        byteSize: current.declaredBytes,
        sha256: Buffer.from(input.sha256Hex, "hex"),
        storageKey: current.storageKey,
      },
      include: { variants: true },
    });
    await finalizeStorageReservation(transaction, {
      id: current.id,
      userId: current.userId,
    });
    await transaction.directUploadSession.update({
      where: { id: current.id },
      data: {
        state: "PUBLISHED",
        publishedUploadId: created.id,
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: null,
      },
    });
    return created;
  });
}

async function cleanupSession(input: {
  session: DirectUploadSession;
  finalState: "ABORTED" | "FAILED";
  failureCode?: string;
  multipart: MultipartStorage;
  objects: ObjectStore;
}): Promise<void> {
  if (input.session.s3UploadId) {
    await input.multipart.abort({
      key: input.session.storageKey,
      uploadId: input.session.s3UploadId,
    });
  }
  await input.objects.delete(input.session.storageKey);
  await serializableUploadTransaction(async (transaction) => {
    await releaseStorageReservationInTransaction(transaction, {
      id: input.session.id,
      userId: input.session.userId,
    });
    await transaction.directUploadSession.update({
      where: { id: input.session.id },
      data: {
        state: input.finalState,
        failureCode: input.failureCode ?? null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  });
}

function permanentVerificationFailure(error: unknown): boolean {
  return (
    error instanceof DomainError &&
    [
      "integrity_mismatch",
      "invalid_input",
      "payload_too_large",
      "unsupported_media",
    ].includes(error.code)
  );
}

export async function completeDirectUpload(
  input: { sessionId: string; userId: string },
  dependencies?: DirectUploadDependencies,
): Promise<
  { state: "verifying" } | { state: "published"; record: DirectUploadRecord }
> {
  const { multipart, objects, now } = injected(dependencies);
  const initial = await db.directUploadSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
  });
  if (!initial) throw new DomainError("not_found");
  if (initial.state === "PUBLISHED") {
    const upload = await readPublishedUpload(initial);
    if (!upload) throw new DomainError("database_unavailable");
    return { state: "published", record: publishedRecord(upload) };
  }
  if (initial.state !== "UPLOADING" && initial.state !== "VERIFYING") {
    throw new DomainError("conflict", {
      message: "This direct upload cannot be completed.",
    });
  }

  const leaseOwner = randomUUID();
  const claimedAt = now();
  const claimed = await db.directUploadSession.updateMany({
    where: {
      id: initial.id,
      userId: input.userId,
      OR: [
        { state: "UPLOADING" },
        {
          state: "VERIFYING",
          OR: [
            { leaseOwner: null },
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: claimedAt } },
          ],
        },
      ],
    },
    data: {
      state: "VERIFYING",
      leaseOwner,
      leaseExpiresAt: new Date(claimedAt.getTime() + DIRECT_UPLOAD_LEASE_MS),
    },
  });
  if (claimed.count !== 1) return { state: "verifying" };

  const session = (await db.directUploadSession.findUnique({
    where: { id: initial.id },
  }))!;

  try {
    let head = await objects.head(session.storageKey);
    const expectedMetadata = directSessionMetadata(session);
    const completed =
      head?.byteSize === Number(session.declaredBytes) &&
      matchesManagedMetadata(head.metadata, expectedMetadata);
    if (!completed) {
      if (!session.s3UploadId) throw new DomainError("storage_unavailable");
      let listed: ObservedUploadPart[];
      try {
        listed = await multipart.listParts({
          key: session.storageKey,
          uploadId: session.s3UploadId,
        });
      } catch (error) {
        if (!isMissingMultipartUpload(error)) throw error;
        head = await objects.head(session.storageKey);
        if (
          !head ||
          head.byteSize !== Number(session.declaredBytes) ||
          !matchesManagedMetadata(head.metadata, expectedMetadata)
        ) {
          throw new DomainError("storage_unavailable", { cause: error });
        }
        listed = [];
      }
      if (listed.length > 0) {
        const manifest = validateObservedUploadParts({
          byteSize: Number(session.declaredBytes),
          partSize: session.partSize,
          partCount: session.partCount,
          parts: listed,
        });
        const persistedManifest = await db.directUploadSession.updateMany({
          where: { id: session.id, state: "VERIFYING", leaseOwner },
          data: { observedParts: manifestJson(manifest) },
        });
        if (persistedManifest.count !== 1) {
          throw new DomainError("conflict", {
            message: "Another request took over upload verification.",
          });
        }
        await multipart.complete({
          key: session.storageKey,
          uploadId: session.s3UploadId,
          parts: manifest,
        });
      }
      head = await objects.head(session.storageKey);
    }
    if (
      !head ||
      head.byteSize !== Number(session.declaredBytes) ||
      !matchesManagedMetadata(head.metadata, expectedMetadata)
    ) {
      throw new DomainError("integrity_mismatch");
    }
    const persistedCompletion = await db.directUploadSession.updateMany({
      where: { id: session.id, state: "VERIFYING", leaseOwner },
      data: { storageCompletedAt: now() },
    });
    if (persistedCompletion.count !== 1) {
      throw new DomainError("conflict", {
        message: "Another request took over upload verification.",
      });
    }

    const prefix = await readPrefix(objects, session);
    if (!prefix.equals(Buffer.from(session.sniffPrefix))) {
      throw new DomainError("integrity_mismatch");
    }
    const classification = await classifyDirectUploadPrefix(prefix);
    if (!sameClassification(session, classification)) {
      throw new DomainError("integrity_mismatch");
    }
    const sha256Hex = await verifyStoredBytes({
      session,
      objects,
      leaseOwner,
      now,
    });
    if (sha256Hex !== Buffer.from(session.declaredSha256).toString("hex")) {
      throw new DomainError("integrity_mismatch");
    }
    const upload = await publishVerifiedSession({
      session,
      leaseOwner,
      sha256Hex,
    });
    return { state: "published", record: publishedRecord(upload) };
  } catch (error) {
    if (error instanceof DomainError && error.code === "conflict") {
      await clearVerificationLease({
        sessionId: session.id,
        userId: session.userId,
        leaseOwner,
        returnToUploading: true,
      }).catch(() => undefined);
      throw error;
    }
    if (permanentVerificationFailure(error)) {
      await db.directUploadSession.updateMany({
        where: { id: session.id, state: "VERIFYING", leaseOwner },
        data: { state: "ABORTING", failureCode: (error as DomainError).code },
      });
      await cleanupSession({
        session: { ...session, state: "ABORTING" },
        finalState: "FAILED",
        failureCode: (error as DomainError).code,
        multipart,
        objects,
      }).catch(() => undefined);
      throw error;
    }
    await clearVerificationLease({
      sessionId: session.id,
      userId: session.userId,
      leaseOwner,
    }).catch(() => undefined);
    throw error instanceof DomainError
      ? error
      : new DomainError("storage_unavailable", { cause: error });
  }
}

async function abortDirectUploadSession(input: {
  session: DirectUploadSession;
  allowVerifying: boolean;
  dependencies?: DirectUploadDependencies;
}): Promise<void> {
  const { multipart, objects, now } = injected(input.dependencies);
  if (input.session.state === "ABORTED" || input.session.state === "FAILED") {
    return;
  }
  if (input.session.state === "PUBLISHED") {
    throw new DomainError("conflict", {
      message: "The upload is already published.",
    });
  }
  const currentTime = now();
  const claimed = await db.directUploadSession.updateMany({
    where: {
      id: input.session.id,
      userId: input.session.userId,
      OR: [
        { state: { in: ["CREATING", "UPLOADING", "ABORTING"] } },
        ...(input.allowVerifying
          ? [
              {
                state: "VERIFYING" as const,
                OR: [
                  { leaseExpiresAt: null },
                  { leaseExpiresAt: { lte: currentTime } },
                ],
              },
            ]
          : []),
      ],
    },
    data: { state: "ABORTING", leaseOwner: null, leaseExpiresAt: null },
  });
  if (claimed.count !== 1) {
    throw new DomainError("conflict", {
      message: "The upload is being verified and can no longer be cancelled.",
    });
  }
  const claimedSession = (await db.directUploadSession.findUnique({
    where: { id: input.session.id },
  }))!;
  try {
    await cleanupSession({
      session: claimedSession,
      finalState: "ABORTED",
      multipart,
      objects,
    });
  } catch (error) {
    throw new DomainError("storage_unavailable", { cause: error });
  }
}

export async function abortOwnedDirectUpload(
  input: { sessionId: string; userId: string },
  dependencies?: DirectUploadDependencies,
): Promise<void> {
  const session = await db.directUploadSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
  });
  if (!session) throw new DomainError("not_found");
  await abortDirectUploadSession({
    session,
    allowVerifying: false,
    dependencies,
  });
}

export async function sweepExpiredDirectUploads(input?: {
  limit?: number;
  dependencies?: DirectUploadDependencies;
}): Promise<{ claimed: number; failed: number }> {
  const { now } = injected(input?.dependencies);
  const currentTime = now();
  const limit = Math.min(100, Math.max(1, input?.limit ?? 25));
  const sessions = await db.directUploadSession.findMany({
    where: {
      OR: [
        {
          state: { in: ["CREATING", "UPLOADING", "ABORTING"] },
          expiresAt: { lte: currentTime },
        },
        {
          state: "VERIFYING",
          hardExpiresAt: { lte: currentTime },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: currentTime } },
          ],
        },
      ],
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  let failed = 0;
  for (const session of sessions) {
    try {
      await abortDirectUploadSession({
        session,
        allowVerifying: true,
        dependencies: input?.dependencies,
      });
    } catch {
      failed += 1;
    }
  }
  return { claimed: sessions.length, failed };
}

export { serializeUpload };
