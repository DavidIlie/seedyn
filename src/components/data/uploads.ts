import "server-only";

import {
  EMPTY_UPLOAD_FILTERS,
  NO_CREDENTIAL,
  type UploadFilters,
} from "~/lib/upload-filters";
import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "~/lib/upload-search";
import { db } from "~/server/db";
import { publicMediaUrl } from "~/server/media/origin-preferences";
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

export const LIBRARY_TREND_DAYS = 14;

export type LibraryTrendPoint = {
  date: string;
  label: string;
  uploads: number;
  byteSize: string;
};

export type LibraryTrend = {
  days: number;
  totalUploads: number;
  totalByteSize: string;
  busiestLabel: string | null;
  busiestUploads: number;
  points: LibraryTrendPoint[];
};

/**
 * Kept equal to the skeleton row count so a full page of results occupies
 * exactly the space its fallback did.
 */
export const PAGE_SIZE = 12;
export const DASHBOARD_RECENT_COUNT = 10;

export function publicUrl(
  publicSlug: string,
  extension: string,
  mediaOrigin?: string | null,
): string {
  return publicMediaUrl({ publicSlug, extension, mediaOrigin });
}

export function uploadUrl(upload: SerializedUpload): string {
  return publicUrl(upload.publicSlug, upload.extension, upload.mediaOrigin);
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

/**
 * Translates the URL's filter set into a Prisma `where`.
 *
 * Every predicate is either an equality on a column the ordering index already
 * leads with (`userId`, `kind`, `apiKeyIdSnapshot`) or a range on `createdAt`,
 * which those same indexes carry as their sort column — so a filtered page is
 * still one ordered index scan, not a sort of the whole library. Size and
 * origin are residual filters on rows the scan already visited.
 */
function uploadFilterWhere(filters: UploadFilters) {
  const searchPattern = escapePostgresLikePattern(
    normalizeUploadSearchQuery(filters.query),
  );
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
  // Exclusive upper bound on the next day: `to` is an inclusive calendar day,
  // and comparing against its midnight would drop everything uploaded during it.
  if (filters.to) {
    const next = new Date(`${filters.to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    createdAt.lt = next;
  }
  const byteSize: { gte?: bigint; lte?: bigint } = {};
  if (filters.minSize !== null) byteSize.gte = BigInt(filters.minSize);
  if (filters.maxSize !== null) byteSize.lte = BigInt(filters.maxSize);

  return {
    ...(searchPattern
      ? {
          originalName: {
            contains: searchPattern,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(filters.credential
      ? {
          apiKeyIdSnapshot:
            filters.credential === NO_CREDENTIAL ? null : filters.credential,
        }
      : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(byteSize.gte !== undefined || byteSize.lte !== undefined
      ? { byteSize }
      : {}),
  };
}

export async function listUploadsByKind(input: {
  userId: string;
  kind: LibraryKind;
  filters?: UploadFilters;
  cursor?: ListCursor;
  limit?: number;
}): Promise<UploadPage> {
  const limit = Math.min(100, Math.max(1, input.limit ?? PAGE_SIZE));
  const filters = input.filters ?? EMPTY_UPLOAD_FILTERS;
  const descending = filters.order !== "oldest";
  const direction = descending ? "desc" : "asc";

  const rows = await db.upload.findMany({
    where: {
      userId: input.userId,
      kind: { in: KIND_FILTER[input.kind] },
      ...uploadFilterWhere(filters),
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

export type CredentialChoice = {
  id: string;
  name: string;
  revoked: boolean;
};

/**
 * The API keys worth offering as a filter: the account's own keys, plus any key
 * an upload still names that has since been deleted. A snapshot outliving its
 * key is the normal case for an old upload, and dropping it from the list would
 * make those rows unreachable by this filter.
 */
export async function listCredentialChoices(
  userId: string,
): Promise<CredentialChoice[]> {
  const [keys, used] = await Promise.all([
    db.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, revokedAt: true },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    }),
    db.upload.findMany({
      where: { userId, apiKeyIdSnapshot: { not: null } },
      distinct: ["apiKeyIdSnapshot"],
      select: { apiKeyIdSnapshot: true, apiKeyNameSnapshot: true },
    }),
  ]);

  const choices = new Map<string, CredentialChoice>();
  for (const key of keys) {
    choices.set(key.id, {
      id: key.id,
      name: key.name,
      revoked: key.revokedAt !== null,
    });
  }
  for (const row of used) {
    const id = row.apiKeyIdSnapshot;
    if (!id || choices.has(id)) continue;
    choices.set(id, {
      id,
      name: row.apiKeyNameSnapshot ?? "Deleted key",
      revoked: true,
    });
  }
  return [...choices.values()];
}

export async function readLibraryTrend(input: {
  userId: string;
  kind: LibraryKind;
}): Promise<LibraryTrend> {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - LIBRARY_TREND_DAYS + 1,
    ),
  );
  const uploads = await db.upload.findMany({
    where: {
      userId: input.userId,
      kind: { in: KIND_FILTER[input.kind] },
      createdAt: { gte: start },
    },
    select: { createdAt: true, byteSize: true },
  });
  const labels = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const points = new Map<string, LibraryTrendPoint>();

  for (let index = 0; index < LIBRARY_TREND_DAYS; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    points.set(date, {
      date,
      label: labels.format(day),
      uploads: 0,
      byteSize: "0",
    });
  }

  let totalByteSize = BigInt(0);
  for (const upload of uploads) {
    const point = points.get(upload.createdAt.toISOString().slice(0, 10));
    if (!point) continue;
    point.uploads += 1;
    point.byteSize = (BigInt(point.byteSize) + upload.byteSize).toString(10);
    totalByteSize += upload.byteSize;
  }

  const series = [...points.values()];
  const busiest = series.reduce<LibraryTrendPoint | null>(
    (current, point) =>
      point.uploads > (current?.uploads ?? 0) ? point : current,
    null,
  );

  return {
    days: LIBRARY_TREND_DAYS,
    totalUploads: uploads.length,
    totalByteSize: totalByteSize.toString(10),
    busiestLabel: busiest?.label ?? null,
    busiestUploads: busiest?.uploads ?? 0,
    points: series,
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
