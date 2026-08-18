"use server";

import { signOut } from "~/server/auth";
import { authorizeServerActionMutation } from "~/server/http/browser-mutation";

/**
 * Ends the local database session. DavidApps' global session is not touched —
 * signing out of Seedyn is not signing out of the identity provider, and the
 * copy says so.
 */
export async function signOutAction(): Promise<void> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) return;
  await signOut({ redirectTo: "/sign-in" });
}
