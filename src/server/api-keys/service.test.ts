import { beforeEach, describe, expect, it, vi } from "vitest";

type ApiKeyTransaction = {
  apiKey: {
    count: (...args: unknown[]) => Promise<number>;
    create: (...args: unknown[]) => Promise<Record<string, unknown>>;
    deleteMany: (...args: unknown[]) => Promise<{ count: number }>;
    findMany: (...args: unknown[]) => Promise<Array<Record<string, unknown>>>;
    updateMany: (...args: unknown[]) => Promise<{ count: number }>;
  };
};
type TransactionCallback = (transaction: ApiKeyTransaction) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  count: vi.fn<(...args: unknown[]) => Promise<number>>(),
  create: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
  deleteMany: vi.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
  findMany:
    vi.fn<(...args: unknown[]) => Promise<Array<Record<string, unknown>>>>(),
  findUnique:
    vi.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>(),
  transaction:
    vi.fn<
      (callback: TransactionCallback, options?: unknown) => Promise<unknown>
    >(),
  updateMany: vi.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
}));

const transaction: ApiKeyTransaction = {
  apiKey: {
    count: mocks.count,
    create: mocks.create,
    deleteMany: mocks.deleteMany,
    findMany: mocks.findMany,
    updateMany: mocks.updateMany,
  },
};

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: {
    $transaction: mocks.transaction,
    apiKey: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

import {
  createApiKey,
  listApiKeys,
  MAX_API_KEY_HISTORY_PER_USER,
  resolveApiKeyIdentity,
} from "./service";

const now = new Date("2026-08-17T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback(transaction),
  );
});

describe("bounded API key history", () => {
  it("bounds dashboard reads to the retained history size", async () => {
    mocks.findMany.mockResolvedValue([]);

    await expect(listApiKeys("user_1")).resolves.toEqual([]);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        take: MAX_API_KEY_HISTORY_PER_USER,
      }),
    );
  });

  it("prunes terminal history transactionally before creating a key", async () => {
    mocks.count
      .mockResolvedValueOnce(MAX_API_KEY_HISTORY_PER_USER)
      .mockResolvedValueOnce(9);
    mocks.findMany.mockResolvedValue([{ id: "old_revoked_key" }]);
    mocks.create.mockResolvedValue({
      id: "new_key",
      name: "ShareX",
      prefix: "sdn_live_12345678",
      scopes: ["upload:image"],
      createdAt: now,
      expiresAt: null,
    });

    await createApiKey({
      userId: "user_1",
      name: "ShareX",
      scopes: ["upload:image"],
    });

    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        id: { in: ["old_revoked_key"] },
      },
    });
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("removes an inactive row with the requested name before insert", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mocks.create.mockResolvedValue({
      id: "replacement",
      name: "ShareX",
      prefix: "sdn_live_12345678",
      scopes: ["upload:image"],
      createdAt: now,
      expiresAt: null,
    });

    await createApiKey({
      userId: "user_1",
      name: "ShareX",
      scopes: ["upload:image"],
    });

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        name: "ShareX",
        userId: "user_1",
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }],
      },
    });
  });

  it("preserves the ten-active-key cap after pruning history", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);

    await expect(
      createApiKey({
        userId: "user_1",
        name: "Eleventh key",
        scopes: ["upload:file"],
      }),
    ).rejects.toThrow("at most 10 active API keys");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("API key authentication boundary", () => {
  it("exposes a clearly named identity resolver with no optional scope", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(resolveApiKeyIdentity("malformed")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(resolveApiKeyIdentity).toHaveLength(1);
  });
});
