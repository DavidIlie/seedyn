import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DomainError } from "~/server/uploads/errors";

import { domainErrorResponse } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("domain error responses", () => {
  it("logs a bounded correlatable category for server failures only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error("MINIO_PASSWORD=must-not-appear"), {
      code: "ECONNREFUSED",
    });

    const response = domainErrorResponse(
      new DomainError("storage_unavailable", { cause }),
      "req_test-123",
    );

    expect(log).toHaveBeenCalledOnce();
    const serialized = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toEqual({
      event: "http_request_failed",
      requestId: "req_test-123",
      code: "storage_unavailable",
      status: 503,
      causeCategory: "ECONNREFUSED",
    });
    expect(serialized).not.toContain("MINIO_PASSWORD");
    expect(serialized).not.toContain("must-not-appear");
    expect(JSON.stringify(await response.json())).not.toContain(
      "must-not-appear",
    );
  });

  it("does not let attacker-shaped request ids or client errors pollute logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    domainErrorResponse(
      new DomainError("database_unavailable", {
        cause: new Error("secret detail"),
      }),
      "bad\nlog line",
    );
    domainErrorResponse(new DomainError("invalid_input"), "req_client");

    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      requestId: "req_invalid",
      causeCategory: "unknown",
    });
  });

  it("still returns the safe response if stderr logging fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("stderr closed");
    });

    const response = domainErrorResponse(new Error("sensitive"), "req_test");

    expect(response.status).toBe(500);
  });
});
