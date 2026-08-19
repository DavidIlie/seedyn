import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateKey } from "~/components/api-keys/create-key";
import { KeyList, KeyListSkeleton } from "~/components/api-keys/key-list";
import { requireSessionUser } from "~/components/data/session";
import { PageHeader } from "~/components/ui/page-header";
import { env } from "~/env";
import { listApiKeys } from "~/server/api-keys";
import { listMediaDomainChoices } from "~/server/media/origin-preferences";

export const metadata: Metadata = { title: "API keys" };

export const instant = true;

export default function ApiKeysPage() {
  const mediaDomains = listMediaDomainChoices();
  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="One credential per app or device. Secrets are shown once."
        action={
          <CreateKey appOrigin={env.APP_URL} mediaDomains={mediaDomains} />
        }
      />

      <Suspense fallback={<KeyListSkeleton />}>
        <Keys mediaDomains={mediaDomains} />
      </Suspense>
    </>
  );
}

async function Keys({
  mediaDomains,
}: {
  mediaDomains: ReturnType<typeof listMediaDomainChoices>;
}) {
  const user = await requireSessionUser();
  const keys = await listApiKeys(user.id);
  return <KeyList keys={keys} mediaDomains={mediaDomains} />;
}
