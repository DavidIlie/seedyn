"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorizeServerActionMutation } from "~/server/http/browser-mutation";
import { DomainError } from "~/server/uploads/errors";
import { deleteOwnedUpload } from "~/server/uploads/service";

export type DeleteState = { error: string | null };

const MESSAGES: Partial<Record<string, string>> = {
  not_found: "That upload no longer exists.",
  conflict: "A deletion is already in progress for this upload.",
  storage_unavailable:
    "Object storage did not answer, so nothing was deleted. The upload is marked as failed and deleting it again is safe.",
  database_unavailable: "The database did not answer. Try again in a moment.",
};

/**
 * Deletion is a Server Action, and it is never optimistic.
 *
 * The service moves the row to `DELETING`, removes the objects, and only then
 * removes the row; a partial failure leaves a `DELETE_FAILED` state that a
 * retry can finish. Hiding the row before that sequence completes would show a
 * success the storage layer has not agreed to.
 *
 * The action re-derives the user from the session. The upload id in the form is
 * a claim, and the service scopes every query by `userId`, so submitting
 * someone else's id finds nothing.
 */
export async function deleteUploadAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      error:
        authorization.status === 429
          ? "Too many changes. Wait a moment and try again."
          : "Your session or request origin could not be verified.",
    };
  }
  const uploadId = formData.get("uploadId");

  if (typeof uploadId !== "string" || uploadId.length === 0) {
    return { error: "That upload is no longer addressable." };
  }

  try {
    await deleteOwnedUpload({ userId: authorization.userId, uploadId });
  } catch (error) {
    const code = error instanceof DomainError ? error.code : "internal";
    return {
      error: MESSAGES[code] ?? "The upload could not be deleted. Try again.",
    };
  }

  // A prefetched library route can otherwise survive the redirect with the
  // deleted row in the client cache. Invalidate every library projection
  // before redirecting; their request-time queries will supply fresh data.
  for (const path of ["/dashboard", "/images", "/files", "/texts"] as const) {
    revalidatePath(path);
  }

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // turn a successful deletion into an error message.
  return redirect("/dashboard");
}
