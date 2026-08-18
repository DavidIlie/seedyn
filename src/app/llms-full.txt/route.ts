import { connection } from "next/server";

import {
  docsUnauthorized,
  markdownResponse,
  pageMarkdown,
} from "~/docs/markdown";
import { getOrderedDocsPages } from "~/docs/source";
import { auth } from "~/server/auth";

export async function GET(): Promise<Response> {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return docsUnauthorized();

  const pages = await Promise.all(getOrderedDocsPages().map(pageMarkdown));
  return markdownResponse(pages.join("\n\n---\n\n"));
}
