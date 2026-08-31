import "server-only";

import { Prisma } from "@prisma/client";

import { recordAuditEvent } from "~/server/audit/service";
import { db } from "~/server/db";
import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "~/lib/upload-search";
import {
  customPublicSlugError,
  normalizeCustomPublicSlug,
} from "~/lib/public-slug";
import { gifVariantObjectKey, originalObjectKey } from "~/server/storage/keys";
import { objectStore } from "~/server/storage/minio";
import {
  publicMediaUrl,
  isIsolatedMediaOrigin,
  resolveMediaDomainPreference,
  validMediaOrigin,
} from "~/server/media/origin-preferences";
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
  htmlAttachmentClassification,
  isRenderedHtmlClassification,
  sanitizeOriginalName,
  validateGifVariant,
  type ClassifiedUpload,
  type ForcedUploadKind,
  type HtmlRenderingRequest,
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

export type UploadCredentialProvenance = {
  id: string;
  name: string;
  slug: string;
};

/**
 * New uploads must declare their ingress explicitly. Existing pre-migration
 * rows alone use LEGACY_UNKNOWN. S3 aliases are part of the same write so a
 * later key revocation or history prune cannot orphan a public URL.
 */
export type UploadProvenance =
  | { origin: "BROWSER" }
  | {
      origin: "HTTP" | "SHAREX";
      credential: UploadCredentialProvenance;
    }
  | {
      origin: "S3";
      credential: UploadCredentialProvenance;
      s3: { objectKey: string; publicNamespace: string };
    };

function uploadProvenanceFields(provenance: UploadProvenance) {
  if (provenance.origin === "BROWSER") {
    return {
      origin: provenance.origin,
      apiKeyIdSnapshot: null,
      apiKeyNameSnapshot: null,
      apiKeySlugSnapshot: null,
      clientLabelSnapshot: null,
      s3ObjectKey: null,
      s3PublicNamespaceSnapshot: null,
    } as const;
  }

  const credential = provenance.credential;
  if (
    credential.id.length === 0 ||
    credential.id.length > 128 ||
    credential.name.length === 0 ||
    credential.name.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(credential.slug) ||
    credential.slug.length > 64
  ) {
    throw new DomainError("invalid_input");
  }

  if (provenance.origin !== "S3") {
    return {
      origin: provenance.origin,
      apiKeyIdSnapshot: credential.id,
      apiKeyNameSnapshot: credential.name,
      apiKeySlugSnapshot: credential.slug,
      clientLabelSnapshot: null,
      s3ObjectKey: null,
      s3PublicNamespaceSnapshot: null,
    } as const;
  }

  if (
    provenance.s3.objectKey.length === 0 ||
    Buffer.byteLength(provenance.s3.objectKey, "utf8") > 1_024 ||
    provenance.s3.objectKey.includes("\0") ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(provenance.s3.publicNamespace)
  ) {
    throw new DomainError("invalid_input");
  }

  return {
    origin: provenance.origin,
    apiKeyIdSnapshot: credential.id,
    apiKeyNameSnapshot: credential.name,
    apiKeySlugSnapshot: credential.slug,
    clientLabelSnapshot: null,
    s3ObjectKey: provenance.s3.objectKey,
    s3PublicNamespaceSnapshot: provenance.s3.publicNamespace,
  } as const;
}

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

