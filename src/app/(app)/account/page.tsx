import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountMediaDomainForm } from "~/components/account/media-domain-form";
import { requireSessionUser } from "~/components/data/session";
import { PageHeader } from "~/components/ui/page-header";
import { db } from "~/server/db";
import {
  listMediaDomainChoices,
  resolveMediaDomainPreference,
} from "~/server/media/origin-preferences";

export const metadata: Metadata = { title: "Account" };

export const instant = true;

export default function AccountPage() {
  return (
    <>
      <PageHeader
        title="Account"
        subtitle="Choose how Seedyn names links created from this account."
      />
      <Suspense fallback={<AccountDomainSkeleton />}>
        <AccountDomain />
      </Suspense>
    </>
  );
}

async function AccountDomain() {
  const user = await requireSessionUser();
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { defaultMediaDomain: true },
  });
  const mediaDomains = listMediaDomainChoices();
  const current = resolveMediaDomainPreference(account?.defaultMediaDomain);

  return (
    <AccountMediaDomainForm
      key={current.id}
      currentDomain={current.id}
      mediaDomains={mediaDomains}
    />
  );
}

function AccountDomainSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-panel h-52 max-w-2xl animate-pulse rounded-xl border"
    />
  );
}
