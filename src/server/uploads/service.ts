import "server-only";

import { Prisma } from "@prisma/client";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "~/lib/upload-search";
import { gifVariantObjectKey, originalObjectKey } from "~/server/storage/keys";
import { objectStore } from "~/server/storage/minio";
import type { ObjectStore } from "~/server/storage/object-store";
import {
  decrementUsedStorage,
  finalizeStorageReservation,
  releaseStorageReservation,
  reserveStorage,
} from "~/server/storage/quota";

import {
  assertClassificationSize,
  assertForcedUploadKind,
  classifyUpload,
  sanitizeOriginalName,
  validateGifVariant,
  type ClassifiedUpload,
  type ForcedUploadKind,
} from "./classification";
import { DomainError, safeErrorCategory } from "./errors";
import { createPublicSlug, createRecordId } from "./identifiers";
import type { ParsedUploadFile } from "./multipart";
import { serializeUpload, serializeVariant } from "./serialization";

type AuditEvent = {
  event:
    | "storage_orphan"
    | "delete_state_update_failed"
    | "quota_reservation_release_failed";
  userId: string;
  uploadId: string;
  recordId: string;
  storageKey?: string;
  errorCategory: string;
};

type UploadServiceDependencies = {
  store?: ObjectStore;
  audit?: (event: AuditEvent) => void;
};

const defaultAudit = (event: AuditEvent) => {
  // Only application-generated identifiers and bounded categories are emitted.
  // Uploaded filenames, bodies, authorization, and storage credentials are absent.
  console.error(JSON.stringify(event));
};

function dependencies(value?: UploadServiceDependencies) {
  return {
    store: value?.store ?? objectStore,
    audit: value?.audit ?? defaultAudit,
  };
}

async function releaseQuotaReservation(input: {
  audit: (event: AuditEvent) => void;
  id: string;
  userId: string;
  uploadId: string;
}): Promise<void> {
  try {
    await releaseStorageReservation({ id: input.id, userId: input.userId });
  } catch (error) {
    input.audit({
      event: "quota_reservation_release_failed",
      userId: input.userId,
      uploadId: input.uploadId,
      recordId: input.id,
      errorCategory: safeErrorCategory(error),
    });
  }
}

function publicUrl(publicSlug: string, extension: string): string {
  const base = env.CDN_URL.endsWith("/") ? env.CDN_URL : `${env.CDN_URL}/`;
  return new URL(`${publicSlug}.${extension}`, base).toString();
}

function databaseError(error: unknown): DomainError {
  return error instanceof DomainError
    ? error
    : new DomainError("database_unavailable", { cause: error });
}

function isSerializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializableConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict;
}

async function compensateObject(input: {
  store: ObjectStore;
  audit: (event: AuditEvent) => void;
  key: string;
  userId: string;
  uploadId: string;
  recordId: string;
}): Promise<void> {
  try {
    await input.store.delete(input.key);
  } catch (error) {
    input.audit({
      event: "storage_orphan",
      userId: input.userId,
      uploadId: input.uploadId,
      recordId: input.recordId,
      storageKey: input.key,
      errorCategory: safeErrorCategory(error),
    });
  }
}

