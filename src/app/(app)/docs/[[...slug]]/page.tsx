import type { Metadata } from "next";
import {
  DocsBody,
  DocsDescription,
  DocsPage as FumadocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import { getMDXComponents } from "~/docs/mdx-components";
import { getDocsPage } from "~/docs/source";

export const metadata: Metadata = { title: "Docs" };

/**
 * The article is never prerendered. Every representation of these docs is
 * behind the session (decision D-025), so the content renders only after
 * `requireSessionUser()` resolves — a static shell containing the prose would
 * hand it to a signed-out visitor in the moment before the redirect commits.
 */
export const instant = true;

export default function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: { params: Promise<{ slug?: string[] }> }) {
  await requireSessionUser();

  const { slug } = await params;
  const page = getDocsPage(slug);
  if (!page) notFound();

  const Body = page.data.body;

  return (
    <FumadocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Body components={getMDXComponents()} />
      </DocsBody>
    </FumadocsPage>
  );
}

function ArticleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading documentation"
      className="mx-auto max-w-[68ch] space-y-4 px-6 py-12 [grid-area:main]"
    >
      <div className="bg-border h-8 w-2/3 rounded" />
      <div className="bg-border h-4 w-1/2 rounded" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="bg-border h-4 rounded"
            style={{ width: `${index % 3 === 2 ? 60 : 100}%` }}
          />
        ))}
      </div>
      <span className="sr-only">Loading documentation</span>
    </div>
  );
}
