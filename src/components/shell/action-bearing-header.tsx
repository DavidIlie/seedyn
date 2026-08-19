import { connection } from "next/server";

import { UploadAction } from "~/components/upload/upload-action";
import { getOptionalUser } from "~/server/auth";

import { AccountMenu } from "./account-menu";
import { AccountMenuPlaceholder } from "./account-menu-placeholder";
import { CurrentRouteNav } from "./current-route-nav";
import { SignOutForm } from "./sign-out-form";

/**
 * Server Action references are request-specific in Next.js 16.3. Keep their
 * serialization out of the prerendered header while the surrounding Suspense
 * boundary preserves the complete, inert shell.
 */
export async function ActionBearingHeader() {
  await connection();
  const user = await getOptionalUser();

  return (
    <>
      <CurrentRouteNav />
      <UploadAction className="lg:ml-auto" compactOnNarrow />
      {user ? (
        <AccountMenu
          identity={{
            name: user.name ?? null,
            email: user.email ?? null,
            appRole: user.appRole,
          }}
          signOut={<SignOutForm />}
        />
      ) : (
        <AccountMenuPlaceholder />
      )}
    </>
  );
}
