"use server";

import { redirect } from "next/navigation";

import { requireSessionUser } from "~/components/data/session";
import { approveCliAuthRequest } from "~/server/cli-auth/service";
import { authorizeServerActionMutation } from "~/server/http/browser-mutation";

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
  redirect(`/cli-auth/${requestId}?result=${result}`);
}
