import { connection } from "next/server";

import { docsUnauthorized, markdownResponse } from "~/docs/markdown";
import { getOrderedDocsPages } from "~/docs/source";
import { canReadMachineDocs } from "~/server/http/docs-authorization";

export async function GET(request: Request): Promise<Response> {
  await connection();
  if (!(await canReadMachineDocs(request))) return docsUnauthorized();

  const links = getOrderedDocsPages()
    .map(
      (page) =>
        `- [${page.data.title}](${page.url === "/docs" ? "/docs.md" : `${page.url}.md`})`,
    )
    .join("\n");
  return markdownResponse(`# Seedyn documentation\n\n${links}\n`);
}
