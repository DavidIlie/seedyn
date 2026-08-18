import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn<() => Promise<never[]>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { CDN_URL: "http://i.localhost:3000" },
}));
vi.mock("~/server/db", () => ({
  db: { upload: { findMany: mocks.findMany } },
}));

import { decodeCursor, encodeCursor, listUploadsByKind } from "./uploads";

describe("library cursor", () => {
  it("round-trips the emitted cursor shape", () => {
    const timestamp = new Date().toISOString();
    expect(decodeCursor(encodeCursor(timestamp, "upload-id"))).toEqual({
      createdAt: new Date(timestamp),
      id: "upload-id",
    });
  });

  it.each([
    "-005000-01-01T00:00:00.000Z~a",
    "0000-01-01T00:00:00.000Z~a",
    "2026-02-30T00:00:00.000Z~a",
    "not-a-date~a",
    "2026-01-01T00:00:00.000Z~",
  ])("falls back for an invalid or out-of-range cursor: %s", (cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined();
  });

  it("passes a literal LIKE pattern to PostgreSQL filename search", async () => {
    mocks.findMany.mockResolvedValue([]);

    await listUploadsByKind({
      userId: "user-id",
      kind: "files",
      query: "  100%_real\\file  ",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-id",
          originalName: {
            contains: "100\\%\\_real\\\\file",
            mode: "insensitive",
          },
        }),
      }),
    );
  });
});
