import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type ProductionTestIdentity = {
  sessionToken: string;
  userId: string;
};

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/** Production-mode E2E must never mint sessions in a deployed database. */
export function assertProductionE2eIsLocal(): void {
  let database: URL;
  let app: URL;
  try {
    database = new URL(process.env.DATABASE_URL ?? "");
    app = new URL(process.env.APP_URL ?? "");
  } catch (error) {
    throw new Error("Production E2E requires valid local target URLs", {
      cause: error,
    });
  }

  if (
    !isLoopback(database.hostname) ||
    !isLoopback(app.hostname) ||
    (database.protocol !== "postgres:" && database.protocol !== "postgresql:")
  ) {
    throw new Error(
      "Production E2E refuses non-local application or PostgreSQL targets",
    );
  }
}

export async function createProductionTestIdentity(
  prisma: PrismaClient,
  label: string,
): Promise<ProductionTestIdentity> {
  assertProductionE2eIsLocal();
  const suffix = randomUUID();
  const userId = `seedyn-e2e-${suffix}`;
  const email = `seedyn-e2e-${suffix}@localhost.invalid`;
  const sessionToken = `seedyn-e2e-${label}-${randomUUID()}`;

  await prisma.user.create({
    data: {
      id: userId,
      email,
      name: "Seedyn E2E",
      identityIssuer: "urn:seedyn:e2e",
      identitySubject: email,
      sessions: {
        create: {
          sessionToken,
          expires: new Date(Date.now() + 60 * 60 * 1_000),
        },
      },
    },
  });

  return { sessionToken, userId };
}

export async function deleteProductionTestIdentity(
  prisma: PrismaClient,
  identity: ProductionTestIdentity,
): Promise<void> {
  assertProductionE2eIsLocal();
  await prisma.session.deleteMany({
    where: { sessionToken: identity.sessionToken, userId: identity.userId },
  });
  // Uploads deliberately use RESTRICT: if a failed test leaves one behind, do
  // not conceal that consistency problem by forcing the user row away.
  await prisma.user.deleteMany({
    where: {
      id: identity.userId,
      identityIssuer: "urn:seedyn:e2e",
      uploads: { none: {} },
    },
  });
}
