"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { activeProviderId } from "~/components/auth/provider";
import { signIn } from "~/server/auth";
import { authorizePublicServerActionMutation } from "~/server/http/browser-mutation";

/**
 * Starts the OIDC authorization-code flow.
 *
 * On success `signIn` signals with a redirect, which is not an `AuthError` and
 * therefore falls through untouched. A genuine authentication failure is turned
 * into a bounded code in the URL — never a message, a token, or a callback
 * parameter, all of which cross logging and history boundaries.
 */
export async function startSignIn(): Promise<void> {
  const authorization = await authorizePublicServerActionMutation();
  if (authorization instanceof Response) {
    redirect(
      authorization.status === 429
        ? "/sign-in?error=RateLimited"
        : "/sign-in?error=RequestRejected",
    );
  }

  try {
    await signIn(activeProviderId, { redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      const code = /^[A-Za-z]{1,40}$/.test(error.type) ? error.type : "Unknown";
      redirect(`/sign-in?error=${code}`);
    }
    throw error;
  }
}
