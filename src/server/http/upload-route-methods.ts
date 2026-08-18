import "server-only";

import { isAppHostRequest, isMediaHostRequest } from "./request";

const ALLOW = "OPTIONS, POST";

function response(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      Allow: ALLOW,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Upload paths bypass Proxy so Next never clones their multipart POST bodies.
 * Explicit handlers preserve the host boundary for every bodyless method that
 * Next would otherwise auto-answer before application code can inspect Host.
 */
export function uploadMethodNotAllowed(request: Request): Response {
  if (isAppHostRequest(request)) return response(405);
  if (isMediaHostRequest(request)) return response(404);
  return response(421);
}

export function uploadOptions(request: Request): Response {
  return isAppHostRequest(request)
    ? response(204)
    : uploadMethodNotAllowed(request);
}
