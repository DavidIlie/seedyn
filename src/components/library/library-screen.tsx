import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  decodeCursor,
  listUploadsByKind,
  PAGE_SIZE,
  type LibraryKind,
} from "~/components/data/uploads";
import { PageHeader } from "~/components/ui/page-header";
import { UploadAction } from "~/components/upload/upload-action";
import { normalizeUploadSearchQuery } from "~/lib/upload-search";

import {
  LibraryControls,
  LibraryControlsSkeleton,
  type LibraryPath,
} from "./library-controls";
import {
  LibraryEmpty,
  LibraryPagination,
  UploadList,
  UploadListSkeleton,
} from "./upload-list";

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
  uploadLabel,
  searchParams,
}: {
  kind: LibraryKind;
  path: LibraryPath;
  title: string;
  description: string;
  noun: string;
  uploadLabel: string;
  searchParams: SearchParams;
}) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={description}
        action={<UploadAction label={uploadLabel} />}
      />

      <Suspense fallback={<LibraryControlsSkeleton />}>
        <Controls path={path} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<UploadListSkeleton rows={PAGE_SIZE} />}>
        <Rows
          kind={kind}
          path={path}
          noun={noun}
          uploadLabel={uploadLabel}
          searchParams={searchParams}
        />
      </Suspense>
    </>
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
  uploadLabel,
  searchParams,
}: {
  kind: LibraryKind;
  path: LibraryPath;
  noun: string;
  uploadLabel: string;
  searchParams: SearchParams;
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
          action={<UploadAction label={uploadLabel} />}
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
    <>
      <UploadList items={page.items} />
      <LibraryPagination
        basePath={path}
        page={page}
        params={carried}
        atStart={!cursor}
      />
    </>
  );
}
