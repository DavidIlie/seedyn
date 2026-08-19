import "server-only";

import type { Prisma } from "@prisma/client";

import {
  decodeCursor,
  encodeCursor,
  publicUrl,
  type ListCursor,
} from "~/components/data/uploads";
import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "~/lib/upload-search";
import { db } from "~/server/db";
import {
  serializeUpload,
  type SerializedUpload,
  type SerializedUploadOrigin,
} from "~/server/uploads/serialization";

import { requireAdmin } from "./authorization";

export const ADMIN_UPLOAD_PAGE_SIZE = 30;

export type AdminUploadKind = "all" | "IMAGE" | "VIDEO" | "FILE" | "TEXT";
export type AdminUploadOriginFilter = "all" | SerializedUploadOrigin;

export type AdminUploadFilters = {
  query: string;
  kind: AdminUploadKind;
  origin: AdminUploadOriginFilter;
};

export type AdminUploadRow = {
  upload: SerializedUpload;
  owner: { name: string | null; email: string | null };
  url: string;
};

export type AdminUploadPage = {
  items: AdminUploadRow[];
  nextCursor: string | null;
};

export function parseAdminUploadKind(value: string | null): AdminUploadKind {
  return value === "IMAGE" ||
    value === "VIDEO" ||
    value === "FILE" ||
    value === "TEXT"
    ? value
    : "all";
}

export function parseAdminUploadOrigin(
  value: string | null,
): AdminUploadOriginFilter {
  return value === "BROWSER" ||
    value === "HTTP" ||
    value === "SHAREX" ||
    value === "S3" ||
    value === "LEGACY_UNKNOWN"
    ? value
    : "all";
}

export async function loadAdminUploadPage(input?: {
  filters?: Partial<AdminUploadFilters>;
  cursor?: ListCursor;
}): Promise<AdminUploadPage> {
  await requireAdmin();

  const query = normalizeUploadSearchQuery(input?.filters?.query).slice(0, 100);
  const searchPattern = escapePostgresLikePattern(query);
  const kind = input?.filters?.kind ?? "all";
  const origin = input?.filters?.origin ?? "all";
  const conditions: Prisma.UploadWhereInput[] = [];
  if (kind !== "all") conditions.push({ kind });
  if (origin !== "all") conditions.push({ origin });
  if (searchPattern) {
    const insensitive = "insensitive" as const;
    conditions.push({
      OR: [
        {
          originalName: { contains: searchPattern, mode: insensitive },
        },
        {
          publicSlug: { contains: searchPattern, mode: insensitive },
        },
        {
          user: {
            is: {
              OR: [
                { name: { contains: searchPattern, mode: insensitive } },
                { email: { contains: searchPattern, mode: insensitive } },
              ],
            },
          },
        },
      ],
    });
  }
  if (input?.cursor) {
    conditions.push({
      OR: [
        { createdAt: { lt: input.cursor.createdAt } },
        {
          createdAt: input.cursor.createdAt,
          id: { lt: input.cursor.id },
        },
      ],
    });
  }
  const where: Prisma.UploadWhereInput = { AND: conditions };
  const rows = await db.upload.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_UPLOAD_PAGE_SIZE + 1,
    include: {
      user: { select: { name: true, email: true } },
      variants: { where: { state: "READY" }, orderBy: { createdAt: "asc" } },
    },
  });
  const hasMore = rows.length > ADMIN_UPLOAD_PAGE_SIZE;
  const page = rows.slice(0, ADMIN_UPLOAD_PAGE_SIZE);
  const last = page.at(-1);

  return {
    items: page.map(({ user, ...upload }) => ({
      upload: serializeUpload(upload),
      owner: user,
      url: publicUrl(upload.publicSlug, upload.extension, upload.mediaOrigin),
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor(last.createdAt.toISOString(), last.id)
        : null,
  };
}

export function decodeAdminUploadCursor(
  value: string | null,
): ListCursor | undefined {
  return decodeCursor(value ?? undefined);
}
