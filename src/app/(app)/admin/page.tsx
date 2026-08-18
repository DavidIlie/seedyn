import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminLedger } from "~/components/admin/admin-ledger";
import { PageHeader } from "~/components/ui/page-header";
import { loadAdminInsights } from "~/server/admin/insights";
import { parseAdminRange } from "~/server/admin/insights-view";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const instant = true;

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="All users, stored content, and upload activity."
      />
      <Suspense fallback={<AdminLedgerSkeleton />}>
        <AdminContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function AdminContent({
  searchParams,
}: {
  searchParams: PageProps<"/admin">["searchParams"];
}) {
  const query = await searchParams;
  const rangeDays = parseAdminRange(query.range);
  const insights = await loadAdminInsights(rangeDays);
  return <AdminLedger insights={insights} />;
}

function AdminLedgerSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-8 pb-16">
      <div className="border-border bg-panel grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="border-border space-y-3 border-r border-b px-4 py-4 last:col-span-2 lg:border-b-0 lg:last:col-span-1"
          >
            <div className="bg-border h-3 w-20 rounded" />
            <div className="bg-border h-6 w-24 rounded" />
            <div className="bg-border h-3 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <div className="border-border bg-panel h-[22rem] rounded-xl border" />
        <div className="border-border bg-panel h-[22rem] rounded-xl border" />
      </div>
      <div className="border-border bg-panel h-52 rounded-xl border" />
    </div>
  );
}
