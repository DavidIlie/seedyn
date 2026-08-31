import type { Prisma } from "@prisma/client";

import { decodeCursor, encodeCursor } from "~/components/data/uploads";
import { adminNotFound, authorizeAdminMutation } from "~/server/admin/http";
import { db } from "~/server/db";
import { safeJsonError } from "~/server/http/request";
import { DomainError } from "~/server/uploads/errors";
import { deleteOwnedUpload } from "~/server/uploads/service";
import { recordAuditEvent } from "~/server/audit/service";

type Context = { params: Promise<{ id: string }> };

type ClearRequest = {
  confirmation?: unknown;
  cutoff?: unknown;
  cursor?: unknown;
};

const CLEAR_BATCH_SIZE = 8;
const MAX_BODY_BYTES = 4 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

type ClearTarget = {
  id: string;
  name: string | null;
  email: string | null;
  appRole: "MEMBER" | "ADMIN";
};

type ClearCandidate = {
  id: string;
  originalName: string;
  createdAt: Date;
};

function actionError(
  status: number,
  code: "invalid_input" | "payload_too_large",
  message: string,
  requestId: string,
): Response {
  return safeJsonError(status, code, message, requestId);
}

async function requestBody(
  request: Request,
  requestId: string,
): Promise<ClearRequest | Response> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d{1,8}$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_BODY_BYTES)
  ) {
    return actionError(
      413,
      "payload_too_large",
      "The request is too large.",
      requestId,
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return actionError(
      400,
      "invalid_input",
      "A JSON confirmation is required.",
      requestId,
    );
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return actionError(
        413,
        "payload_too_large",
        "The request is too large.",
        requestId,
      );
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("invalid body");
    }
    return parsed;
  } catch {
    return actionError(
      400,
      "invalid_input",
      "The confirmation request is invalid.",
      requestId,
    );
  }
}

function parseCutoff(value: unknown, now: Date): Date | null {
  if (value === undefined) return now;
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return null;
  }
  const cutoff = new Date(value);
  if (
    Number.isNaN(cutoff.getTime()) ||
    cutoff.toISOString() !== value ||
    cutoff.getTime() < Date.UTC(2020, 0, 1) ||
    cutoff.getTime() > now.getTime() + 1_000
  ) {
    return null;
  }
  return cutoff;
}

function failureCode(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  return "internal";
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const authorization = await authorizeAdminMutation(request);
  if (authorization instanceof Response) return authorization;
  const { id } = await context.params;
  if (!SAFE_ID.test(id)) return adminNotFound(authorization.requestId);

  const body = await requestBody(request, authorization.requestId);
  if (body instanceof Response) return body;

  let target: ClearTarget | null;
  try {
    target = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, appRole: true },
    });
  } catch {
    return safeJsonError(
      503,
      "database_unavailable",
      "The admin service is temporarily unavailable.",
      authorization.requestId,
    );
  }
  if (!target) return adminNotFound(authorization.requestId);
  if (target.appRole === "ADMIN") {
    return Response.json(
      {
        error: {
          code: "protected_admin",
          message: "Admin uploads cannot be cleared in bulk.",
          requestId: authorization.requestId,
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const confirmationTarget = target.email ?? target.name ?? target.id;
  const confirmation =
    typeof body.confirmation === "string"
      ? body.confirmation.normalize("NFC").trim()
      : "";
  if (confirmation !== confirmationTarget) {
    return actionError(
      400,
      "invalid_input",
      "Type the account identifier exactly to confirm.",
      authorization.requestId,
    );
  }

  const now = new Date();
  const firstBatch = body.cutoff === undefined;
  const cutoff = parseCutoff(body.cutoff, now);
  const cursorValue =
    body.cursor === undefined || body.cursor === null
      ? undefined
      : typeof body.cursor === "string"
        ? decodeCursor(body.cursor)
        : undefined;
  if (!cutoff || (body.cursor !== undefined && !cursorValue)) {
    return actionError(
      400,
      "invalid_input",
      "The clear operation is no longer valid. Start it again.",
      authorization.requestId,
    );
  }

  const cursorCondition: Prisma.UploadWhereInput | undefined = cursorValue
    ? {
        OR: [
          { createdAt: { lt: cursorValue.createdAt } },
          {
            createdAt: cursorValue.createdAt,
            id: { lt: cursorValue.id },
          },
        ],
      }
    : undefined;
  const where: Prisma.UploadWhereInput = {
    userId: target.id,
    createdAt: { lte: cutoff },
    state: { in: ["READY", "DELETE_FAILED"] },
    ...(cursorCondition ?? {}),
  };

  let rows: ClearCandidate[];
  let totalAtCutoff: number | null = null;
  try {
    [rows, totalAtCutoff] = await Promise.all([
      db.upload.findMany({
        where,
        select: { id: true, originalName: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CLEAR_BATCH_SIZE,
      }),
      firstBatch
        ? db.upload.count({
            where: {
              userId: target.id,
              createdAt: { lte: cutoff },
              state: { in: ["READY", "DELETE_FAILED"] },
            },
          })
        : Promise.resolve(null),
    ]);
  } catch {
    return safeJsonError(
      503,
      "database_unavailable",
      "The admin service is temporarily unavailable.",
      authorization.requestId,
    );
  }

  const failures: Array<{ id: string; name: string; code: string }> = [];
  let deletedCount = 0;
  for (const row of rows) {
    try {
      await deleteOwnedUpload({ userId: target.id, uploadId: row.id });
      deletedCount += 1;
    } catch (error) {
      failures.push({
        id: row.id,
        name: row.originalName,
        code: failureCode(error),
      });
    }
  }

  const last = rows.at(-1);
  const done = rows.length < CLEAR_BATCH_SIZE;
  await recordAuditEvent({
    category: "ADMIN",
    action: "admin_user_uploads_cleared",
    outcome: failures.length > 0 ? "FAILURE" : "SUCCESS",
    actorType: "USER",
    userId: authorization.userId,
    requestId: authorization.requestId,
    targetType: "user",
    targetId: target.id,
    metadata: {
      processedCount: rows.length,
      deletedCount,
      failureCount: failures.length,
      done,
    },
  });
  return Response.json(
    {
      cutoff: cutoff.toISOString(),
      cursor:
        !done && last
          ? encodeCursor(last.createdAt.toISOString(), last.id)
          : null,
      done,
      processedCount: rows.length,
      deletedCount,
      totalAtCutoff,
      failures,
    },
    {
      headers: {
        ...Object.fromEntries(authorization.rateHeaders ?? []),
        "Cache-Control": "no-store",
      },
    },
  );
}
