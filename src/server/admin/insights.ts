import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import { DEFAULT_MEMBER_STORAGE_LIMIT_BYTES } from "~/server/storage/quota";
import type { SerializedUploadOrigin } from "~/server/uploads/serialization";

import { requireAdmin } from "./authorization";
import {
  ADMIN_UPLOAD_KINDS,
  ADMIN_USER_PAGE_SIZE,
  adminRangeStart,
  buildDailyUploadSeries,
  type AdminRangeDays,
  type AdminUserView,
  type AdminUploadKind,
  type DailyUploadAggregate,
  type DailyUploadPoint,
} from "./insights-view";

export type AdminKindTotal = {
  kind: AdminUploadKind;
  count: number;
  byteSize: string;
};

export type AdminOriginTotal = {
  origin: SerializedUploadOrigin;
  count: number;
  byteSize: string;
};

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  appRole: "MEMBER" | "ADMIN";
  createdAt: string;
  uploadCount: number;
  byteSize: string;
  storageLimitBytes: string | null;
  effectiveStorageLimitBytes: string | null;
  gifCount: number;
  activeKeyCount: number;
  lastUploadAt: string | null;
};

export type AdminUserPage = {
  items: AdminUserRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  view: AdminUserView;
};

export type AdminOverview = {
  rangeDays: AdminRangeDays;
  summary: {
    userCount: number;
    uploadCount: number;
    variantCount: number;
    originalByteSize: string;
    variantByteSize: string;
    totalByteSize: string;
    activeApiKeyCount: number;
    failedObjectCount: number;
  };
  daily: DailyUploadPoint[];
  kinds: AdminKindTotal[];
  origins: AdminOriginTotal[];
};

type AdminUserDatabaseRow = {
  id: string;
  name: string | null;
  email: string | null;
  appRole: "MEMBER" | "ADMIN";
  storageLimitBytes: bigint | null;
  storageUsedBytes: bigint;
  createdAt: Date;
  uploadCount: bigint;
  gifCount: bigint;
  activeKeyCount: bigint;
  lastUploadAt: Date | null;
};

const ADMIN_UPLOAD_ORIGINS = [
  "BROWSER",
  "HTTP",
  "SHAREX",
  "S3",
  "LEGACY_UNKNOWN",
] as const satisfies readonly SerializedUploadOrigin[];

function decimal(value: bigint | null | undefined): string {
  return (value ?? BigInt(0)).toString(10);
}

function numericCount(value: bigint): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Admin aggregate count exceeds the safe numeric range");
  }
  return count;
}

function adminUserOrder(view: AdminUserView): Prisma.Sql {
  const ascending = view.direction === "asc";
  switch (view.sort) {
    case "account":
      return ascending
        ? Prisma.sql`LOWER(COALESCE(account."name", account."email", '')) ASC, account."id" ASC`
        : Prisma.sql`LOWER(COALESCE(account."name", account."email", '')) DESC, account."id" DESC`;
    case "uploads":
      return ascending
        ? Prisma.sql`"uploadCount" ASC, account."createdAt" DESC, account."id" DESC`
        : Prisma.sql`"uploadCount" DESC, account."createdAt" DESC, account."id" DESC`;
    case "stored":
      return ascending
        ? Prisma.sql`account."storageUsedBytes" ASC, account."createdAt" DESC, account."id" DESC`
        : Prisma.sql`account."storageUsedBytes" DESC, account."createdAt" DESC, account."id" DESC`;
    case "keys":
      return ascending
        ? Prisma.sql`"activeKeyCount" ASC, account."createdAt" DESC, account."id" DESC`
        : Prisma.sql`"activeKeyCount" DESC, account."createdAt" DESC, account."id" DESC`;
    case "joined":
      return ascending
        ? Prisma.sql`account."createdAt" ASC, account."id" ASC`
        : Prisma.sql`account."createdAt" DESC, account."id" DESC`;
    case "last":
      return ascending
        ? Prisma.sql`"lastUploadAt" ASC NULLS LAST, account."createdAt" DESC, account."id" DESC`
        : Prisma.sql`"lastUploadAt" DESC NULLS LAST, account."createdAt" DESC, account."id" DESC`;
  }
  throw new Error("Unsupported admin user sort");
}

