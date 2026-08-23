import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  decodeCursor,
  listUploadsByKind,
  PAGE_SIZE,
  publicUrl,
  readLibraryTrend,
  type LibraryKind,
} from "~/components/data/uploads";
import { PageHeader } from "~/components/ui/page-header";
import { normalizeUploadSearchQuery } from "~/lib/upload-search";
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

function first(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function readOrder(value: string | string[] | undefined): "newest" | "oldest" {
  return first(value) === "oldest" ? "oldest" : "newest";
}

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
        <Controls path={path} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<UploadListSkeleton rows={PAGE_SIZE} />}>
        <Rows
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

async function Controls({
  path,
  searchParams,
}: {
  path: LibraryPath;
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return (
    <LibraryControls
      action={path}
      query={first(params.q)}
      order={readOrder(params.order)}
    />
  );
}

async function Rows({
  kind,
  path,
  noun,
  searchParams,
  action,
}: {
  kind: LibraryKind;
  path: LibraryPath;
  noun: string;
  searchParams: SearchParams;
  action?: React.ReactNode;
}) {
  const params = await searchParams;
  const user = await requireSessionUser();

  const query = normalizeUploadSearchQuery(first(params.q));
  const order = readOrder(params.order);
  const rawCursor = first(params.cursor);
  const cursor = decodeCursor(rawCursor || undefined);

  const page = await listUploadsByKind({
    userId: user.id,
    kind,
    query,
    order,
    cursor,
  });

  const carried = new URLSearchParams();
  if (query) carried.set("q", query);
  if (order === "oldest") carried.set("order", order);

  if (page.items.length === 0) {
    return (
      <>
        <LibraryEmpty
          searching={query.length > 0}
          noun={noun}
          action={query.length > 0 ? undefined : action}
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
      query={query}
      order={order}
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
