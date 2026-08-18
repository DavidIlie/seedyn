import { env } from "~/env";

import type { source } from "./source";

export async function pageMarkdown(
  page: (typeof source)["$inferPage"],
): Promise<string> {
  const markdown = await page.data.getText("processed");
  const canonical = `${env.APP_URL}${page.url}`;
  const markdownUrl =
    page.url === "/docs"
      ? `${env.APP_URL}/docs.md`
      : `${env.APP_URL}${page.url}.md`;

  return `# ${page.data.title}\n\n${page.data.description ? `> ${page.data.description}\n\n` : ""}- Canonical: ${canonical}\n- Markdown: ${markdownUrl}\n\n${markdown}`;
}

export function markdownResponse(
  body: string,
  canonicalPath?: string,
): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Content-Language": "en",
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept, Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (canonicalPath) {
    headers.set(
      "Link",
      `<${env.APP_URL}${canonicalPath}>; rel="canonical"; type="text/html"`,
    );
  }
  return new Response(body, { headers });
}

export function docsUnauthorized(): Response {
  return Response.json(
    {
      error: { code: "unauthenticated", message: "Sign in to read the docs." },
    },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  );
}
