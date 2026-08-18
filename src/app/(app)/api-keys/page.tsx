import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateKey } from "~/components/api-keys/create-key";
import { KeyList, KeyListSkeleton } from "~/components/api-keys/key-list";
import { requireSessionUser } from "~/components/data/session";
import { PageHeader } from "~/components/ui/page-header";
import { listApiKeys } from "~/server/api-keys";

export const metadata: Metadata = { title: "API keys" };

export const instant = true;

export default function ApiKeysPage() {
  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="Scoped credentials let scripts and upload clients write to your account. A key is shown once."
      />

      <div className="space-y-8">
        <section aria-labelledby="create-heading">
          <h2 id="create-heading" className="pb-3 text-sm font-medium">
            Create a key
          </h2>
          <CreateKey />
        </section>

        <section aria-labelledby="keys-heading">
          <h2 id="keys-heading" className="pb-3 text-sm font-medium">
            Your keys
          </h2>
          <Suspense fallback={<KeyListSkeleton />}>
            <Keys />
          </Suspense>
        </section>
      </div>
    </>
  );
}

async function Keys() {
  const user = await requireSessionUser();
  const keys = await listApiKeys(user.id);
  return <KeyList keys={keys} />;
}
