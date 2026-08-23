"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "~/components/data/session";
import { DomainError } from "~/server/uploads/errors";
import { changeOwnedUploadMediaOrigin } from "~/server/uploads/service";

export type ChangeMediaDomainState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; url: string; message: string };

/**
 * Point an existing upload's link at another configured media domain.
 *
 * The object is already reachable from every media host, so this is a
 * preference rather than a move — which is exactly why the upload dialog can
 * ask about it after the bytes are safely stored.
 */
export async function changeUploadMediaDomainAction(input: {
  uploadId: string;
  mediaDomainId: string;
}): Promise<ChangeMediaDomainState> {
  if (
    typeof input.uploadId !== "string" ||
    input.uploadId.length < 1 ||
    input.uploadId.length > 128 ||
    typeof input.mediaDomainId !== "string" ||
    input.mediaDomainId.length > 128
  ) {
    return { status: "error", message: "That media domain is invalid." };
  }
  const user = await requireSessionUser();
  try {
    const result = await changeOwnedUploadMediaOrigin({
      userId: user.id,
      uploadId: input.uploadId,
      mediaDomainId: input.mediaDomainId || null,
    });
    revalidatePath(`/uploads/${input.uploadId}`);
    revalidatePath("/dashboard");
    revalidatePath("/images");
    revalidatePath("/files");
    revalidatePath("/texts");
    return { status: "saved", url: result.url, message: "Domain updated." };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "invalid_input") {
        return { status: "error", message: error.message };
      }
      if (error.code === "not_found") {
        return { status: "error", message: "Upload not found." };
      }
    }
    return { status: "error", message: "The domain could not be changed." };
  }
}
