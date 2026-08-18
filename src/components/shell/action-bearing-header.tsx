import { connection } from "next/server";

import { UploadAction } from "~/components/upload/upload-action";

import { CurrentRouteNav } from "./current-route-nav";
import { SignOutForm } from "./sign-out-form";

/**
 * Server Action references are request-specific in Next.js 16.3. Keep their
 * serialization out of the prerendered header while the surrounding Suspense
 * boundary preserves the complete, inert shell.
 */
export async function ActionBearingHeader() {
  await connection();

  return (
    <>
      <CurrentRouteNav signOut={<SignOutForm />} />
      <UploadAction className="lg:ml-auto" />
      <SignOutForm className="hidden lg:block" />
    </>
  );
}
