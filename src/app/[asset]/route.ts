import {
  GET as serveGet,
  HEAD as serveHead,
  OPTIONS as serveOptions,
  POST as servePost,
} from "../internal/media/[asset]/route";
import { isMediaHostRequest } from "~/server/http/request";

type Context = { params: Promise<{ asset: string }> };

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Exact root-level media paths bypass Proxy so a password form POST reaches
// this streaming handler without Next cloning its body first. Repeat the host
// check before calling the shared handler: this also ensures a caller cannot
// forge the internal rewrite marker on the app or an unknown Host.
export function GET(request: Request, context: Context): Promise<Response> {
  return isMediaHostRequest(request)
    ? serveGet(request, context)
    : Promise.resolve(notFound());
}

export function HEAD(request: Request, context: Context): Promise<Response> {
  return isMediaHostRequest(request)
    ? serveHead(request, context)
    : Promise.resolve(notFound());
}

export function POST(request: Request, context: Context): Promise<Response> {
  return isMediaHostRequest(request)
    ? servePost(request, context)
    : Promise.resolve(notFound());
}

export function OPTIONS(request: Request): Response {
  return isMediaHostRequest(request) ? serveOptions(request) : notFound();
}
