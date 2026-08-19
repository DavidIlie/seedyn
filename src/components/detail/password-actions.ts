"use server";

import { revalidatePath } from "next/cache";

import { authorizeServerActionMutation } from "~/server/http/browser-mutation";
import {
  hashMediaPassword,
  validateMediaPassword,
} from "~/server/media/passwords";
import { DomainError } from "~/server/uploads/errors";
import { updateOwnedUploadPassword } from "~/server/uploads/service";

export type PasswordProtectionState = {
  error: string | null;
  success: string | null;
};

const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function updatePasswordProtectionAction(
  _previous: PasswordProtectionState,
  formData: FormData,
): Promise<PasswordProtectionState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      error:
        authorization.status === 429
          ? "Too many changes. Wait a moment and try again."
          : "Your session or request origin could not be verified.",
      success: null,
    };
  }

  const uploadId = formData.get("uploadId");
  const mode = formData.get("mode");
  if (
    typeof uploadId !== "string" ||
    !UPLOAD_ID.test(uploadId) ||
    (mode !== "set" && mode !== "remove")
  ) {
    return { error: "That upload is no longer addressable.", success: null };
  }

  let passwordHash: string | null = null;
  if (mode === "set") {
    const password = validateMediaPassword(formData.get("password"));
    const confirmation = formData.get("passwordConfirmation");
    if (!password.ok) return { error: password.message, success: null };
    if (confirmation !== password.password) {
      return { error: "The passwords do not match.", success: null };
    }
    try {
      passwordHash = await hashMediaPassword(password.password);
    } catch {
      return {
        error: "Password protection is temporarily unavailable.",
        success: null,
      };
    }
  }

  try {
    await updateOwnedUploadPassword({
      userId: authorization.userId,
      uploadId,
      passwordHash,
    });
  } catch (error) {
    return {
      error:
        error instanceof DomainError && error.code === "not_found"
          ? "That upload no longer exists."
          : "The password setting could not be saved. Try again.",
      success: null,
    };
  }

  for (const path of [
    `/uploads/${uploadId}`,
    "/dashboard",
    "/images",
    "/files",
    "/texts",
  ] as const) {
    revalidatePath(path);
  }
  return {
    error: null,
    success:
      mode === "remove"
        ? "Password removed. Anyone with the link can open this upload."
        : "Password saved. The protected link is ready to share.",
  };
}
