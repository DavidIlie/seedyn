import { describe, expect, it } from "vitest";

import { normalizeApiKeyScopes } from "./constants";
import { parseApiKeyAuthorization } from "./authorization";
import { generateApiKey, hashApiKey, parseApiKey } from "./key-format";

describe("API key material", () => {
  it("generates the documented format with a 256-bit secret", () => {
    const generated = generateApiKey();
    const match = /^sdn_live_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/.exec(
      generated.rawKey,
    );

    expect(match).not.toBeNull();
    expect(match?.[1]).toHaveLength(8);
    expect(Buffer.from(match?.[2] ?? "", "base64url")).toHaveLength(32);
    expect(generated.displayPrefix).toBe(`sdn_live_${match?.[1]}`);
    expect(generated.secretHash).toEqual(hashApiKey(generated.rawKey));
    expect(parseApiKey(generated.rawKey)).toEqual({
      displayPrefix: generated.displayPrefix,
    });
  });

  it("generates independent keys and digests", () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first.rawKey).not.toBe(second.rawKey);
    expect(first.secretHash).not.toEqual(second.secretHash);
  });

  it("rejects truncated, extended, and non-canonical candidates", () => {
    const { rawKey } = generateApiKey();

    expect(parseApiKey(rawKey.slice(0, -1))).toBeNull();
    expect(parseApiKey(`${rawKey}a`)).toBeNull();
    expect(parseApiKey(rawKey.replace("sdn_live_", "other_"))).toBeNull();
    expect(parseApiKey(`${rawKey}\n`)).toBeNull();
  });
});

describe("Authorization parsing", () => {
  it("accepts Bearer keys and never requires a legacy mode", () => {
    const { rawKey } = generateApiKey();

    expect(parseApiKeyAuthorization(`Bearer ${rawKey}`)).toBe(rawKey);
    expect(parseApiKeyAuthorization(`bearer ${rawKey}`)).toBe(rawKey);
  });

  it("accepts a raw key only through the explicit compatibility flag", () => {
    const { rawKey } = generateApiKey();

    expect(parseApiKeyAuthorization(rawKey)).toBeNull();
    expect(parseApiKeyAuthorization(rawKey, { allowLegacyRaw: true })).toBe(
      rawKey,
    );
  });

  it("rejects ambiguous and malformed headers", () => {
    const { rawKey } = generateApiKey();

    expect(parseApiKeyAuthorization(`Bearer  ${rawKey}`)).toBeNull();
    expect(
      parseApiKeyAuthorization(`Bearer ${rawKey}, Basic value`),
    ).toBeNull();
    expect(parseApiKeyAuthorization(`Basic ${rawKey}`)).toBeNull();
    expect(parseApiKeyAuthorization(null)).toBeNull();
  });
});

describe("scope allowlist", () => {
  it("deduplicates and returns canonical positive scopes", () => {
    expect(
      normalizeApiKeyScopes(["upload:text", "upload:image", "upload:text"]),
    ).toEqual(["upload:image", "upload:text"]);
  });

  it("rejects empty and unknown scope sets", () => {
    expect(() => normalizeApiKeyScopes([])).toThrow(
      "At least one API key scope is required",
    );
    expect(() => normalizeApiKeyScopes(["admin"])).toThrow(
      "Unknown API key scope",
    );
  });
});
