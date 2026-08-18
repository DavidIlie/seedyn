import { env } from "~/env";
import {
  assertLocalDevelopmentEnvironment,
  ensureLocalDevelopmentUser,
} from "~/server/auth/local-development-user";
import { db } from "~/server/db";

async function main(): Promise<void> {
  assertLocalDevelopmentEnvironment({
    nodeEnv: env.NODE_ENV,
    developmentAuthEnabled: env.SEEDYN_DEV_AUTH,
    appUrl: env.APP_URL,
    databaseUrl: env.DATABASE_URL,
  });
  const email = env.SEEDYN_DEV_AUTH_EMAIL?.toLowerCase();
  if (!email) throw new Error("SEEDYN_DEV_AUTH_EMAIL is required");
  await ensureLocalDevelopmentUser(email);
  process.stdout.write("Seeded the configured local development identity.\n");
}

await main().finally(async () => db.$disconnect());
