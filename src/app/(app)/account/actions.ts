"use server";

import { refresh } from "next/cache";

import { db } from "~/server/db";
import { authorizeServerActionMutation } from "~/server/http/browser-mutation";
import { validMediaDomainId } from "~/server/media/origin-preferences";
import { recordAuditEvent } from "~/server/audit/service";

export type AccountDomainState =
  | { status: "idle"; message?: never }
  | { status: "saved" | "error"; message: string };

export async function updateAccountMediaDomainAction(
  _previous: AccountDomainState,
  formData: FormData,
): Promise<AccountDomainState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      status: "error",
      message:
        authorization.status === 429
          ? "Too many account changes. Wait a moment."
          : "Your session or request origin could not be verified.",
    };
  }

  const value = formData.get("mediaDomain");
  if (typeof value !== "string" || !validMediaDomainId(value)) {
    return { status: "error", message: "Choose a configured media domain." };
  }

  const updated = await db.user.updateMany({
    where: { id: authorization.userId },
    data: { defaultMediaDomain: value },
  });
  if (updated.count !== 1) {
    return { status: "error", message: "Your account could not be updated." };
  }

  await recordAuditEvent({
    category: "ACCOUNT",
    action: "default_media_domain_updated",
    actorType: "USER",
    userId: authorization.userId,
    targetType: "account",
    targetId: authorization.userId,
    metadata: { mediaDomain: value },
  });

  refresh();
  return {
    status: "saved",
    message: "Default media domain saved.",
  };
}
