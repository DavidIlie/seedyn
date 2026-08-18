import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  docsUnauthorized,
  markdownResponse,
  pageMarkdown,
} from "~/docs/markdown";
import { getDocsPage, source } from "~/docs/source";
import { auth } from "~/server/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  await connection();
  const session = await auth();
  if (!session?.user?.id) return docsUnauthorized();

  const { slug } = await context.params;
  const page = getDocsPage(slug);
  if (!page) notFound();
  return markdownResponse(await pageMarkdown(page), page.url);
}

export const generateStaticParams = () => source.generateParams();
