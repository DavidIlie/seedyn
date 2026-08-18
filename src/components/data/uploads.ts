import "server-only";

import { env } from "~/env";
import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "~/lib/upload-search";
import { db } from "~/server/db";
import {
  serializeUpload,
  type SerializedUpload,
} from "~/server/uploads/serialization";

/**
 * Page-local read adapter.
 *
 * `~/server/uploads/service.ts` already owns `listOwnedUploads`,
 * `getOwnedUpload`, and the mutations, and this module calls those wherever it
 * can. It exists because two reads the UI needs have no service export yet:
 *
 *   1. a kind-filtered listing for `/images`, `/files`, and `/texts`;
 *   2. the `N uploads · X storage` aggregate on the dashboard.
 *
 * Both are read-only, both scope every query by `userId`, and both belong in
 * `src/server/uploads/service.ts` once its owner adds them. This file is the
 * seam, not the intended home.
 */

export type LibraryKind = "images" | "files" | "texts";

const KIND_FILTER: Record<
  LibraryKind,
  ("IMAGE" | "VIDEO" | "TEXT" | "FILE")[]
> = {
  // Video lives with files: it is not an image, and a dedicated Video page is
  // not one of the six navigation destinations.
  images: ["IMAGE"],
  files: ["FILE", "VIDEO"],
  texts: ["TEXT"],
};

/**
 * Kept equal to the skeleton row count so a full page of results occupies
 * exactly the space its fallback did.
 */
export const PAGE_SIZE = 12;
export const DASHBOARD_RECENT_COUNT = 10;

/** Mirrors the private `publicUrl` helper in the upload service. */
export function publicUrl(publicSlug: string, extension: string): string {
  const base = env.CDN_URL.endsWith("/") ? env.CDN_URL : `${env.CDN_URL}/`;
  return new URL(`${publicSlug}.${extension}`, base).toString();
}

export function uploadUrl(upload: SerializedUpload): string {
  return publicUrl(upload.publicSlug, upload.extension);
}

export function readyGifVariant(upload: SerializedUpload) {
  return (
    upload.variants.find(
      (variant) => variant.kind === "GIF" && variant.state === "READY",
    ) ?? null
  );
}

export type ListCursor = { createdAt: Date; id: string };

/**
 * Cursor round-trip for the URL. An unparseable cursor yields the first page
 * rather than an error: it is user-editable input on a read-only view.
 */
export function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}~${id}`;
}

export function decodeCursor(
  value: string | undefined,
): ListCursor | undefined {
  if (!value) return undefined;
  const separator = value.indexOf("~");
  if (separator <= 0) return undefined;
  const timestamp = value.slice(0, separator);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    return undefined;
  }
  const createdAt = new Date(timestamp);
  const id = value.slice(separator + 1);
  const time = createdAt.getTime();
  if (
    Number.isNaN(time) ||
    createdAt.toISOString() !== timestamp ||
    time < Date.UTC(2020, 0, 1) ||
    time > Date.now() + 5 * 60 * 1000 ||
    id.length === 0 ||
    id.length > 64
  ) {
    return undefined;
  }
  return { createdAt, id };
}

export type UploadPage = {
  items: SerializedUpload[];
  nextCursor: string | null;
};

export async function listUploadsByKind(input: {
  userId: string;
  kind: LibraryKind;
  query?: string;
  cursor?: ListCursor;
  order?: "newest" | "oldest";
  limit?: number;
}): Promise<UploadPage> {
  const limit = Math.min(100, Math.max(1, input.limit ?? PAGE_SIZE));
  const query = normalizeUploadSearchQuery(input.query);
  const searchPattern = escapePostgresLikePattern(query);
  const descending = input.order !== "oldest";
  const direction = descending ? "desc" : "asc";

  const rows = await db.upload.findMany({
    where: {
      userId: input.userId,
      kind: { in: KIND_FILTER[input.kind] },
      ...(searchPattern
        ? {
            originalName: { contains: searchPattern, mode: "insensitive" },
          }
        : {}),
      ...(input.cursor
        ? descending
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {
              OR: [
                { createdAt: { gt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { gt: input.cursor.id },
                },
              ],
            }
        : {}),
    },
    orderBy: [{ createdAt: direction }, { id: direction }],
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
        ? encodeCursor(last.createdAt.toISOString(), last.id)
        : null,
  };
}

export async function listRecentUploads(
  userId: string,
  limit = DASHBOARD_RECENT_COUNT,
): Promise<SerializedUpload[]> {
  const rows = await db.upload.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      variants: { where: { state: "READY" }, orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map(serializeUpload);
}

export type UploadTotals = { count: number; byteSize: string };

export async function readUploadTotals(userId: string): Promise<UploadTotals> {
  const totals = await db.upload.aggregate({
    where: { userId },
    _count: { _all: true },
    _sum: { byteSize: true },
  });
  return {
    count: totals._count._all,
    byteSize: (totals._sum.byteSize ?? BigInt(0)).toString(10),
  };
}
