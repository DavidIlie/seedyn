import { isAppHostRequest, requestSourceAddress } from "~/server/http/request";
import { handleS3GatewayRequest } from "~/server/s3/gateway";
import { getS3GatewayAdapter } from "~/server/s3/integration";
import { unsupportedS3Method } from "~/server/s3/route-methods";

export const maxDuration = 120;

export const GET = unsupportedS3Method;
export const OPTIONS = unsupportedS3Method;
export const PATCH = unsupportedS3Method;
export const POST = unsupportedS3Method;

type Context = Readonly<{
  params: Promise<{ key: string[] }>;
}>;

async function dispatch(
  request: Request,
  context: Context,
  method: "DELETE" | "HEAD" | "PUT",
  operation: "DeleteObject" | "HeadObject" | "PutObject",
): Promise<Response> {
  if (!isAppHostRequest(request)) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const { key } = await context.params;
  return handleS3GatewayRequest({
    adapter: await getS3GatewayAdapter(),
    keyParts: key,
    method,
    operation,
    request,
    sourceAddress: requestSourceAddress(request),
  });
}

export function PUT(request: Request, context: Context): Promise<Response> {
  return dispatch(request, context, "PUT", "PutObject");
}

export function HEAD(request: Request, context: Context): Promise<Response> {
  return dispatch(request, context, "HEAD", "HeadObject");
}

export function DELETE(request: Request, context: Context): Promise<Response> {
  return dispatch(request, context, "DELETE", "DeleteObject");
}
