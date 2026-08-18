import { DocsLayout as FumadocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Suspense, type CSSProperties } from "react";

import { requireSessionUser } from "~/components/data/session";
import { source } from "~/docs/source";

/** Keep Fumadocs' client contexts out of the upload tool's non-doc routes. */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RootProvider
      search={{ options: { api: "/api/search" } }}
      theme={{ enabled: false }}
    >
      <div data-seedyn-docs>
        <Suspense fallback={<DocsFrameSkeleton />}>
          <ProtectedDocsFrame>{children}</ProtectedDocsFrame>
        </Suspense>
      </div>
    </RootProvider>
  );
}

/**
 * The page tree contains every protected title and URL. Gate it just like the
 * prose instead of shipping a signed-out sidebar that redirects afterwards.
 */
async function ProtectedDocsFrame({ children }: { children: React.ReactNode }) {
  await requireSessionUser();

  return (
    <FumadocsLayout
      tree={source.pageTree}
      nav={{ title: "Seedyn docs", url: "/docs" }}
      sidebar={{ prefetch: true }}
      tabs={false}
      themeSwitch={{ enabled: false }}
      containerProps={{
        className: "seedyn-docs-layout",
        style: {
          // Fumadocs owns a second sticky header. Its stock layout assumes it
          // starts at the viewport edge, so include Seedyn's 56px app header in
          // every internal sticky-row calculation.
          "--fd-docs-row-1": "calc(var(--fd-banner-height, 0px) + 3.5rem)",
        } as CSSProperties,
      }}
    >
      {children}
    </FumadocsLayout>
  );
}

function DocsFrameSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading documentation"
      className="min-h-[calc(100dvh-3.5rem)]"
    >
      <div aria-hidden="true">
        <div className="border-border flex h-14 items-center border-b px-4 md:pl-[18.25rem]">
          <div className="bg-border h-4 w-28 rounded-sm" />
        </div>
        <div className="grid min-h-[calc(100dvh-7rem)] md:grid-cols-[16.75rem_minmax(0,1fr)] xl:grid-cols-[16.75rem_minmax(0,56.25rem)_16.75rem]">
          <aside className="border-border hidden border-r p-5 md:block">
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, index) => (
                <div
                  key={index}
                  className="bg-border h-4 rounded-sm"
                  style={{ width: `${index % 3 === 0 ? 55 : 78}%` }}
                />
              ))}
            </div>
          </aside>
          <div className="w-full max-w-[56.25rem] space-y-4 px-4 py-10 md:px-8">
            <div className="bg-border h-4 w-24 rounded-sm" />
            <div className="bg-border h-8 w-2/3 rounded-sm" />
            <div className="bg-border h-4 w-1/2 rounded-sm" />
          </div>
          <aside className="hidden p-8 xl:block">
            <div className="bg-border h-4 w-24 rounded-sm" />
          </aside>
        </div>
      </div>
      <span className="sr-only">Loading documentation</span>
    </div>
  );
}
