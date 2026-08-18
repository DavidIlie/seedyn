import "server-only";

import { db } from "~/server/db";
import { objectStore } from "~/server/storage/minio";
import {
  matchesManagedMetadata,
  type ByteRange,
  type ObjectStore,
  type StoredObjectKind,
} from "~/server/storage/object-store";
import { DomainError } from "~/server/uploads/errors";
import { isPublicSlug } from "~/server/uploads/identifiers";

import type { PublicMediaMetadata } from "./headers";

export type PublicMediaRecord = PublicMediaMetadata & {
  id: string;
  publicSlug: string;
  extension: string;
  storageKey: string;
  storageKind: StoredObjectKind;
};

function byteSizeAsNumber(value: bigint): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function variantFilename(originalName: string, extension: string): string {
  const finalDot = originalName.lastIndexOf(".");
  const candidate =
    finalDot > 0 ? originalName.slice(0, finalDot) : originalName;
  const fallback = candidate || "upload";
  const suffix = `.${extension}`;
  const maximumStemBytes = 255 - Buffer.byteLength(suffix, "utf8");
  let stem = "";
  for (const character of fallback) {
    if (Buffer.byteLength(stem + character, "utf8") > maximumStemBytes) break;
    stem += character;
  }
  return `${stem || "upload"}${suffix}`;
}

export async function findPublicMedia(
  publicSlug: string,
  extension: string,
): Promise<PublicMediaRecord | null> {
  // Uppercase and alternate extensions are deliberately not normalized: the
  // public URL must exactly match the immutable row.
  if (!isPublicSlug(publicSlug) || !/^[a-z0-9]{1,10}$/.test(extension))
    return null;

  const [original, variant] = await Promise.all([
    db.upload.findFirst({
      where: { publicSlug, extension, state: "READY" },
      select: {
        id: true,
        publicSlug: true,
        extension: true,
        storageKey: true,
        byteSize: true,
        contentType: true,
        disposition: true,
        originalName: true,
        sha256: true,
        createdAt: true,
      },
    }),
    db.uploadVariant.findFirst({
      where: {
        publicSlug,
        extension,
        state: "READY",
        upload: { state: "READY" },
      },
      select: {
        id: true,
        publicSlug: true,
        extension: true,
        storageKey: true,
        byteSize: true,
        contentType: true,
        disposition: true,
        sha256: true,
        createdAt: true,
        upload: { select: { originalName: true } },
      },
    }),
  ]);

  const row = original ?? variant;
  if (!row) return null;
  const byteSize = byteSizeAsNumber(row.byteSize);
  if (byteSize === null) return null;
  return {
    id: row.id,
    publicSlug: row.publicSlug,
    extension: row.extension,
    storageKey: row.storageKey,
    storageKind: original ? "original" : "gif-variant",
    byteSize,
    contentType: row.contentType,
    disposition: row.disposition,
    originalName:
      "originalName" in row
        ? row.originalName
        : variantFilename(row.upload.originalName, row.extension),
    sha256: row.sha256,
    createdAt: row.createdAt,
  };
}

export async function validatePublicMedia(
  record: PublicMediaRecord,
  store: ObjectStore = objectStore,
): Promise<void> {
  try {
    const head = await store.head(record.storageKey);
    if (
      !head ||
      head.byteSize !== record.byteSize ||
      !matchesManagedMetadata(head.metadata, {
        recordId: record.id,
        kind: record.storageKind,
        sha256: Buffer.from(record.sha256).toString("hex"),
      })
    ) {
      throw new DomainError("storage_unavailable");
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("storage_unavailable", { cause: error });
  }
}

export async function openPublicMedia(
  record: PublicMediaRecord,
  range?: ByteRange,
  store: ObjectStore = objectStore,
) {
  await validatePublicMedia(record, store);
  try {
    return await store.stream(record.storageKey, range);
  } catch (error) {
    throw new DomainError("storage_unavailable", { cause: error });
  }
}
