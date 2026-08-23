import type { Metadata } from "next";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  DASHBOARD_RECENT_COUNT,
  listRecentUploads,
  readUploadTotals,
} from "~/components/data/uploads";
import {
  UploadList,
  UploadListSkeleton,
} from "~/components/library/upload-list";
import { formatBytes } from "~/components/lib/format";
import { EmptyState } from "~/components/ui/empty-state";
import { PageHeader } from "~/components/ui/page-header";
import { UploadAction } from "~/components/upload/upload-button";

export const metadata: Metadata = { title: "Library" };

/**
 * Heading, one muted total, ten real rows.
 *
 * There are no stat tiles. A four-card grid of counts is four queries whose
 * only job is to look like a dashboard; the same information fits in one line
 * of subtitle, and the rows below it are the thing anyone actually came for.
 */
export const instant = true;

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Library"
        subtitle={
          <Suspense fallback={<TotalsFallback />}>
            <Totals />
          </Suspense>
        }
      />

      <section aria-labelledby="latest-heading">
        <h2 id="latest-heading" className="pb-3 text-sm font-medium">
          Latest uploads
        </h2>
        <Suspense
          fallback={<UploadListSkeleton rows={DASHBOARD_RECENT_COUNT} />}
        >
          <LatestUploads />
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

async function LatestUploads() {
  const user = await requireSessionUser();
  const uploads = await listRecentUploads(user.id, DASHBOARD_RECENT_COUNT);

  if (uploads.length === 0) {
    return (
      <EmptyState
        title="Nothing uploaded yet"
        body="Upload a local file, paste one, or fetch an eligible HTTPS URL. Every completed object gets a permanent link."
        action={<UploadAction label="Choose a file" variant="outline" />}
      />
    );
  }

  return <UploadList items={uploads} />;
}