export async function serializableUploadTransaction<T>(
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

export async function lockPublicSlug(
  transaction: Prisma.TransactionClient,
  publicSlug: string,
): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${publicSlug}, 0)) IS NULL AS "locked"
  `);
}

export async function assertPublicSlugAvailable(
  transaction: Prisma.TransactionClient,
  publicSlug: string,
  excludeUploadId?: string,
): Promise<void> {
  const [upload, variant, directSession] = await Promise.all([
    transaction.upload.findFirst({
      where: {
        publicSlug,
        ...(excludeUploadId ? { id: { not: excludeUploadId } } : {}),
      },
      select: { id: true },
    }),
    transaction.uploadVariant.findUnique({
      where: { publicSlug },
      select: { id: true },
    }),
    transaction.directUploadSession.findFirst({
      where: {
        publicSlug,
        state: { in: ["CREATING", "UPLOADING", "VERIFYING"] },
        ...(excludeUploadId ? { uploadId: { not: excludeUploadId } } : {}),
      },
      select: { id: true },
    }),
  ]);
  if (upload || variant || directSession) {
    throw new DomainError("conflict", {
      message: "That public slug is already in use.",
    });
  }
}

export type PublicSlugAvailability = {
  slug: string;
  valid: boolean;
  available: boolean;
  message: string;
};

export async function readPublicSlugAvailability(input: {
  userId: string;
  slug: string;
  excludeUploadId?: string;
}): Promise<PublicSlugAvailability> {
  const slug = normalizeCustomPublicSlug(input.slug);
  const validationError = customPublicSlugError(slug);
  if (validationError) {
    return {
      slug,
      valid: false,
      available: false,
      message: validationError,
    };
  }
  if (input.excludeUploadId) {
    const owned = await db.upload.findFirst({
      where: { id: input.excludeUploadId, userId: input.userId },
      select: { id: true },
    });
    if (!owned) throw new DomainError("not_found");
  }
  const [upload, variant, directSession] = await Promise.all([
    db.upload.findFirst({
      where: {
        publicSlug: slug,
        ...(input.excludeUploadId
          ? { id: { not: input.excludeUploadId } }
          : {}),
      },
      select: { id: true },
    }),
    db.uploadVariant.findUnique({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    db.directUploadSession.findFirst({
      where: {
        publicSlug: slug,
        state: { in: ["CREATING", "UPLOADING", "VERIFYING"] },
        ...(input.excludeUploadId
          ? { uploadId: { not: input.excludeUploadId } }
          : {}),
      },
      select: { id: true },
    }),
  ]);
  const available = !upload && !variant && !directSession;
  return {
    slug,
    valid: true,
    available,
    message: available ? "Available" : "Already in use",
  };
}

export async function changeOwnedUploadPublicSlug(input: {
  userId: string;
  uploadId: string;
  slug: string;
}): Promise<{ publicSlug: string; extension: string; url: string }> {
  const publicSlug = normalizeCustomPublicSlug(input.slug);
  const validationError = customPublicSlugError(publicSlug);
  if (validationError) {
    throw new DomainError("invalid_input", { message: validationError });
  }

  try {
    const upload = await serializableUploadTransaction(async (transaction) => {
      await lockPublicSlug(transaction, publicSlug);
      const owned = await transaction.upload.findFirst({
        where: { id: input.uploadId, userId: input.userId },
        select: { id: true, extension: true, mediaOrigin: true },
      });
      if (!owned) throw new DomainError("not_found");
      await assertPublicSlugAvailable(transaction, publicSlug, owned.id);
      return transaction.upload.update({
        where: { id: owned.id },
        data: { publicSlug },
        select: { publicSlug: true, extension: true, mediaOrigin: true },
      });
    });
    return {
      ...upload,
      url: publicMediaUrl(upload),
    };
  } catch (error) {
    throw databaseError(error);
  }
}

/**
 * Move an upload's public link to another configured media domain.
 *
 * This is a column update and nothing more: the stored object key never
 * contains the origin, and every configured media host already serves it. The
 * domain is therefore a display preference, which is why the upload dialog can
 * offer it after the transfer instead of demanding a decision before one.
 */
export async function changeOwnedUploadMediaOrigin(input: {
  userId: string;
  uploadId: string;
  /** A configured media domain id, or null for the account default. */
  mediaDomainId: string | null;
}): Promise<{ mediaOrigin: string; url: string }> {
  const account = await db.user.findUnique({
    where: { id: input.userId },
    select: { defaultMediaDomain: true },
  });
  if (!account) throw new DomainError("not_found");
  const domain = resolveMediaDomainPreference(
    input.mediaDomainId,
    account.defaultMediaDomain,
  );
  if (!validMediaOrigin(domain.origin)) {
    throw new DomainError("invalid_input", {
      message: "Choose a configured media domain.",
    });
  }

  try {
    const owned = await db.upload.findFirst({
      where: { id: input.uploadId, userId: input.userId },
      select: {
        id: true,
        contentType: true,
        disposition: true,
        extension: true,
      },
    });
    if (!owned) throw new DomainError("not_found");
    if (
      isRenderedHtmlClassification(owned) &&
      !isIsolatedMediaOrigin(domain.origin)
    ) {
      throw new DomainError("invalid_input", {
        message:
          "A rendered page can only be served from a media domain separate from the Seedyn app.",
      });
    }
    const updated = await db.upload.update({
      where: { id: owned.id },
      data: { mediaOrigin: domain.origin },
      select: { publicSlug: true, extension: true, mediaOrigin: true },
    });
    return { mediaOrigin: domain.origin, url: publicMediaUrl(updated) };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw databaseError(error);
  }
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
    provenance: UploadProvenance;
    /** A classification produced from this exact immutable temporary file. */
    classification?: ClassifiedUpload;
    forcedKind?: ForcedUploadKind;
    renderHtml?: HtmlRenderingRequest;
    publicSlug?: string;
    mediaOrigin: string;
    signal?: AbortSignal;
  },
  injected?: UploadServiceDependencies,
) {
  const { store, audit } = dependencies(injected);
  if (!validMediaOrigin(input.mediaOrigin)) {
    throw new DomainError("invalid_input", {
      message: "Choose a configured media domain.",
    });
  }
  const provenanceFields = uploadProvenanceFields(input.provenance);
  let classification =
    input.classification ??
    (await classifyUpload(input.file, {
      forcedKind: input.forcedKind,
      textLanguage: input.file.fields.textLanguage,
      renderHtml: input.renderHtml,
    }));
  if (
    isRenderedHtmlClassification(classification) &&
    !isIsolatedMediaOrigin(input.mediaOrigin)
  ) {
    // An installation without a media origin isolated from the application
    // cannot serve a page safely. Someone who explicitly asked for one is told
    // so; the browser's automatic request quietly stores a download instead of
    // failing an upload that never opted in.
    if (input.renderHtml !== "auto") {
      throw new DomainError("invalid_input", {
        message:
          "Rendered HTML requires a configured public media domain separate from the Seedyn app.",
      });
    }
    classification = htmlAttachmentClassification();
  }
  // Keep validation in the service even when a route reuses its precomputed
  // classification for scope authorization.
  assertClassificationSize(input.file, classification);
  assertForcedUploadKind(classification, input.forcedKind ?? "auto");

  const uploadId = createRecordId();
  const requestedPublicSlug = input.publicSlug?.trim()
    ? normalizeCustomPublicSlug(input.publicSlug)
    : null;
  const slugError = requestedPublicSlug
    ? customPublicSlugError(requestedPublicSlug)
    : null;
  if (slugError) {
    throw new DomainError("invalid_input", { message: slugError });
  }
  const publicSlug = requestedPublicSlug ?? createPublicSlug();
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
    const upload = await serializableUploadTransaction(async (transaction) => {
      await lockPublicSlug(transaction, publicSlug);
      await assertPublicSlugAvailable(transaction, publicSlug);
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
          textLanguage: classification.textLanguage,
          mediaOrigin: input.mediaOrigin,
          ...provenanceFields,
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
    const result = {
      upload: serializeUpload(upload),
      url: publicMediaUrl({
        publicSlug,
        extension: classification.extension,
        mediaOrigin: input.mediaOrigin,
      }),
    };
    if (!injected) {
      const credential =
        input.provenance.origin === "BROWSER"
          ? null
          : input.provenance.credential;
      await recordAuditEvent({
        category: "CONTENT",
        action: "upload_created",
        actorType: credential ? "API_KEY" : "USER",
        userId: input.userId,
        actorLabel: credential?.name,
        apiKeyId: credential?.id,
        targetType: "upload",
        targetId: uploadId,
        metadata: {
          kind: classification.kind,
          origin: input.provenance.origin,
          byteSize: input.file.byteSize,
        },
      });
    }
    return result;
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

/**
 * Change the optional public-media password for an owned upload.
 *
 * The first transition from bearer-link access to password access rotates the
 * original and every variant slug. That closes the old URLs at the origin and
 * ensures a response cached before protection cannot satisfy the new URL.
 * Existing copies outside Seedyn, including an already-populated intermediary
 * cache for an old URL, cannot be recalled.
 */
export async function updateOwnedUploadPassword(input: {
  userId: string;
  uploadId: string;
  passwordHash: string | null;
}) {
  try {
    const row = await serializableUploadTransaction(async (transaction) => {
      const existing = await transaction.upload.findFirst({
        where: { id: input.uploadId, userId: input.userId },
        select: { id: true, passwordHash: true },
      });
      if (!existing) throw new DomainError("not_found");

      const firstLock =
        existing.passwordHash === null && input.passwordHash !== null;
      if (firstLock) {
        const variants = await transaction.uploadVariant.findMany({
          where: { uploadId: existing.id },
          select: { id: true },
        });
        for (const variant of variants) {
          await transaction.uploadVariant.update({
            where: { id: variant.id },
            data: { publicSlug: createPublicSlug() },
          });
        }
      }

      return transaction.upload.update({
        where: { id: existing.id },
        data: {
          passwordHash: input.passwordHash,
          passwordVersion: { increment: 1 },
          ...(firstLock ? { publicSlug: createPublicSlug() } : {}),
        },
        include: { variants: { orderBy: { createdAt: "asc" } } },
      });
    });
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
  let source: { id: string; kind: string; mediaOrigin: string | null } | null;
  let winner: Awaited<ReturnType<typeof db.uploadVariant.findFirst>>;
  try {
    source = await db.upload.findFirst({
      where: { id: input.uploadId, userId: input.userId, state: "READY" },
      select: { id: true, kind: true, mediaOrigin: true },
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
      url: publicMediaUrl({
        publicSlug: winner.publicSlug,
        extension: winner.extension,
        mediaOrigin: source.mediaOrigin,
      }),
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
    const variant = await serializableUploadTransaction(async (transaction) => {
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
      url: publicMediaUrl({
        publicSlug,
        extension: "gif",
        mediaOrigin: source.mediaOrigin,
      }),
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
          url: publicMediaUrl({
            publicSlug: existing.publicSlug,
            extension: existing.extension,
            mediaOrigin: source.mediaOrigin,
          }),
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
    row = await serializableUploadTransaction(async (transaction) => {
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
    await serializableUploadTransaction(async (transaction) => {
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
        // Another idempotent DELETE already removed this row and accounted for
        // its bytes. Never decrement the user's storage counter twice.
        return;
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
