import type { Metadata } from "next";
import { cache, Suspense } from "react";

import { AdminFleet, AdminOperations } from "~/components/admin/admin-ledger";
import { AdminAuditLog } from "~/components/admin/admin-audit-log";
import { AdminUploadInventory } from "~/components/admin/admin-upload-inventory";
import { AdminUserTable } from "~/components/admin/admin-user-table";
import { PageHeader } from "~/components/ui/page-header";
import { loadAdminOverview, loadAdminUserPage } from "~/server/admin/insights";
import { loadAdminUploadPage } from "~/server/admin/uploads";
import { loadAdminAuditPage } from "~/server/admin/audit";
import {
  parseAdminRange,
  parseAdminUserView,
} from "~/server/admin/insights-view";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const instant = true;

const loadOverview = cache(loadAdminOverview);

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="People, storage, and upload operations."
      />
      <div className="space-y-8 pb-16">
        <Suspense fallback={<FleetSkeleton />}>
          <FleetContent searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<PeopleSkeleton />}>
          <PeopleContent searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<OperationsSkeleton />}>
          <OperationsContent searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<ContentSkeleton />}>
          <ContentContent />
        </Suspense>
        <Suspense fallback={<OperationsSkeleton />}>
          <AuditContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function AuditContent({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const query = await searchParams;
  const candidate = Array.isArray(query.auditCursor)
    ? query.auditCursor[0]
    : query.auditCursor;
  const cursor =
    typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      candidate,
    )
      ? candidate
      : undefined;
  return (
    <AdminAuditLog
      page={await loadAdminAuditPage(cursor)}
      paged={Boolean(cursor)}
    />
  );
}

async function FleetContent({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const query = await searchParams;
  const overview = await loadOverview(parseAdminRange(query.range));
  return <AdminFleet overview={overview} />;
}

async function PeopleContent({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const query = await searchParams;
  const rangeDays = parseAdminRange(query.range);
  const users = await loadAdminUserPage(parseAdminUserView(query));
  return <AdminUserTable users={users} rangeDays={rangeDays} />;
}

async function OperationsContent({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const query = await searchParams;
  const rangeDays = parseAdminRange(query.range);
  const userView = parseAdminUserView(query);
  const overview = await loadOverview(rangeDays);
  return <AdminOperations overview={overview} userView={userView} />;
}

async function ContentContent() {
  const initialPage = await loadAdminUploadPage();
  return <AdminUploadInventory initialPage={initialPage} />;
}

function FleetSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border grid grid-cols-2 border-y lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="border-border space-y-3 border-r px-4 py-4 last:border-r-0"
        >
          <div className="bg-border h-3 w-20 rounded" />
          <div className="bg-border h-7 w-24 rounded" />
          <div className="bg-border h-3 w-28 rounded" />
        </div>
      ))}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border flex items-center gap-3 border-b px-5 py-4">
        <div className="bg-border size-9 rounded-lg" />
        <div className="space-y-2">
          <div className="bg-border h-4 w-24 rounded" />
          <div className="bg-border h-3 w-64 max-w-full rounded" />
        </div>
      </div>
      <div className="bg-sunken/45 border-border h-16 border-b" />
      <div className="h-36" />
      <div className="border-border h-14 border-t" />
    </div>
  );
}

function OperationsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-panel h-72 rounded-xl border"
    />
  );
}

function ContentSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-panel h-80 rounded-xl border"
    />
  );
}
