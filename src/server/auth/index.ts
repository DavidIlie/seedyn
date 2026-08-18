import NextAuth from "next-auth";
import { cache } from "react";

import { env } from "~/env";

import { authConfig } from "./config";

// Auth.js rewrites request origins to AUTH_URL before trusting a host. Set it
// from validated application configuration so forwarded Host headers never
// decide callback or redirect origins.
process.env.AUTH_URL = env.APP_URL;

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(uncachedAuth);

export class AuthenticationRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getOptionalUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function getUserResult() {
  const user = await getOptionalUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    } as const;
  }

  return { ok: true, user } as const;
}

export async function requireUser() {
  const result = await getUserResult();

  if (!result.ok) throw new AuthenticationRequiredError();

  return result.user;
}

export { auth, handlers, signIn, signOut };
