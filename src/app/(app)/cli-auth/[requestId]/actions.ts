"use server";

import { redirect } from "next/navigation";

import { requireSessionUser } from "~/components/data/session";
import { approveCliAuthRequest } from "~/server/cli-auth/service";
import { authorizeServerActionMutation } from "~/server/http/browser-mutation";
import { recordAuditEvent } from "~/server/audit/service";

export async function approveCliLogin(formData: FormData): Promise<void> {
  const requestId = formData.get("requestId");
  if (
    typeof requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      requestId,
    )
  ) {
    redirect("/cli-auth/invalid?result=missing");
  }

  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    redirect(`/cli-auth/${requestId}?result=rejected`);
  }
  const user = await requireSessionUser(`/cli-auth/${requestId}`);
  const result = await approveCliAuthRequest({
    id: requestId,
    userId: user.id,
  });
  await recordAuditEvent({
    category: "AUTH",
    action: "cli_login_approved",
    outcome: result === "approved" ? "SUCCESS" : "FAILURE",
    actorType: "USER",
    userId: user.id,
    targetType: "cli_auth_request",
    targetId: requestId,
    metadata: { result },
  });
  redirect(`/cli-auth/${requestId}?result=${result}`);
}
