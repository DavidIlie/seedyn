import { isAppHostRequest, requestSourceAddress } from "~/server/http/request";
import { getS3GatewayAdapter } from "~/server/s3/integration";
import { handleS3GatewayRequest } from "~/server/s3/gateway";
import { unsupportedS3Method } from "~/server/s3/route-methods";

export const maxDuration = 120;

export const DELETE = unsupportedS3Method;
export const GET = unsupportedS3Method;
export const OPTIONS = unsupportedS3Method;
export const PATCH = unsupportedS3Method;
export const POST = unsupportedS3Method;
export const PUT = unsupportedS3Method;

export async function HEAD(request: Request): Promise<Response> {
  if (!isAppHostRequest(request)) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return handleS3GatewayRequest({
    adapter: await getS3GatewayAdapter(),
    method: "HEAD",
    operation: "HeadBucket",
    request,
    sourceAddress: requestSourceAddress(request),
  });
}
