import type { Metadata } from "next";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import { PAGE_SIZE, readUploadTotals } from "~/components/data/uploads";
import { LibraryControlsSkeleton } from "~/components/library/library-controls";
import {
  LibraryFilterControls,
  LibraryRows,
  type SearchParams,
} from "~/components/library/library-screen";
import { UploadListSkeleton } from "~/components/library/upload-list";
import { formatBytes } from "~/components/lib/format";
import { PageHeader } from "~/components/ui/page-header";
import { UploadAction } from "~/components/upload/upload-button";

export const metadata: Metadata = { title: "Library" };

/**
 * Heading, one muted total, and the whole library.
 *
 * There are no stat tiles. A four-card grid of counts is four queries whose
 * only job is to look like a dashboard; the same information fits in one line
 * of subtitle, and the rows below it are the thing anyone actually came for.
 *
 * This is the only view that crosses kinds, which makes it the one place a
 * filter is worth the most: "the 4 GB video I pushed from ShareX last March"
 * is not a question you can ask on a page that only holds images. It runs the
 * same controls as the per-kind libraries against a scope of `all`, so there is
 * one filter vocabulary in the product rather than two.
 */
export const instant = true;

export default function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <PageHeader
        title="Library"
        subtitle={
          <Suspense fallback={<TotalsFallback />}>
            <Totals />
          </Suspense>
        }
        action={<UploadAction />}
      />

      <Suspense fallback={<LibraryControlsSkeleton />}>
        <LibraryFilterControls path="/dashboard" searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="latest-heading">
        <h2 id="latest-heading" className="pb-3 text-sm font-medium">
          Uploads
        </h2>
        <Suspense fallback={<UploadListSkeleton rows={PAGE_SIZE} />}>
          <LibraryRows
            kind="all"
            path="/dashboard"
            noun="uploads"
            searchParams={searchParams}
            action={<UploadAction label="Choose a file" variant="outline" />}
          />
        </Suspense>
      </section>
    </>
  );
}

function TotalsFallback() {
  return (
    <span
      aria-hidden="true"
      className="bg-border inline-block h-4 w-44 rounded align-middle"
    />
  );
}

async function Totals() {
  const user = await requireSessionUser();
  const totals = await readUploadTotals(user.id);
  return (
    <>
      {totals.count.toLocaleString("en-US")}{" "}
      {totals.count === 1 ? "upload" : "uploads"} ·{" "}
      {formatBytes(totals.byteSize)} stored
    </>
  );
}
