import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  DASHBOARD_RECENT_COUNT,
  hasActiveApiKey,
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
import { buttonQuiet } from "~/components/ui/styles";
import { UploadAction } from "~/components/upload/upload-action";

export const metadata: Metadata = { title: "Dashboard" };

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
        title="Dashboard"
        subtitle={
          <Suspense fallback={<TotalsFallback />}>
            <Totals />
          </Suspense>
        }
        action={<UploadAction />}
      />

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="pb-3 text-sm font-medium">
          Recent uploads
        </h2>
        <Suspense
          fallback={<UploadListSkeleton rows={DASHBOARD_RECENT_COUNT} />}
        >
          <Recent />
        </Suspense>
      </section>

      {/*
        Onboarding sits below the list and streams into nothing, so the rows
        above it never move when it resolves — and when a key already exists it
        renders nothing at all.
      */}
      <Suspense fallback={null}>
        <ShareXOnboarding />
      </Suspense>
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

async function Recent() {
  const user = await requireSessionUser();
  const uploads = await listRecentUploads(user.id, DASHBOARD_RECENT_COUNT);

  if (uploads.length === 0) {
    return (
      <EmptyState
        title="Nothing uploaded yet"
        body="Uploads from ShareX and from this browser both land here, each with a permanent URL."
        action={<UploadAction label="Upload a file" />}
      />
    );
  }

  return <UploadList items={uploads} />;
}

async function ShareXOnboarding() {
  const user = await requireSessionUser();
  if (await hasActiveApiKey(user.id)) return null;

  return (
    <section
      aria-labelledby="sharex-heading"
      className="border-border mt-8 rounded-md border p-4"
    >
      <h2 id="sharex-heading" className="text-sm font-medium">
        ShareX is not set up
      </h2>
      <p className="text-muted-foreground mt-1 max-w-prose text-sm">
        Create an API key to get a ready-to-import ShareX configuration. The key
        is shown once, at creation, and the configuration file contains it.
      </p>
      <Link href="/api-keys" className={`${buttonQuiet} mt-4`}>
        Set up ShareX
      </Link>
    </section>
  );
}
