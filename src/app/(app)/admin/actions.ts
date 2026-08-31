"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "~/server/admin/authorization";
import { db } from "~/server/db";
import { recordAuditEvent } from "~/server/audit/service";

const LIMITS_GB = new Set(["default", "10", "25", "50", "100", "250"]);

export type StorageQuotaActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function setUserStorageQuota(
  _previousState: StorageQuotaActionState,
  formData: FormData,
): Promise<StorageQuotaActionState> {
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const limitGb = formData.get("limitGb");
  if (
    typeof userId !== "string" ||
    userId.length < 1 ||
    userId.length > 128 ||
    typeof limitGb !== "string" ||
    !LIMITS_GB.has(limitGb)
  ) {
    return { status: "error", message: "Choose a valid storage limit." };
  }

  const result = await db.user.updateMany({
    where: { id: userId, appRole: "MEMBER" },
    data: {
      storageLimitBytes:
        limitGb === "default" ? null : BigInt(limitGb) * BigInt(1_000_000_000),
    },
  });
  if (result.count !== 1) {
    return { status: "error", message: "Only member quotas can be changed." };
  }

  await recordAuditEvent({
    category: "ADMIN",
    action: "storage_quota_updated",
    actorType: "USER",
    userId: admin.id,
    targetType: "user",
    targetId: userId,
    metadata: { limitGb },
  });

  revalidatePath("/admin");
  revalidatePath("/images");
  revalidatePath("/files");
  revalidatePath("/texts");
  return { status: "success", message: "Storage limit saved." };
}
