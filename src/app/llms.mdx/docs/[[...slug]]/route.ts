import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  docsUnauthorized,
  markdownResponse,
  pageMarkdown,
} from "~/docs/markdown";
import { getDocsPage, source } from "~/docs/source";
import { canReadMachineDocs } from "~/server/http/docs-authorization";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  await connection();
  if (!(await canReadMachineDocs(request))) return docsUnauthorized();

  const { slug } = await context.params;
  const page = getDocsPage(slug);
  if (!page) notFound();
  return markdownResponse(await pageMarkdown(page), page.url);
}

export const generateStaticParams = () => source.generateParams();
