import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import { getMDXComponents } from "~/docs/mdx-components";
import { getDocsPage, getOrderedDocsPages } from "~/docs/source";

export const metadata: Metadata = { title: "Docs" };

/**
 * Documentation inside the application, not beside it.
 *
 * There is no docs sidebar and no second header. The six destinations in the app
 * header are the only navigation in the product, and a documentation tree rail
 * would be a competing one; with nine pages, an inline index at the foot of each
 * article is both smaller and easier to operate by keyboard.
 *
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
    <div className="py-8">
      <Suspense fallback={<ArticleSkeleton />}>
        <Article params={params} />
      </Suspense>
    </div>
  );
}

async function Article({ params }: { params: Promise<{ slug?: string[] }> }) {
  await requireSessionUser();

  const { slug } = await params;
  const page = getDocsPage(slug);
  if (!page) notFound();

  const Body = page.data.body;

  return (
    <article className="max-w-[68ch]">
      <h1 className="text-2xl font-semibold tracking-tight">
        {page.data.title}
      </h1>
      {page.data.description ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {page.data.description}
        </p>
      ) : null}

      <div className="prose mt-8 max-w-none">
        <Body components={getMDXComponents()} />
      </div>

      <DocsIndex currentUrl={page.url} />
    </article>
  );
}

function DocsIndex({ currentUrl }: { currentUrl: string }) {
  const pages = getOrderedDocsPages();

  return (
    <nav
      aria-label="Documentation"
      className="border-border mt-12 border-t pt-6"
    >
      <h2 className="text-sm font-medium">Documentation</h2>
      <ul className="mt-3 space-y-1">
        {pages.map((entry) => {
          const current = entry.url === currentUrl;
          return (
            <li key={entry.url}>
              <Link
                // Fumadocs builds these from `content/docs`, so they are
                // `/docs/...` by construction but only `string` to TypeScript.
                href={entry.url as Route}
                aria-current={current ? "page" : undefined}
                className={
                  "text-sm " +
                  (current
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {entry.data.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ArticleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading documentation"
      className="max-w-[68ch] space-y-4"
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
