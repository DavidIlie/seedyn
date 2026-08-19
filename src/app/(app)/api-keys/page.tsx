import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateKey } from "~/components/api-keys/create-key";
import { KeyList, KeyListSkeleton } from "~/components/api-keys/key-list";
import { requireSessionUser } from "~/components/data/session";
import { PageHeader } from "~/components/ui/page-header";
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
        subtitle="Create credentials for HTTP clients, ShareX, Shottr, and compatible S3 clients. Secrets are shown once."
      />

      <div className="space-y-8">
        <section aria-labelledby="create-heading">
          <h2 id="create-heading" className="pb-3 text-sm font-medium">
            Create a key
          </h2>
          <p className="text-muted-foreground -mt-1 mb-3 max-w-2xl text-sm">
            For S3, create the named API key first. Then select{" "}
            <span className="text-foreground font-medium">Enable S3</span> on
            that key to generate its separate Access Key ID and one-time Secret
            Access Key.
          </p>
          <CreateKey mediaDomains={mediaDomains} />
        </section>

        <section aria-labelledby="keys-heading">
          <h2 id="keys-heading" className="pb-3 text-sm font-medium">
            Your keys
          </h2>
          <Suspense fallback={<KeyListSkeleton />}>
            <Keys mediaDomains={mediaDomains} />
          </Suspense>
        </section>
      </div>
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
