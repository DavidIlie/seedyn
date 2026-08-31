import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { safeJsonError } from "~/server/http/request";
import { deleteOwnedUpload } from "~/server/uploads/service";
import { recordAuditEvent } from "~/server/audit/service";

type Context = { params: Promise<{ id: string }> };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  const { id } = await context.params;
  if (!UUID.test(id)) {
    return safeJsonError(
      404,
      "not_found",
      "The requested item was not found.",
      authorization.requestId,
    );
  }

  try {
    await deleteOwnedUpload({ userId: authorization.userId, uploadId: id });
    await recordAuditEvent({
      category: "CONTENT",
      action: "upload_deleted",
      actorType: "USER",
      userId: authorization.userId,
      requestId: authorization.requestId,
      targetType: "upload",
      targetId: id,
    });
    return new Response(null, {
      status: 204,
      headers: {
        ...Object.fromEntries(authorization.rateHeaders),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}
