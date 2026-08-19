import { adminNotFound, authorizeAdminMutation } from "~/server/admin/http";
import { db } from "~/server/db";
import { domainErrorResponse } from "~/server/http/errors";
import { safeJsonError } from "~/server/http/request";
import { DomainError } from "~/server/uploads/errors";
import { deleteOwnedUpload } from "~/server/uploads/service";

type Context = { params: Promise<{ id: string }> };

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const authorization = await authorizeAdminMutation(request);
  if (authorization instanceof Response) return authorization;

  const { id } = await context.params;
  if (!SAFE_ID.test(id)) return adminNotFound(authorization.requestId);

  let upload: { id: string; userId: string } | null;
  try {
    upload = await db.upload.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
  } catch {
    return safeJsonError(
      503,
      "database_unavailable",
      "The upload service is temporarily unavailable.",
      authorization.requestId,
    );
  }
  if (!upload) return adminNotFound(authorization.requestId);

  try {
    await deleteOwnedUpload({ userId: upload.userId, uploadId: upload.id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      return adminNotFound(authorization.requestId);
    }
    return domainErrorResponse(error, authorization.requestId);
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...Object.fromEntries(authorization.rateHeaders ?? []),
      "Cache-Control": "no-store",
    },
  });
}
