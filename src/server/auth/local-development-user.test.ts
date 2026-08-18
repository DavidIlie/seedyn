import { beforeEach, describe, expect, it, vi } from "vitest";

type LocalUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  identityIssuer: string | null;
  identitySubject: string | null;
};

const mocks = vi.hoisted(() => ({
  create: vi.fn<(...args: unknown[]) => Promise<LocalUserRow>>(),
  findFirst: vi.fn<(...args: unknown[]) => Promise<LocalUserRow | null>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: {
    user: {
      create: mocks.create,
      findFirst: mocks.findFirst,
    },
  },
}));

import {
  assertLocalDevelopmentEnvironment,
  assertLocalDevelopmentServerBinding,
  ensureLocalDevelopmentUser,
  LOCAL_DEVELOPMENT_IDENTITY_ISSUER,
  localDevelopmentUserId,
} from "./local-development-user";

const email = "david@davidilie.com";

function expectedLocalUser(): LocalUserRow {
  return {
    id: localDevelopmentUserId(email),
    name: "Seedyn local developer",
    email,
    emailVerified: null,
    image: null,
    identityIssuer: LOCAL_DEVELOPMENT_IDENTITY_ISSUER,
    identitySubject: email,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("local development target guard", () => {
  const local = {
    nodeEnv: "development",
    developmentAuthEnabled: true,
    appUrl: "http://seedyn.localhost:3000",
    databaseUrl: "postgresql://seedyn:secret@127.0.0.1:5432/seedyn",
  };

  it("accepts an explicit development identity on loopback targets", () => {
    expect(() => assertLocalDevelopmentEnvironment(local)).not.toThrow();
  });

  it.each([
    { ...local, nodeEnv: "production" },
    { ...local, nodeEnv: "test" },
    { ...local, developmentAuthEnabled: false },
    { ...local, appUrl: "https://preview.example.com" },
    {
      ...local,
      databaseUrl: "postgresql://seedyn:secret@db.example.com:5432/seedyn",
    },
  ])("rejects a non-local or non-development target", (input) => {
    expect(() => assertLocalDevelopmentEnvironment(input)).toThrow(
      "Local development identity requires development mode",
    );
  });

  it("requires the loopback-only development launcher for passwordless auth", () => {
    expect(() => assertLocalDevelopmentServerBinding(undefined)).toThrow(
      "loopback-only pnpm dev server",
    );
    expect(() => assertLocalDevelopmentServerBinding("1")).not.toThrow();
  });
});

describe("local development identity", () => {
  it("returns the exact deterministic local row without mutating it", async () => {
    const row = expectedLocalUser();
    mocks.findFirst.mockResolvedValue(row);

    await expect(ensureLocalDevelopmentUser(email)).resolves.toEqual(row);

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: email, mode: "insensitive" } },
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates only the deterministic local identity when no email collides", async () => {
    const row = expectedLocalUser();
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(row);

    await expect(
      ensureLocalDevelopmentUser(" DAVID@DAVIDILIE.COM "),
    ).resolves.toEqual(row);

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          id: row.id,
          email,
          name: "Seedyn local developer",
          identityIssuer: LOCAL_DEVELOPMENT_IDENTITY_ISSUER,
          identitySubject: email,
        },
      }),
    );
  });

  it("refuses to adopt a federated user with the configured email", async () => {
    mocks.findFirst.mockResolvedValue({
      ...expectedLocalUser(),
      id: "real-user-id",
      identityIssuer: "https://id.davidapps.dev",
      identitySubject: "pairwise-real-subject",
    });

    await expect(ensureLocalDevelopmentUser(email)).rejects.toThrow(
      "collides with an unexpected user",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a lookalike local identity with an unexpected id", async () => {
    mocks.findFirst.mockResolvedValue({
      ...expectedLocalUser(),
      id: "unexpected-id",
    });

    await expect(ensureLocalDevelopmentUser(email)).rejects.toThrow(
      "collides with an unexpected user",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
