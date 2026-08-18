import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./request", () => ({
  isAppHostRequest: (candidate: Request) =>
    candidate.headers.get("host") === "seedyn.localhost:3000",
  isMediaHostRequest: (candidate: Request) =>
    candidate.headers.get("host") === "i.localhost:3000",
}));

import { uploadMethodNotAllowed, uploadOptions } from "./upload-route-methods";

function request(host: string, method = "GET"): Request {
  return new Request("http://seedyn.localhost:3000/api/upload", {
    method,
    headers: { host },
  });
}

describe("bodyless methods on Proxy-excluded upload routes", () => {
  it("preserves normal app-origin method semantics", () => {
    const unsupported = uploadMethodNotAllowed(
      request("seedyn.localhost:3000"),
    );
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("allow")).toBe("OPTIONS, POST");
    expect(
      uploadOptions(request("seedyn.localhost:3000", "OPTIONS")).status,
    ).toBe(204);
  });

  it("keeps upload route existence off media and unknown authorities", () => {
    expect(uploadOptions(request("i.localhost:3000", "OPTIONS")).status).toBe(
      404,
    );
    expect(uploadMethodNotAllowed(request("attacker.test")).status).toBe(421);
  });
});
