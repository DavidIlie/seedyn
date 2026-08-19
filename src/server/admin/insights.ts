import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import { DEFAULT_MEMBER_STORAGE_LIMIT_BYTES } from "~/server/storage/quota";
import {
  serializeUploadProvenance,
  type SerializedUploadOrigin,
  type SerializedUploadProvenance,
} from "~/server/uploads/serialization";

import { requireAdmin } from "./authorization";
import {
  ADMIN_UPLOAD_KINDS,
  adminRangeStart,
  buildDailyUploadSeries,
  type AdminRangeDays,
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

export type AdminRecentUpload = {
  id: string;
  originalName: string;
  contentType: string;
  kind: AdminUploadKind;
  state: "READY" | "DELETING" | "DELETE_FAILED";
  byteSize: string;
  createdAt: string;
  provenance: SerializedUploadProvenance;
  owner: { name: string | null; email: string | null };
};

export type AdminInsights = {
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
  users: AdminUserRow[];
  recentUploads: AdminRecentUpload[];
};

type UserVariantAggregate = {
  userId: string;
  count: bigint;
  byteSize: bigint;
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

export async function loadAdminInsights(
  rangeDays: AdminRangeDays,
): Promise<AdminInsights> {
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
    users,
    uploadsByUser,
    gifsByUser,
    keysByUser,
    recentUploads,
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
    db.user.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        appRole: true,
        storageLimitBytes: true,
        createdAt: true,
      },
    }),
    db.upload.groupBy({
      by: ["userId"],
      _count: { _all: true },
      _sum: { byteSize: true },
      _max: { createdAt: true },
    }),
    db.$queryRaw<UserVariantAggregate[]>(Prisma.sql`
      SELECT
        upload."userId" AS "userId",
        COUNT(*)::bigint AS "count",
        COALESCE(SUM(variant."byteSize"), 0)::bigint AS "byteSize"
      FROM "UploadVariant" AS variant
      INNER JOIN "Upload" AS upload ON upload."id" = variant."uploadId"
      GROUP BY upload."userId"
    `),
    db.apiKey.groupBy({
      by: ["userId"],
      where: activeKeyWhere,
      _count: { _all: true },
    }),
    db.upload.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
      select: {
        id: true,
        originalName: true,
        contentType: true,
        kind: true,
        state: true,
        byteSize: true,
        createdAt: true,
        origin: true,
        apiKeyIdSnapshot: true,
        apiKeyNameSnapshot: true,
        clientLabelSnapshot: true,
        s3ObjectKey: true,
        s3PublicNamespaceSnapshot: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  const uploadByUser = new Map(
    uploadsByUser.map((row) => [row.userId, row] as const),
  );
  const gifByUser = new Map(
    gifsByUser.map(
      (row) =>
        [
          row.userId,
          { count: numericCount(row.count), byteSize: row.byteSize },
        ] as const,
    ),
  );
  const keyByUser = new Map(
    keysByUser.map((row) => [row.userId, row._count._all] as const),
  );
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
    users: users.map((user) => {
      const upload = uploadByUser.get(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        appRole: user.appRole,
        createdAt: user.createdAt.toISOString(),
        uploadCount: upload?._count._all ?? 0,
        byteSize: (
          (upload?._sum.byteSize ?? BigInt(0)) +
          (gifByUser.get(user.id)?.byteSize ?? BigInt(0))
        ).toString(10),
        storageLimitBytes: user.storageLimitBytes?.toString(10) ?? null,
        effectiveStorageLimitBytes:
          user.appRole === "ADMIN"
            ? null
            : (
                user.storageLimitBytes ?? DEFAULT_MEMBER_STORAGE_LIMIT_BYTES
              ).toString(10),
        gifCount: gifByUser.get(user.id)?.count ?? 0,
        activeKeyCount: keyByUser.get(user.id) ?? 0,
        lastUploadAt: upload?._max.createdAt?.toISOString() ?? null,
      };
    }),
    recentUploads: recentUploads.map((upload) => ({
      id: upload.id,
      originalName: upload.originalName,
      contentType: upload.contentType,
      kind: upload.kind,
      state: upload.state,
      byteSize: upload.byteSize.toString(10),
      createdAt: upload.createdAt.toISOString(),
      provenance: serializeUploadProvenance(upload),
      owner: upload.user,
    })),
  };
}
