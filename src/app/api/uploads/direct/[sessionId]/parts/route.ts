import { z } from "zod";

import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import { domainErrorResponse } from "~/server/http/errors";
import { readBoundedJson } from "~/server/http/json-body";
import { signDirectUploadParts } from "~/server/uploads/direct/session";
import { DomainError } from "~/server/uploads/errors";

type RouteContext = { params: Promise<{ sessionId: string }> };

const bodySchema = z.object({
  partNumbers: z.array(z.number().int()).min(1).max(12),
});

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) return authorization;
  try {
    const body = bodySchema.safeParse(await readBoundedJson(request));
    if (!body.success) throw new DomainError("invalid_input");
    const { sessionId } = await context.params;
    const result = await signDirectUploadParts({
      sessionId,
      userId: authorization.userId,
      partNumbers: body.data.partNumbers,
    });
    authorization.rateHeaders.set("Cache-Control", "no-store");
    return Response.json(result, { headers: authorization.rateHeaders });
  } catch (error) {
    return domainErrorResponse(error, authorization.requestId);
  }
}
