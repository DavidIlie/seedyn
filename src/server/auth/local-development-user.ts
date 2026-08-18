import "server-only";

import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { db } from "~/server/db";

export const LOCAL_DEVELOPMENT_IDENTITY_ISSUER = "urn:seedyn:local-development";

const localUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  identityIssuer: true,
  identitySubject: true,
} satisfies Prisma.UserSelect;

type LocalDevelopmentUser = Prisma.UserGetPayload<{
  select: typeof localUserSelect;
}>;

function localHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

export function assertLocalDevelopmentServerBinding(value: string | undefined) {
  if (value !== "1") {
    throw new Error(
      "Local development authentication requires the loopback-only pnpm dev server",
    );
  }
}

export function assertLocalDevelopmentEnvironment(input: {
  nodeEnv: string;
  developmentAuthEnabled: boolean;
  appUrl: string;
  databaseUrl: string;
}): void {
  let app: URL;
  let database: URL;
  try {
    app = new URL(input.appUrl);
    database = new URL(input.databaseUrl);
  } catch (error) {
    throw new Error("Local development identity requires valid local URLs", {
      cause: error,
    });
  }

  if (
    input.nodeEnv !== "development" ||
    !input.developmentAuthEnabled ||
    !localHostname(app.hostname) ||
    !localHostname(database.hostname) ||
    (database.protocol !== "postgres:" && database.protocol !== "postgresql:")
  ) {
    throw new Error(
      "Local development identity requires development mode, explicit dev auth, and localhost app/database targets",
    );
  }
}

export function localDevelopmentUserId(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  return `seedyn-dev-${createHash("sha256")
    .update(email, "utf8")
    .digest("base64url")
    .slice(0, 22)}`;
}

function assertExpectedLocalUser(
  row: LocalDevelopmentUser,
  email: string,
  stableId: string,
): LocalDevelopmentUser {
  if (
    row.id !== stableId ||
    row.email !== email ||
    row.identityIssuer !== LOCAL_DEVELOPMENT_IDENTITY_ISSUER ||
    row.identitySubject !== email
  ) {
    throw new Error(
      "Configured development identity collides with an unexpected user",
    );
  }
  return row;
}

async function findEmailCollision(
  email: string,
): Promise<LocalDevelopmentUser | null> {
  return db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: localUserSelect,
  });
}

export async function ensureLocalDevelopmentUser(
  rawEmail: string,
): Promise<LocalDevelopmentUser> {
  const email = rawEmail.trim().toLowerCase();
  const stableId = localDevelopmentUserId(email);
  const existing = await findEmailCollision(email);
  if (existing) return assertExpectedLocalUser(existing, email, stableId);

  try {
    return await db.user.create({
      data: {
        id: stableId,
        email,
        name: "Seedyn local developer",
        identityIssuer: LOCAL_DEVELOPMENT_IDENTITY_ISSUER,
        identitySubject: email,
      },
      select: localUserSelect,
    });
  } catch (error) {
    // A concurrent local sign-in/seed may have won the unique constraint. It is
    // safe only when the winner is the byte-for-byte expected local identity.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await findEmailCollision(email);
      if (raced) return assertExpectedLocalUser(raced, email, stableId);
    }
    throw error;
  }
}
