import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { completeDirectUpload } from "~/server/uploads/direct/session";

export const maxDuration = 900;

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  try {
    const { sessionId } = await context.params;
    const result = await completeDirectUpload({
      sessionId,
      userId: authorization.userId,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    return Response.json(result, {
      status: result.state === "verifying" ? 202 : 200,
      headers: authorization.rateHeaders,
    });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}
