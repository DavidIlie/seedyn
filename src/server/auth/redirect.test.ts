import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "./redirect";

const APP_URL = "https://seedyn.dave.tips";

describe("Auth.js redirect boundary", () => {
  it("allows relative and same-origin destinations", () => {
    expect(resolveAuthRedirect("/uploads", APP_URL)).toBe(
      "https://seedyn.dave.tips/uploads",
    );
    expect(
      resolveAuthRedirect("https://seedyn.dave.tips/api-keys", APP_URL),
    ).toBe("https://seedyn.dave.tips/api-keys");
  });

  it("rejects absolute and protocol-relative cross-origin destinations", () => {
    expect(resolveAuthRedirect("https://example.com", APP_URL)).toBe(
      "https://seedyn.dave.tips/",
    );
    expect(resolveAuthRedirect("//example.com/path", APP_URL)).toBe(
      "https://seedyn.dave.tips/",
    );
    expect(resolveAuthRedirect("/\\example.com/path", APP_URL)).toBe(
      "https://seedyn.dave.tips/",
    );
    expect(
      resolveAuthRedirect("blob:https://seedyn.dave.tips/object", APP_URL),
    ).toBe("https://seedyn.dave.tips/");
  });

  it("fails closed on invalid destinations", () => {
    expect(resolveAuthRedirect("not a URL", APP_URL)).toBe(
      "https://seedyn.dave.tips/",
    );
  });
});
