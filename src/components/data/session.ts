import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getOptionalUser } from "~/server/auth";

/**
 * The UI's convenience redirect, not the authorization boundary.
 *
 * Every service call still takes a user id and enforces ownership itself, so a
 * shell that renders before this resolves cannot show another user's data. See
 * `plans/spec/05-AUTH-AND-SECURITY.md`.
 */
export async function requireSessionUser() {
  // Auth.js may generate request-scoped random values before its cookie read.
  // Tell Cache Components that the entire authentication check belongs to the
  // request so those values are never inspected during prerendering.
  await connection();

  const user = await getOptionalUser();
  if (!user) redirect("/sign-in");
  return user;
}