export async function createUpload(
  input: {
    userId: string;
    file: ParsedUploadFile;
    /** A classification produced from this exact immutable temporary file. */
    classification?: ClassifiedUpload;
    forcedKind?: ForcedUploadKind;
    signal?: AbortSignal;
  },
  injected?: UploadServiceDependencies,
) {
  const { store, audit } = dependencies(injected);
  const classification =
    input.classification ?? (await classifyUpload(input.file));
  // Keep validation in the service even when a route reuses its precomputed
  // classification for scope authorization.
  assertClassificationSize(input.file, classification);
  assertForcedUploadKind(classification, input.forcedKind ?? "auto");

  const uploadId = createRecordId();
  const publicSlug = createPublicSlug();
  const storageKey = originalObjectKey({
    userId: input.userId,
    uploadId,
    extension: classification.extension,
  });

  await reserveStorage({
    id: uploadId,
    userId: input.userId,
    storageKey,
    byteSize: input.file.byteSize,
    kind: "ORIGINAL",
  });

  if (input.signal?.aborted) {
    await releaseQuotaReservation({
      audit,
      id: uploadId,
      userId: input.userId,
      uploadId,
    });
    throw new DomainError("request_aborted");
  }

  try {
    await store.put({
      key: storageKey,
      filePath: input.file.path,
      byteSize: input.file.byteSize,
      contentType: classification.contentType,
      metadata: {
        recordId: uploadId,
        kind: "original",
        sha256: input.file.sha256Hex,
      },
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal?.aborted) {
      await compensateObject({
        store,
        audit,
        key: storageKey,
        userId: input.userId,
        uploadId,
        recordId: uploadId,
      });
    }
    await releaseQuotaReservation({
      audit,
      id: uploadId,
      userId: input.userId,
      uploadId,
    });
    throw new DomainError(
      input.signal?.aborted ? "request_aborted" : "storage_unavailable",
      { cause: error },
    );
  }

  if (input.signal?.aborted) {
    await compensateObject({
      store,
      audit,
      key: storageKey,
      userId: input.userId,
      uploadId,
      recordId: uploadId,
    });
    await releaseQuotaReservation({
      audit,
      id: uploadId,
      userId: input.userId,
      uploadId,
    });
    throw new DomainError("request_aborted");
  }

  try {
    const upload = await serializableTransaction(async (transaction) => {
      const created = await transaction.upload.create({
        data: {
          id: uploadId,
          userId: input.userId,
          publicSlug,
          kind: classification.kind,
          state: "READY",
          originalName: sanitizeOriginalName(
            input.file.originalName || input.file.fields.filename || "upload",
          ),
          extension: classification.extension,
          contentType: classification.contentType,
          disposition: classification.disposition,
          byteSize: BigInt(input.file.byteSize),
          sha256: Buffer.from(input.file.sha256Hex, "hex"),
          storageKey,
          width: classification.width,
          height: classification.height,
          durationMs: classification.durationMs,
        },
        include: { variants: true },
      });
      await finalizeStorageReservation(transaction, {
        id: uploadId,
        userId: input.userId,
      });
      return created;
    });
    return {
      upload: serializeUpload(upload),
      url: publicUrl(publicSlug, classification.extension),
    };
  } catch (error) {
    await compensateObject({
      store,
      audit,
      key: storageKey,
      userId: input.userId,
      uploadId,
      recordId: uploadId,
    });
    await releaseQuotaReservation({
      audit,
      id: uploadId,
      userId: input.userId,
      uploadId,
    });
    throw databaseError(error);
  }
}

export async function listOwnedUploads(input: {
  userId: string;
  limit?: number;
  cursor?: { createdAt: Date; id: string };
  query?: string;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 24));
  const query = normalizeUploadSearchQuery(input.query);
  const searchPattern = escapePostgresLikePattern(query);
  try {
    const rows = await db.upload.findMany({
      where: {
        userId: input.userId,
        ...(searchPattern
          ? {
              originalName: { contains: searchPattern, mode: "insensitive" },
            }
          : {}),
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        variants: { where: { state: "READY" }, orderBy: { createdAt: "asc" } },
      },
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(serializeUpload),
      nextCursor:
        hasMore && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
    };
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getOwnedUpload(userId: string, uploadId: string) {
  try {
    const row = await db.upload.findFirst({
      where: { id: uploadId, userId },
      include: { variants: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) throw new DomainError("not_found");
    return serializeUpload(row);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function createGifVariant(
  input: {
    userId: string;
    uploadId: string;
    file: ParsedUploadFile;
    signal?: AbortSignal;
  },
  injected?: UploadServiceDependencies,
) {
  const { store, audit } = dependencies(injected);
  let source: { id: string; kind: string } | null;
  let winner: Awaited<ReturnType<typeof db.uploadVariant.findFirst>>;
  try {
    source = await db.upload.findFirst({
      where: { id: input.uploadId, userId: input.userId, state: "READY" },
      select: { id: true, kind: true },
    });
    winner = await db.uploadVariant.findFirst({
      where: {
        uploadId: input.uploadId,
        kind: "GIF",
        state: "READY",
        upload: { userId: input.userId, state: "READY" },
      },
    });
  } catch (error) {
    throw databaseError(error);
  }
  if (!source) throw new DomainError("not_found");
  if (source.kind !== "IMAGE" && source.kind !== "VIDEO") {
    throw new DomainError("unsupported_media");
  }

  if (winner) {
    return {
      variant: serializeVariant(winner),
      url: publicUrl(winner.publicSlug, winner.extension),
      created: false,
    };
  }

  const classification = await validateGifVariant(input.file);
  const variantId = createRecordId();
  const publicSlug = createPublicSlug();
  const storageKey = gifVariantObjectKey({
    userId: input.userId,
    uploadId: input.uploadId,
    variantId,
  });

  await reserveStorage({
    id: variantId,
    userId: input.userId,
    storageKey,
    byteSize: input.file.byteSize,
    kind: "GIF",
  });

  if (input.signal?.aborted) {
    await releaseQuotaReservation({
      audit,
      id: variantId,
      userId: input.userId,
      uploadId: input.uploadId,
    });
    throw new DomainError("request_aborted");
  }

  try {
    await store.put({
      key: storageKey,
      filePath: input.file.path,
      byteSize: input.file.byteSize,
      contentType: "image/gif",
      metadata: {
        recordId: variantId,
        kind: "gif-variant",
        sha256: input.file.sha256Hex,
      },
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal?.aborted) {
      await compensateObject({
        store,
        audit,
        key: storageKey,
        userId: input.userId,
        uploadId: input.uploadId,
        recordId: variantId,
      });
    }
    await releaseQuotaReservation({
      audit,
      id: variantId,
      userId: input.userId,
      uploadId: input.uploadId,
    });
    throw new DomainError(
      input.signal?.aborted ? "request_aborted" : "storage_unavailable",
      { cause: error },
    );
  }

  if (input.signal?.aborted) {
    await compensateObject({
      store,
      audit,
      key: storageKey,
      userId: input.userId,
      uploadId: input.uploadId,
      recordId: variantId,
    });
    await releaseQuotaReservation({
      audit,
      id: variantId,
      userId: input.userId,
      uploadId: input.uploadId,
    });
    throw new DomainError("request_aborted");
  }

  try {
    const variant = await serializableTransaction(async (transaction) => {
      const ownedSource = await transaction.upload.findFirst({
        where: { id: input.uploadId, userId: input.userId, state: "READY" },
        select: { id: true, kind: true },
      });
      if (
        !ownedSource ||
        (ownedSource.kind !== "IMAGE" && ownedSource.kind !== "VIDEO")
      ) {
        throw new DomainError("not_found");
      }
      const created = await transaction.uploadVariant.create({
        data: {
          id: variantId,
          uploadId: input.uploadId,
          publicSlug,
          kind: "GIF",
          state: "READY",
          extension: "gif",
          contentType: "image/gif",
          disposition: "INLINE",
          byteSize: BigInt(input.file.byteSize),
          sha256: Buffer.from(input.file.sha256Hex, "hex"),
          storageKey,
          width: classification.width,
          height: classification.height,
          durationMs: classification.durationMs,
        },
      });
      await finalizeStorageReservation(transaction, {
        id: variantId,
        userId: input.userId,
      });
      return created;
    });
    return {
      variant: serializeVariant(variant),
      url: publicUrl(publicSlug, "gif"),
      created: true,
    };
  } catch (error) {
    await compensateObject({
      store,
      audit,
      key: storageKey,
      userId: input.userId,
      uploadId: input.uploadId,
      recordId: variantId,
    });
    await releaseQuotaReservation({
      audit,
      id: variantId,
      userId: input.userId,
      uploadId: input.uploadId,
    });

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await db.uploadVariant.findFirst({
        where: {
          uploadId: input.uploadId,
          kind: "GIF",
          state: "READY",
          upload: { userId: input.userId, state: "READY" },
        },
      });
      if (existing) {
        return {
          variant: serializeVariant(existing),
          url: publicUrl(existing.publicSlug, existing.extension),
          created: false,
        };
      }
      throw new DomainError("conflict", { cause: error });
    }
    throw databaseError(error);
  }
}

async function markDeleteFailed(input: {
  userId: string;
  uploadId: string;
  category: string;
}): Promise<void> {
  const category = input.category.slice(0, 80);
  const at = new Date();
  await db.$transaction([
    db.upload.updateMany({
      where: { id: input.uploadId, userId: input.userId },
      data: {
        state: "DELETE_FAILED",
        deleteErrorCode: category,
        deleteErrorAt: at,
      },
    }),
    db.uploadVariant.updateMany({
      where: { uploadId: input.uploadId, upload: { userId: input.userId } },
      data: {
        state: "DELETE_FAILED",
        deleteErrorCode: category,
        deleteErrorAt: at,
      },
    }),
  ]);
}

export async function deleteOwnedUpload(
  input: { userId: string; uploadId: string },
  injected?: UploadServiceDependencies,
): Promise<{ deleted: true }> {
  const { store, audit } = dependencies(injected);
  let row: {
    storageKey: string;
    byteSize: bigint;
    variants: { id: string; storageKey: string; byteSize: bigint }[];
  };
  try {
    row = await serializableTransaction(async (transaction) => {
      const owned = await transaction.upload.findFirst({
        where: { id: input.uploadId, userId: input.userId },
        include: {
          variants: { select: { id: true, storageKey: true, byteSize: true } },
        },
      });
      if (!owned) throw new DomainError("not_found");
      if (owned.state !== "DELETING") {
        const changed = await transaction.upload.updateMany({
          where: {
            id: input.uploadId,
            userId: input.userId,
            state: { in: ["READY", "DELETE_FAILED"] },
          },
          data: {
            state: "DELETING",
            deleteErrorCode: null,
            deleteErrorAt: null,
          },
        });
        if (changed.count !== 1) throw new DomainError("conflict");
      }
      await transaction.uploadVariant.updateMany({
        where: {
          uploadId: input.uploadId,
          upload: { userId: input.userId },
          state: { in: ["READY", "DELETE_FAILED"] },
        },
        data: { state: "DELETING", deleteErrorCode: null, deleteErrorAt: null },
      });
      return owned;
    });
  } catch (error) {
    throw databaseError(error);
  }

  try {
    for (const variant of row.variants) await store.delete(variant.storageKey);
    await store.delete(row.storageKey);
  } catch (error) {
    const category = safeErrorCategory(error);
    try {
      await markDeleteFailed({ ...input, category });
    } catch (stateError) {
      audit({
        event: "delete_state_update_failed",
        userId: input.userId,
        uploadId: input.uploadId,
        recordId: input.uploadId,
        errorCategory: safeErrorCategory(stateError),
      });
    }
    throw new DomainError("storage_unavailable", { cause: error });
  }

  try {
    await serializableTransaction(async (transaction) => {
      await transaction.uploadVariant.deleteMany({
        where: { uploadId: input.uploadId, upload: { userId: input.userId } },
      });
      const removed = await transaction.upload.deleteMany({
        where: { id: input.uploadId, userId: input.userId, state: "DELETING" },
      });
      if (removed.count !== 1) {
        const stillExists = await transaction.upload.findFirst({
          where: { id: input.uploadId, userId: input.userId },
          select: { id: true },
        });
        if (stillExists) throw new DomainError("database_unavailable");
      }
      const releasedBytes = row.variants.reduce(
        (total, variant) => total + variant.byteSize,
        row.byteSize,
      );
      await decrementUsedStorage(transaction, {
        userId: input.userId,
        byteSize: releasedBytes,
      });
    });
    return { deleted: true };
  } catch (error) {
    const category = safeErrorCategory(error);
    try {
      await markDeleteFailed({ ...input, category });
    } catch (stateError) {
      audit({
        event: "delete_state_update_failed",
        userId: input.userId,
        uploadId: input.uploadId,
        recordId: input.uploadId,
        errorCategory: safeErrorCategory(stateError),
      });
    }
    throw databaseError(error);
  }
}

/** Retries both DELETE_FAILED rows and stale rows already left in DELETING. */
export async function retryOwnedUploadDeletion(
  input: { userId: string; uploadId: string },
  injected?: UploadServiceDependencies,
): Promise<{ deleted: true }> {
  return deleteOwnedUpload(input, injected);
}
