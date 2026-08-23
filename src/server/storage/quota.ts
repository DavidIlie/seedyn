import "server-only";

import { Prisma, type StorageReservationKind } from "@prisma/client";

import { db } from "~/server/db";
import { DomainError } from "~/server/uploads/errors";

export const DEFAULT_MEMBER_STORAGE_LIMIT_BYTES = BigInt(5_000_000_000);
export const MAX_STORAGE_LIMIT_BYTES = BigInt(100_000_000_000_000);
export const RESERVATION_LIFETIME_MS = 15 * 60 * 1000;

type LockedUser = {
  id: string;
  appRole: "MEMBER" | "ADMIN";
  storageLimitBytes: bigint | null;
  storageUsedBytes: bigint;
  storageReservedBytes: bigint;
};

export type StorageQuota = {
  usedBytes: string;
  reservedBytes: string;
  limitBytes: string | null;
  unlimited: boolean;
  inherited: boolean;
  percent: number | null;
};

function serializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function quotaTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!serializableConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict;
}

async function lockUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<LockedUser> {
  const rows = await transaction.$queryRaw<LockedUser[]>(Prisma.sql`
    SELECT
      "id",
      "appRole",
      "storageLimitBytes",
      "storageUsedBytes",
      "storageReservedBytes"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `);
  const user = rows[0];
  if (!user) throw new DomainError("not_found");
  return user;
}

export async function reserveStorage(input: {
  id: string;
  userId: string;
  storageKey: string;
  byteSize: number;
  kind: StorageReservationKind;
  expiresAt?: Date;
}): Promise<void> {
  await quotaTransaction(async (transaction) => {
    await reserveStorageInTransaction(transaction, input);
  });
}

export async function reserveStorageInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    id: string;
    userId: string;
    storageKey: string;
    byteSize: number;
    kind: StorageReservationKind;
    expiresAt?: Date;
  },
): Promise<void> {
  const byteSize = BigInt(input.byteSize);
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + RESERVATION_LIFETIME_MS);
  if (
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0 ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    throw new TypeError("Storage reservation input is invalid");
  }
  const user = await lockUser(transaction, input.userId);
  const limit =
    user.appRole === "ADMIN"
      ? null
      : (user.storageLimitBytes ?? DEFAULT_MEMBER_STORAGE_LIMIT_BYTES);
  if (
    limit !== null &&
    user.storageUsedBytes + user.storageReservedBytes + byteSize > limit
  ) {
    throw new DomainError("storage_quota_exceeded");
  }

  await transaction.storageReservation.create({
    data: {
      id: input.id,
      userId: input.userId,
      storageKey: input.storageKey,
      byteSize,
      kind: input.kind,
      expiresAt,
    },
  });
  await transaction.user.update({
    where: { id: input.userId },
    data: { storageReservedBytes: { increment: byteSize } },
  });
}

export async function releaseStorageReservation(input: {
  id: string;
  userId: string;
}): Promise<void> {
  await quotaTransaction(async (transaction) => {
    await releaseStorageReservationInTransaction(transaction, input);
  });
}

export async function releaseStorageReservationInTransaction(
  transaction: Prisma.TransactionClient,
  input: { id: string; userId: string },
): Promise<void> {
  await lockUser(transaction, input.userId);
  const reservation = await transaction.storageReservation.findFirst({
    where: { id: input.id, userId: input.userId },
    select: { byteSize: true },
  });
  if (!reservation) return;
  await transaction.user.update({
    where: { id: input.userId },
    data: { storageReservedBytes: { decrement: reservation.byteSize } },
  });
  await transaction.storageReservation.delete({ where: { id: input.id } });
}

export async function finalizeStorageReservation(
  transaction: Prisma.TransactionClient,
  input: { id: string; userId: string },
): Promise<bigint> {
  await lockUser(transaction, input.userId);
  const reservation = await transaction.storageReservation.findFirst({
    where: { id: input.id, userId: input.userId },
    select: { byteSize: true },
  });
  if (!reservation) throw new DomainError("database_unavailable");
  await transaction.user.update({
    where: { id: input.userId },
    data: {
      storageReservedBytes: { decrement: reservation.byteSize },
      storageUsedBytes: { increment: reservation.byteSize },
    },
  });
  await transaction.storageReservation.delete({ where: { id: input.id } });
  return reservation.byteSize;
}

export async function decrementUsedStorage(
  transaction: Prisma.TransactionClient,
  input: { userId: string; byteSize: bigint },
): Promise<void> {
  const user = await lockUser(transaction, input.userId);
  const decrement =
    input.byteSize > user.storageUsedBytes
      ? user.storageUsedBytes
      : input.byteSize;
  await transaction.user.update({
    where: { id: input.userId },
    data: { storageUsedBytes: { decrement } },
  });
}

export async function readStorageQuota(userId: string): Promise<StorageQuota> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      appRole: true,
      storageLimitBytes: true,
      storageUsedBytes: true,
      storageReservedBytes: true,
    },
  });
  if (!user) throw new DomainError("not_found");
  const unlimited = user.appRole === "ADMIN";
  const limit = unlimited
    ? null
    : (user.storageLimitBytes ?? DEFAULT_MEMBER_STORAGE_LIMIT_BYTES);
  const committed = user.storageUsedBytes;
  const accounted = committed + user.storageReservedBytes;
  const percent =
    limit === null || limit === BigInt(0)
      ? null
      : Math.min(100, Number((accounted * BigInt(10_000)) / limit) / 100);

  return {
    usedBytes: committed.toString(10),
    reservedBytes: user.storageReservedBytes.toString(10),
    limitBytes: limit?.toString(10) ?? null,
    unlimited,
    inherited: !unlimited && user.storageLimitBytes === null,
    percent,
  };
}
