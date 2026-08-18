import { beforeEach, describe, expect, it, vi } from "vitest";

type AsyncUnknown = (...args: unknown[]) => Promise<unknown>;
type AsyncVoid = (...args: unknown[]) => Promise<void>;

const mocks = vi.hoisted(() => ({
  connection: vi.fn<() => Promise<void>>(),
  dbQuery: vi.fn<AsyncUnknown>(),
  ensureRedis: vi.fn<AsyncVoid>(),
  ping: vi.fn<() => Promise<string>>(),
  storageReady: vi.fn<AsyncVoid>(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("~/server/db", () => ({
  db: { $queryRaw: mocks.dbQuery },
}));
vi.mock("~/server/http/request", () => ({
  isDirectProbeRequest: (incoming: Request) => {
    const host = incoming.headers.get("host");
    return host === "127.0.0.1:3000" || host === "10.0.0.3:3000";
  },
}));
vi.mock("~/server/redis", () => ({
  ensureRedisReady: mocks.ensureRedis,
  getRedis: () => ({ ping: mocks.ping }),
}));
vi.mock("~/server/storage/minio", () => ({
  checkObjectStorageReadiness: mocks.storageReady,
}));

async function loadGet() {
  return (await import("./route")).GET;
}

function request(host: string): Request {
  return new Request("http://127.0.0.1:3000/api/readyz", {
    headers: { host },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.dbQuery.mockResolvedValue([{ ok: 1 }]);
  mocks.ensureRedis.mockResolvedValue(undefined);
  mocks.ping.mockResolvedValue("PONG");
  mocks.storageReady.mockResolvedValue(undefined);
});

describe("readiness handler boundary", () => {
  it("refuses public and arbitrary authorities before dependency work", async () => {
    const GET = await loadGet();

    const response = await GET(request("seedyn.dave.tips"));

    expect(response.status).toBe(404);
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.dbQuery).not.toHaveBeenCalled();
    expect(mocks.ensureRedis).not.toHaveBeenCalled();
    expect(mocks.storageReady).not.toHaveBeenCalled();
  });

  it("accepts an exact pod authority and returns bounded readiness", async () => {
    const GET = await loadGet();

    const response = await GET(request("10.0.0.3:3000"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(mocks.dbQuery).toHaveBeenCalledOnce();
    expect(mocks.ping).toHaveBeenCalledOnce();
    expect(mocks.storageReady).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent probes and briefly caches their result", async () => {
    let finishDatabase!: (value: unknown) => void;
    mocks.dbQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDatabase = resolve;
        }),
    );
    const GET = await loadGet();

    const first = GET(request("127.0.0.1:3000"));
    const second = GET(request("127.0.0.1:3000"));
    await Promise.resolve();
    expect(mocks.dbQuery).toHaveBeenCalledOnce();

    finishDatabase([{ ok: 1 }]);
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect((await GET(request("127.0.0.1:3000"))).status).toBe(200);
    expect(mocks.dbQuery).toHaveBeenCalledOnce();
  });

  it("returns no dependency detail when one check fails", async () => {
    mocks.storageReady.mockRejectedValue(
      new Error("minio.internal:9000 secret"),
    );
    const GET = await loadGet();

    const response = await GET(request("127.0.0.1:3000"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready" });
  });
});
