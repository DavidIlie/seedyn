import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getOptionalUser } from "~/server/auth";

/**
 * `/` is a router, not a page. It has no UI of its own, so there is no shell
 * worth committing before the session resolves — blocking here is the honest
 * behaviour rather than a structure to fix.
 */
export const instant = false;

export default async function RootPage(): Promise<never> {
  await connection();
  const user = await getOptionalUser();
  redirect(user ? "/dashboard" : "/sign-in");
}
