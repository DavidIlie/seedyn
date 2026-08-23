import { connection } from "next/server";

import {
  docsUnauthorized,
  markdownResponse,
  pageMarkdown,
} from "~/docs/markdown";
import { getOrderedDocsPages } from "~/docs/source";
import { canReadMachineDocs } from "~/server/http/docs-authorization";

export async function GET(request: Request): Promise<Response> {
  await connection();
  if (!(await canReadMachineDocs(request))) return docsUnauthorized();

  const pages = await Promise.all(getOrderedDocsPages().map(pageMarkdown));
  return markdownResponse(pages.join("\n\n---\n\n"));
}
