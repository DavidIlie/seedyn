import { describe, expect, it } from "vitest";

import { shouldSkipEnvironmentValidation } from "./lib/env-validation";

describe("environment validation override", () => {
  it.each(["1", "true", "TRUE", " yes ", "on", "y", "enabled"])(
    "accepts an explicit development opt-in (%s)",
    (value) => {
      expect(shouldSkipEnvironmentValidation(value, "development")).toBe(true);
    },
  );

  it.each([undefined, "", "0", "false", "no", "off", "random"])(
    "does not treat %s as truthy",
    (value) => {
      expect(shouldSkipEnvironmentValidation(value, "test")).toBe(false);
    },
  );

  it("never disables validation in production", () => {
    expect(shouldSkipEnvironmentValidation("true", "production")).toBe(false);
  });
});
