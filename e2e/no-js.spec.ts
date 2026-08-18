import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

import {
  createProductionTestIdentity,
  deleteProductionTestIdentity,
  type ProductionTestIdentity,
} from "./production-auth";

async function authenticate(
  page: Page,
): Promise<ProductionTestIdentity | null> {
  if (process.env.E2E_PRODUCTION !== "true") {
    const prisma = new PrismaClient();
    const email = process.env.SEEDYN_DEV_AUTH_EMAIL?.toLowerCase();
    if (!email) throw new Error("SEEDYN_DEV_AUTH_EMAIL is required for E2E");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.$disconnect();
    const cookieName = "authjs.session-token";
    const token = await encode({
      salt: cookieName,
      secret:
        process.env.AUTH_SECRET ??
        "seedyn-local-development-only-secret-never-use-in-production",
      token: {
        sub: user.id,
        name: user.name,
        email: user.email,
        picture: user.image,
      },
    });
    await page.context().addCookies([
      {
        name: cookieName,
        value: token,
        url: "http://seedyn.localhost:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    return null;
  }

  const prisma = new PrismaClient();
  let identity: ProductionTestIdentity;
  try {
    identity = await createProductionTestIdentity(prisma, "no-js");
  } finally {
    await prisma.$disconnect();
  }
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: identity.sessionToken,
      url: "http://seedyn.localhost:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/dashboard");
  return identity;
}

test("sensitive Server Actions stay inert without JavaScript", async ({
  page,
}) => {
  const identity = await authenticate(page);
  const prisma = new PrismaClient();

  try {
    await page.goto("/api-keys");
    await expect(
      page.getByRole("button", { name: "Create key" }),
    ).toBeDisabled();
  } finally {
    if (identity) {
      await deleteProductionTestIdentity(prisma, identity);
    }
    await prisma.$disconnect();
  }
});
