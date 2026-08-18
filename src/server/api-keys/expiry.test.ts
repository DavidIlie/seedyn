import { describe, expect, it } from "vitest";

import { expiryDateFromChoice } from "./expiry";

describe("API key expiry choices", () => {
  it("maps only the explicit allowlist", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(expiryDateFromChoice("never", now)).toBeNull();
    expect(expiryDateFromChoice("30", now)?.getTime()).toBe(
      now + 30 * 24 * 60 * 60 * 1_000,
    );
    expect(expiryDateFromChoice("90", now)?.getTime()).toBe(
      now + 90 * 24 * 60 * 60 * 1_000,
    );
  });

  it("rejects inherited object names and non-string form values", () => {
    for (const value of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "",
    ]) {
      expect(expiryDateFromChoice(value)).toBeUndefined();
    }
    expect(expiryDateFromChoice(null)).toBeUndefined();
    expect(expiryDateFromChoice(new File([], "expiry"))).toBeUndefined();
  });
});
