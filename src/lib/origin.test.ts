import { describe, expect, it } from "vitest";

import {
  normalizeAuthority,
  parseHostSet,
  parsePublicMediaPath,
  resolveOriginRole,
} from "./origin";

const appHosts = parseHostSet("seedyn.dave.tips,seedyn.localhost,localhost");
const mediaHosts = parseHostSet("i.dave.tips,i.localhost");

describe("origin routing", () => {
  it.each([
    ["seedyn.dave.tips", "seedyn.dave.tips"],
    ["SEEDYN.LOCALHOST:3000", "seedyn.localhost"],
    ["localhost:3000", "localhost"],
    ["[::1]:3000", "::1"],
    ["[0:0:0:0:0:0:0:1]:3000", "::1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeAuthority(input)).toBe(expected);
  });

  it.each([
    "seedyn.dave.tips.",
    " seedyn.dave.tips",
    "seedyn.dave.tips,attacker.test",
    "seedyn.dave.tips/path",
    "user@seedyn.dave.tips",
    "a:b:c",
    "[]",
    "[seedyn.dave.tips]",
    "[i.dave.tips]:3000",
    "[127.0.0.1]",
  ])("rejects malformed authority %s", (input) => {
    expect(normalizeAuthority(input)).toBeNull();
  });

  it("rejects authority ports outside the TCP range", () => {
    expect(normalizeAuthority("seedyn.localhost:65535")).toBe(
      "seedyn.localhost",
    );
    expect(normalizeAuthority("seedyn.localhost:65536")).toBeNull();
    expect(normalizeAuthority("[::1]:65536")).toBeNull();
  });

  it("classifies only closed allowlists", () => {
    expect(
      resolveOriginRole("seedyn.localhost:3000", appHosts, mediaHosts),
    ).toBe("app");
    expect(resolveOriginRole("i.localhost:3000", appHosts, mediaHosts)).toBe(
      "media",
    );
    expect(resolveOriginRole("attacker.test", appHosts, mediaHosts)).toBe(
      "unknown",
    );
  });

  it("accepts only exact high-entropy media paths", () => {
    expect(parsePublicMediaPath("/AbCdEfGhIjKlMnOpQrStUv.png")).toEqual({
      slug: "AbCdEfGhIjKlMnOpQrStUv",
      extension: "png",
    });
    expect(parsePublicMediaPath("/too-short.png")).toBeNull();
    expect(parsePublicMediaPath("/AbCdEfGhIjKlMnOpQrStUv.PNG")).toBeNull();
    expect(
      parsePublicMediaPath("/AbCdEfGhIjKlMnOpQrStUv.png/extra"),
    ).toBeNull();
  });
});
