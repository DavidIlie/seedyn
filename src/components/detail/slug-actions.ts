"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "~/components/data/session";
import { DomainError } from "~/server/uploads/errors";
import { changeOwnedUploadPublicSlug } from "~/server/uploads/service";

export type ChangeSlugState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; slug: string; url: string; message: string };

export async function changePublicSlugAction(
  _previousState: ChangeSlugState,
  formData: FormData,
): Promise<ChangeSlugState> {
  const uploadId = formData.get("uploadId");
  const slug = formData.get("slug");
  if (
    typeof uploadId !== "string" ||
    uploadId.length < 1 ||
    uploadId.length > 128 ||
    typeof slug !== "string" ||
    slug.length > 100
  ) {
    return { status: "error", message: "The URL slug is invalid." };
  }
  const user = await requireSessionUser();
  try {
    const result = await changeOwnedUploadPublicSlug({
      userId: user.id,
      uploadId,
      slug,
    });
    revalidatePath(`/uploads/${uploadId}`);
    revalidatePath("/dashboard");
    revalidatePath("/images");
    revalidatePath("/files");
    revalidatePath("/texts");
    return {
      status: "saved",
      slug: result.publicSlug,
      url: result.url,
      message: "Public URL changed. The previous direct URL no longer works.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "conflict" || error.code === "invalid_input") {
        return { status: "error", message: error.message };
      }
      if (error.code === "not_found") {
        return { status: "error", message: "Upload not found." };
      }
    }
    return { status: "error", message: "The public URL could not be changed." };
  }
}
