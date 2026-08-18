import { connection } from "next/server";

import { docsUnauthorized, markdownResponse } from "~/docs/markdown";
import { getOrderedDocsPages } from "~/docs/source";
import { auth } from "~/server/auth";

export async function GET(): Promise<Response> {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return docsUnauthorized();

  const links = getOrderedDocsPages()
    .map(
      (page) =>
        `- [${page.data.title}](${page.url === "/docs" ? "/docs.md" : `${page.url}.md`})`,
    )
    .join("\n");
  return markdownResponse(`# Seedyn documentation\n\n${links}\n`);
}
