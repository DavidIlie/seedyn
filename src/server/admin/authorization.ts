import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireSessionUser } from "~/components/data/session";

/**
 * Cross-user reads are intentionally hidden behind a uniform 404. The role is
 * sourced from DavidApps' verified application claim (or the loopback-only
 * development provider), never from an email comparison.
 */
export const requireAdmin = cache(async () => {
  const user = await requireSessionUser();
  if (user.appRole !== "ADMIN") notFound();
  return user;
});
