import "server-only";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { authorizeBrowserMutation } from "~/server/http/browser-mutation";
import {
  createRequestId,
  isAppHostRequest,
  safeJsonError,
} from "~/server/http/request";

export type AuthorizedAdminRequest = {
  requestId: string;
  userId: string;
  rateHeaders?: Headers;
};

export function adminNotFound(requestId: string): Response {
  return safeJsonError(404, "not_found", "Not found.", requestId);
}

async function currentlyHasAdminRole(userId: string): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { id: userId, appRole: "ADMIN" },
    select: { id: true },
  });
  return Boolean(user);
}

/**
 * Admin content reads stay on the application host and re-check the persisted
 * role. A missing session, a stale role claim, and a missing resource all use
 * the same 404 envelope so this route cannot be used as an account oracle.
 */
export async function authorizeAdminRead(
  request: Request,
): Promise<AuthorizedAdminRequest | Response> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) return adminNotFound(requestId);

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !(await currentlyHasAdminRole(userId))) {
      return adminNotFound(requestId);
    }
    return { requestId, userId };
  } catch {
    return adminNotFound(requestId);
  }
}

/**
 * Destructive admin requests inherit the app's exact-Origin, session, IP, and
 * Redis rate-limit checks, then independently re-check the persisted role.
 */
export async function authorizeAdminMutation(
  request: Request,
): Promise<AuthorizedAdminRequest | Response> {
  const authorization = await authorizeBrowserMutation(request);
  if (authorization instanceof Response) {
    return authorization.status === 401
      ? adminNotFound(createRequestId())
      : authorization;
  }

  try {
    if (!(await currentlyHasAdminRole(authorization.userId))) {
      return adminNotFound(authorization.requestId);
    }
  } catch {
    return safeJsonError(
      503,
      "database_unavailable",
      "The admin service is temporarily unavailable.",
      authorization.requestId,
    );
  }

  return authorization;
}
