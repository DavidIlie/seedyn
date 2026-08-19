import Link from "next/link";

import { uploadUrl, type UploadPage } from "~/components/data/uploads";
import { EmptyState } from "~/components/ui/empty-state";
import { buttonQuiet, panelSurface } from "~/components/ui/styles";
import type { SerializedUpload } from "~/server/uploads/serialization";

import type { LibraryPath } from "./library-controls";
import { LibraryPresentation } from "./library-presentation";
import { UploadRowSkeleton } from "./upload-row";

export function UploadList({ items }: { items: SerializedUpload[] }) {
  return (
    <LibraryPresentation
      items={items.map((upload) => ({ ...upload, url: uploadUrl(upload) }))}
    />
  );
}

/**
 * The list frame at its resolved geometry, minus the content. Because the row
 * height is fixed, a fallback of the same row count occupies exactly the space
 * the real rows will, so nothing below it moves when they arrive.
 */
export function UploadListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className={panelSurface}>
      {Array.from({ length: rows }, (_, index) => (
        <UploadRowSkeleton key={index} />
      ))}
    </ul>
  );
}

/**
 * Cursor pagination stays in the URL, so a page of results is addressable and
 * the back button returns to the page the user was on.
 */
export function LibraryPagination({
  basePath,
  page,
  params,
  atStart,
}: {
  /**
   * A literal library path rather than a `string`, so `typedRoutes` can verify
   * the composed `path?query` href instead of taking a cast for it.
   */
  basePath: LibraryPath;
  page: UploadPage;
  params: URLSearchParams;
  atStart: boolean;
}) {
  if (!page.nextCursor && atStart) return null;

  const next = new URLSearchParams(params);
  if (page.nextCursor) next.set("cursor", page.nextCursor);

  const start = new URLSearchParams(params);
  start.delete("cursor");

  return (
    <nav aria-label="Pagination" className="flex items-center gap-2 pt-4">
      {atStart ? null : (
        <Link href={`${basePath}?${start.toString()}`} className={buttonQuiet}>
          Back to newest
        </Link>
      )}
      {page.nextCursor ? (
        <Link href={`${basePath}?${next.toString()}`} className={buttonQuiet}>
          Next page
        </Link>
      ) : null}
    </nav>
  );
}

export function LibraryEmpty({
  searching,
  noun,
  action,
}: {
  searching: boolean;
  noun: string;
  action?: React.ReactNode;
}) {
  return searching ? (
    <EmptyState
      title={`No ${noun} match that search`}
      body="Filenames are matched, not URLs or contents. Clear the search to see everything."
      action={action}
    />
  ) : (
    <EmptyState
      title={`No ${noun} yet`}
      body="Upload from this browser or use the HTTP API. Every completed object gets a permanent link."
      action={action}
    />
  );
}
