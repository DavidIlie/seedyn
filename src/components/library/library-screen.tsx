import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  decodeCursor,
  listCredentialChoices,
  listUploadsByKind,
  PAGE_SIZE,
  publicUrl,
  readLibraryTrend,
  type LibraryKind,
  type LibraryScope,
} from "~/components/data/uploads";
import { PageHeader } from "~/components/ui/page-header";
import {
  hasActiveUploadFilters,
  parseUploadFilters,
  readerFromSearchParams,
  uploadFilterParams,
} from "~/lib/upload-filters";
import { readStorageQuota } from "~/server/storage/quota";

import { InfiniteUploadLibrary } from "./infinite-upload-library";

import {
  LibraryControls,
  LibraryControlsSkeleton,
  type LibraryPath,
} from "./library-controls";
import {
  LibraryEmpty,
  LibraryPagination,
  UploadListSkeleton,
} from "./upload-list";
import { LibraryTrendChart } from "./library-trend-chart";

/**
 * The one library screen behind `/images`, `/files`, and `/texts`.
 *
 * The heading, the upload action, and the control and row frames are static and
 * route-derived, so they belong to the shell and survive a navigation between
 * the three siblings. Only the filter values and the rows themselves depend on
 * the URL and the database, and each streams into a fallback of its own size.
 */

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export function LibraryScreen({
  kind,
  path,
  title,
  description,
  noun,
  searchParams,
  action,
}: {
  kind: LibraryKind;
  path: LibraryPath;
  title: string;
  description: string;
  noun: string;
  searchParams: SearchParams;
  /**
   * The page's create affordance. It appears in the header and again in the
   * empty state, so a library with nothing in it is never a dead end.
   */
  action?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={description} action={action} />

      <Suspense fallback={<LibraryTrendSkeleton />}>
        <Trends kind={kind} noun={noun} />
      </Suspense>

      <Suspense fallback={<LibraryControlsSkeleton />}>
        <LibraryFilterControls path={path} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<UploadListSkeleton rows={PAGE_SIZE} />}>
        <LibraryRows
          kind={kind}
          path={path}
          noun={noun}
          searchParams={searchParams}
          action={action}
        />
      </Suspense>
    </>
  );
}

async function Trends({ kind, noun }: { kind: LibraryKind; noun: string }) {
  const user = await requireSessionUser();
  const [trend, storage] = await Promise.all([
    readLibraryTrend({ userId: user.id, kind }),
    readStorageQuota(user.id),
  ]);
  return <LibraryTrendChart trend={trend} storage={storage} noun={noun} />;
}

function LibraryTrendSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-panel mb-7 h-[26rem] animate-pulse rounded-xl border lg:h-[17.5rem]"
    />
  );
}

/**
 * The filter form, resolved against the URL.
 *
 * Exported because the dashboard asks the same question of the whole library
 * that `/images`, `/files`, and `/texts` ask of one kind, and a second copy of
 * this form would be a second filter vocabulary.
 */
export async function LibraryFilterControls({
  path,
  searchParams,
}: {
  path: LibraryPath;
  searchParams: SearchParams;
}) {
  const [params, user] = await Promise.all([
    searchParams,
    requireSessionUser(),
  ]);
  const credentials = await listCredentialChoices(user.id);
  return (
    <LibraryControls
      action={path}
      filters={parseUploadFilters(readerFromSearchParams(params))}
      credentials={credentials}
    />
  );
}

export async function LibraryRows({
  kind,
  path,
  noun,
  searchParams,
  action,
}: {
  kind: LibraryScope;
  path: LibraryPath;
  noun: string;
  searchParams: SearchParams;
  action?: React.ReactNode;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();

  const filters = parseUploadFilters(readerFromSearchParams(params));
  const rawCursor = typeof params.cursor === "string" ? params.cursor : "";
  const cursor = decodeCursor(rawCursor || undefined);
  const narrowed = hasActiveUploadFilters(filters);

  const page = await listUploadsByKind({
    userId: user.id,
    kind,
    filters,
    cursor,
  });

  const carried = uploadFilterParams(filters);

  if (page.items.length === 0) {
    return (
      <>
        <LibraryEmpty
          searching={narrowed}
          noun={noun}
          action={narrowed ? undefined : action}
        />
        <LibraryPagination
          basePath={path}
          page={page}
          params={carried}
          atStart={!cursor}
        />
      </>
    );
  }

  return (
    <InfiniteUploadLibrary
      kind={kind}
      filters={filters}
      initialCursor={rawCursor || null}
      initialPage={{
        ...page,
        items: page.items.map((upload) => ({
          ...upload,
          url: publicUrl(
            upload.publicSlug,
            upload.extension,
            upload.mediaOrigin,
          ),
        })),
      }}
      fallbackNextHref={
        page.nextCursor
          ? `${path}?${new URLSearchParams({
              ...Object.fromEntries(carried),
              cursor: page.nextCursor,
            }).toString()}`
          : null
      }
      backToNewestHref={cursor ? `${path}?${carried.toString()}` : null}
    />
  );
}
