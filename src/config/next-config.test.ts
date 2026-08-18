import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.mjs";

describe("application Content Security Policy", () => {
  it("allows user-selected HTTPS fetches without widening executable sources", async () => {
    const rules = await nextConfig.headers?.();
    const appRule = rules?.find(
      (rule) =>
        rule.source === "/((?!internal/media(?:/|$)).*)" &&
        rule.has === undefined,
    );
    const csp = appRule?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(csp).toBeDefined();
    const directives = new Map(
      csp
        ?.split(";")
        .map((directive) => directive.trim().split(/\s+/u))
        .map(([name, ...values]) => [name, values]),
    );

    expect(directives.get("connect-src")).toContain("https:");
    expect(directives.get("script-src")).not.toContain("https:");
    expect(directives.get("style-src")).not.toContain("https:");
    expect(directives.get("worker-src")).not.toContain("https:");
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual([
      "'self'",
      "https://id.davidapps.dev",
    ]);
  });

  it("retains the isolated media-host CSP override", async () => {
    const rules = await nextConfig.headers?.();
    const mediaRule = rules?.find((rule) =>
      rule.has?.some((condition) => condition.type === "host"),
    );

    expect(
      mediaRule?.headers.find(
        (header) => header.key === "Content-Security-Policy",
      )?.value,
    ).toBe("sandbox; default-src 'none'");
  });
});
