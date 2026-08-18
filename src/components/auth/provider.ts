import "server-only";

import { env } from "~/env";
import {
  DAVIDAPPS_PROVIDER_ID,
  DEVELOPMENT_PROVIDER_ID,
} from "~/server/auth/config";

/**
 * Which provider the sign-in page should offer.
 *
 * This mirrors the decision `src/server/auth/config.ts` already made when it
 * built the provider list — it does not make a second one, and it cannot create
 * a path that config did not register. The development provider is only ever
 * offered when that module put it in `providers`, which it refuses to do in
 * production.
 */
export const developmentAuthEnabled =
  env.SEEDYN_DEV_AUTH && env.NODE_ENV !== "production";

export const activeProviderId = developmentAuthEnabled
  ? DEVELOPMENT_PROVIDER_ID
  : DAVIDAPPS_PROVIDER_ID;

/** Deliberately does not name the configured account. */
export const activeProviderLabel = developmentAuthEnabled
  ? "Continue with local development sign-in"
  : "Continue with DavidApps";