export async function loadAdminUserPage(
  requestedView: AdminUserView,
): Promise<AdminUserPage> {
  await requireAdmin();

  const now = new Date();
  const searchFilter = requestedView.query
    ? Prisma.sql`
        AND (
          STRPOS(LOWER(COALESCE(account."name", '')), LOWER(${requestedView.query})) > 0
          OR STRPOS(LOWER(COALESCE(account."email", '')), LOWER(${requestedView.query})) > 0
        )
      `
    : Prisma.empty;
  const filter = Prisma.sql`WHERE TRUE ${searchFilter}`;
  const countRows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "User" AS account
    ${filter}
  `);
  const totalCount = numericCount(countRows[0]?.count ?? BigInt(0));
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_USER_PAGE_SIZE));
  const page = Math.min(requestedView.page, totalPages);
  const offset = (page - 1) * ADMIN_USER_PAGE_SIZE;
  const order = adminUserOrder(requestedView);
  const rows = await db.$queryRaw<AdminUserDatabaseRow[]>(Prisma.sql`
    SELECT
      account."id",
      account."name",
      account."email",
      account."appRole",
      account."storageLimitBytes",
      account."storageUsedBytes",
      account."createdAt",
      (
        SELECT COUNT(*)::bigint
        FROM "Upload" AS upload
        WHERE upload."userId" = account."id"
      ) AS "uploadCount",
      (
        SELECT COUNT(*)::bigint
        FROM "UploadVariant" AS variant
        INNER JOIN "Upload" AS upload ON upload."id" = variant."uploadId"
        WHERE upload."userId" = account."id"
      ) AS "gifCount",
      (
        SELECT COUNT(*)::bigint
        FROM "ApiKey" AS key
        WHERE key."userId" = account."id"
          AND key."revokedAt" IS NULL
          AND (key."expiresAt" IS NULL OR key."expiresAt" > ${now})
      ) AS "activeKeyCount",
      (
        SELECT MAX(upload."createdAt")
        FROM "Upload" AS upload
        WHERE upload."userId" = account."id"
      ) AS "lastUploadAt"
    FROM "User" AS account
    ${filter}
    ORDER BY ${order}
    LIMIT ${ADMIN_USER_PAGE_SIZE}
    OFFSET ${offset}
  `);
  const view = { ...requestedView, page };

  return {
    items: rows.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      appRole: user.appRole,
      createdAt: user.createdAt.toISOString(),
      uploadCount: numericCount(user.uploadCount),
      byteSize: user.storageUsedBytes.toString(10),
      storageLimitBytes: user.storageLimitBytes?.toString(10) ?? null,
      effectiveStorageLimitBytes:
        user.appRole === "ADMIN"
          ? null
          : (
              user.storageLimitBytes ?? DEFAULT_MEMBER_STORAGE_LIMIT_BYTES
            ).toString(10),
      gifCount: numericCount(user.gifCount),
      activeKeyCount: numericCount(user.activeKeyCount),
      lastUploadAt: user.lastUploadAt?.toISOString() ?? null,
    })),
    page,
    pageSize: ADMIN_USER_PAGE_SIZE,
    totalCount,
    totalPages,
    view,
  };
}

export async function loadAdminOverview(
  rangeDays: AdminRangeDays,
): Promise<AdminOverview> {
  await requireAdmin();

  const now = new Date();
  const start = adminRangeStart(now, rangeDays);
  const activeKeyWhere = {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } satisfies Prisma.ApiKeyWhereInput;

  const [
    userCount,
    uploadTotals,
    variantTotals,
    activeApiKeyCount,
    failedUploads,
    failedVariants,
    kindRows,
    originRows,
    dailyRows,
  ] = await Promise.all([
    db.user.count(),
    db.upload.aggregate({
      _count: { _all: true },
      _sum: { byteSize: true },
    }),
    db.uploadVariant.aggregate({
      _count: { _all: true },
      _sum: { byteSize: true },
    }),
    db.apiKey.count({ where: activeKeyWhere }),
    db.upload.count({ where: { state: "DELETE_FAILED" } }),
    db.uploadVariant.count({ where: { state: "DELETE_FAILED" } }),
    db.upload.groupBy({
      by: ["kind"],
      _count: { _all: true },
      _sum: { byteSize: true },
    }),
    db.upload.groupBy({
      by: ["origin"],
      _count: { _all: true },
      _sum: { byteSize: true },
    }),
    db.$queryRaw<DailyUploadAggregate[]>(Prisma.sql`
      SELECT
        date_trunc('day', "createdAt") AS "day",
        "kind",
        COUNT(*)::bigint AS "count",
        COALESCE(SUM("byteSize"), 0)::bigint AS "byteSize"
      FROM "Upload"
      WHERE "createdAt" >= ${start}
      GROUP BY date_trunc('day', "createdAt"), "kind"
      ORDER BY "day" ASC
    `),
  ]);

  const kindByName = new Map(kindRows.map((row) => [row.kind, row] as const));
  const originByName = new Map(
    originRows.map((row) => [row.origin, row] as const),
  );
  const originalByteSize = uploadTotals._sum.byteSize ?? BigInt(0);
  const variantByteSize = variantTotals._sum.byteSize ?? BigInt(0);

  return {
    rangeDays,
    summary: {
      userCount,
      uploadCount: uploadTotals._count._all,
      variantCount: variantTotals._count._all,
      originalByteSize: decimal(originalByteSize),
      variantByteSize: decimal(variantByteSize),
      totalByteSize: (originalByteSize + variantByteSize).toString(10),
      activeApiKeyCount,
      failedObjectCount: failedUploads + failedVariants,
    },
    daily: buildDailyUploadSeries({ now, days: rangeDays, rows: dailyRows }),
    kinds: ADMIN_UPLOAD_KINDS.map((kind) => {
      const row = kindByName.get(kind);
      return {
        kind,
        count: row?._count._all ?? 0,
        byteSize: decimal(row?._sum.byteSize),
      };
    }),
    origins: ADMIN_UPLOAD_ORIGINS.map((origin) => {
      const row = originByName.get(origin);
      return {
        origin,
        count: row?._count._all ?? 0,
        byteSize: decimal(row?._sum.byteSize),
      };
    }),
  };
}
