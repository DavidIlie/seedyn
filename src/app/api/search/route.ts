import { createFromSource } from "fumadocs-core/search/server";
import { connection } from "next/server";

import { source } from "~/docs/source";
import { auth } from "~/server/auth";

const search = createFromSource(source);

export async function GET(request: Request): Promise<Response> {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      {
        error: {
          code: "unauthenticated",
          message: "Sign in to search the docs.",
        },
      },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const response = await search.GET(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return new Response(response.body, { status: response.status, headers });
}
