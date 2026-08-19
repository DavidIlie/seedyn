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
import { seedynAuthAdapter } from "./adapter";
import { seedynRoleFromDavidAppsClaim, type SeedynRole } from "./app-role";
import { resolveAuthRedirect } from "./redirect";

export const DAVIDAPPS_ISSUER = "https://id.davidapps.dev";
export const DAVIDAPPS_PROVIDER_ID = "davidapps";
export const DEVELOPMENT_PROVIDER_ID = "seedyn-development";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      appRole: SeedynRole;
    } & DefaultSession["user"];
  }

  interface User {
    identityIssuer?: string | null;
    identitySubject?: string | null;
    appRole?: SeedynRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appRole?: SeedynRole;
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
    checks: ["pkce", "state", "nonce"],
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
        appRole: seedynRoleFromDavidAppsClaim(profile.app_role),
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
  adapter: developmentAuthEnabled ? undefined : seedynAuthAdapter(),
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  logger: {
    error(error) {
      const rawType =
        "type" in error && typeof error.type === "string"
          ? error.type
          : error.name;
      const errorType = /^[A-Za-z0-9_-]{1,80}$/u.test(rawType)
        ? rawType
        : "UnknownAuthError";

      // Auth errors can contain provider responses, tokens, and request data.
      // Emit only a bounded operational category; never serialize the Error.
      console.error(
        JSON.stringify({
          event: "authentication_failed",
          provider: developmentAuthEnabled
            ? DEVELOPMENT_PROVIDER_ID
            : DAVIDAPPS_PROVIDER_ID,
          errorType,
        }),
      );
    },
    warn(code) {
      console.warn(JSON.stringify({ event: "authentication_warning", code }));
    },
  },
  session: {
    strategy: developmentAuthEnabled ? "jwt" : "database",
    // DavidApps application grants are re-evaluated on every OIDC login. A
    // short hard session cap prevents a removed admin grant from surviving in
    // Seedyn for Auth.js' default 30 days.
    maxAge: 15 * 60,
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (
        account?.provider === DAVIDAPPS_PROVIDER_ID &&
        typeof profile?.sub === "string" &&
        profile.sub.length > 0
      ) {
        // New users receive the role from `profile()` when Prisma creates the
        // row. Existing users are synchronized before Auth.js re-reads them to
        // create the database session.
        await db.user.updateMany({
          where: {
            identityIssuer: DAVIDAPPS_ISSUER,
            identitySubject: profile.sub,
          },
          data: {
            appRole: seedynRoleFromDavidAppsClaim(profile.app_role),
          },
        });
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (user?.appRole) token.appRole = user.appRole;
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
          appRole:
            user?.appRole ??
            token.appRole ??
            (developmentAuthEnabled ? "ADMIN" : "MEMBER"),
        },
      };
    },
    redirect({ url }) {
      return resolveAuthRedirect(url, env.APP_URL);
    },
  },
} satisfies NextAuthConfig;
