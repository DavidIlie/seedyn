import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthConfig, Profile } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { OIDCConfig } from "next-auth/providers";

import { assertAuthConfigured, env } from "~/env";
import { db } from "~/server/db";

import {
  assertLocalDevelopmentEnvironment,
  assertLocalDevelopmentServerBinding,
  ensureLocalDevelopmentUser,
} from "./local-development-user";
import { resolveAuthRedirect } from "./redirect";

export const DAVIDAPPS_ISSUER = "https://id.davidapps.dev";
export const DAVIDAPPS_PROVIDER_ID = "davidapps";
export const DEVELOPMENT_PROVIDER_ID = "seedyn-development";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    identityIssuer?: string | null;
    identitySubject?: string | null;
  }
}

function requiredAuthValue(
  value: string | undefined,
  variableName: string,
): string {
  if (!value) {
    throw new Error(`${variableName} is required for DavidApps authentication`);
  }

  return value;
}

function davidAppsProvider(): OIDCConfig<Profile> {
  assertAuthConfigured();

  return {
    id: DAVIDAPPS_PROVIDER_ID,
    name: "DavidApps",
    type: "oidc" as const,
    issuer: DAVIDAPPS_ISSUER,
    clientId: requiredAuthValue(env.AUTH_DAVIDAPPS_ID, "AUTH_DAVIDAPPS_ID"),
    clientSecret: requiredAuthValue(
      env.AUTH_DAVIDAPPS_SECRET,
      "AUTH_DAVIDAPPS_SECRET",
    ),
    authorization: {
      params: {
        scope: "openid profile email",
      },
    },
    checks: ["pkce", "state"],
    allowDangerousEmailAccountLinking: false,
    profile(profile: Profile) {
      if (typeof profile.sub !== "string" || profile.sub.length === 0) {
        throw new Error("DavidApps returned a profile without a subject");
      }

      return {
        id: profile.sub,
        name:
          profile.name ??
          profile.nickname ??
          profile.preferred_username ??
          null,
        email: profile.email ?? null,
        image: profile.picture ?? null,
        identityIssuer: DAVIDAPPS_ISSUER,
        identitySubject: profile.sub,
      };
    },
    account(tokens) {
      return {
        access_token: tokens.access_token,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        scope: tokens.scope,
        token_type: tokens.token_type,
        session_state: tokens.session_state,
        refresh_token_expires_in: tokens.refresh_token_expires_in,
        issuer: DAVIDAPPS_ISSUER,
      };
    },
  };
}

function developmentProvider() {
  const email = env.SEEDYN_DEV_AUTH_EMAIL;

  if (!email) {
    throw new Error(
      "SEEDYN_DEV_AUTH_EMAIL is required when local development auth is enabled",
    );
  }

  const localEmail = email.toLowerCase();
  assertLocalDevelopmentEnvironment({
    nodeEnv: env.NODE_ENV,
    developmentAuthEnabled: env.SEEDYN_DEV_AUTH,
    appUrl: env.APP_URL,
    databaseUrl: env.DATABASE_URL,
  });
  assertLocalDevelopmentServerBinding(process.env.SEEDYN_DEV_LOOPBACK_BOUND);

  return Credentials({
    id: DEVELOPMENT_PROVIDER_ID,
    name: `Local development only (${localEmail})`,
    credentials: {},
    async authorize() {
      return ensureLocalDevelopmentUser(localEmail);
    },
  });
}

const developmentAuthEnabled =
  env.SEEDYN_DEV_AUTH && env.NODE_ENV !== "production";

if (env.SEEDYN_DEV_AUTH && env.NODE_ENV === "production") {
  throw new Error("SEEDYN_DEV_AUTH must never be enabled in production");
}

export const authConfig = {
  secret:
    env.AUTH_SECRET ??
    (developmentAuthEnabled
      ? "seedyn-local-development-only-secret-never-use-in-production"
      : undefined),
  trustHost: true,
  providers: developmentAuthEnabled
    ? [developmentProvider()]
    : [davidAppsProvider()],
  adapter: developmentAuthEnabled ? undefined : PrismaAdapter(db),
  session: {
    strategy: developmentAuthEnabled ? "jwt" : "database",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token, user }) {
      const userId = user?.id ?? token.sub;

      if (!userId) {
        throw new Error("Authenticated session is missing its user id");
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
        },
      };
    },
    redirect({ url }) {
      return resolveAuthRedirect(url, env.APP_URL);
    },
  },
} satisfies NextAuthConfig;
