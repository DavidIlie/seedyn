import {
  authorizeBrowserControlRead,
  authorizeBrowserMutation,
} from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import {
  abortOwnedDirectUpload,
  readDirectUploadStatus,
} from "~/server/uploads/direct/session";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const authorization = await authorizeBrowserControlRead(request);
  if (authorization instanceof Response) return authorization;
  try {
    const { sessionId } = await context.params;
    const status = await readDirectUploadStatus({
      sessionId,
      userId: authorization.userId,
    });
    authorization.rateHeaders.set("Cache-Control", "private, no-store");
    return Response.json(status, { headers: authorization.rateHeaders });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  try {
    const { sessionId } = await context.params;
    await abortOwnedDirectUpload({
      sessionId,
      userId: authorization.userId,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    return new Response(null, {
      status: 204,
      headers: authorization.rateHeaders,
    });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}
