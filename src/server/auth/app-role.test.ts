import { describe, expect, it } from "vitest";

import { isSeedynRole, seedynRoleFromDavidAppsClaim } from "./app-role";

describe("Seedyn application roles", () => {
  it("accepts only DavidApps' exact admin application role", () => {
    expect(seedynRoleFromDavidAppsClaim("admin")).toBe("ADMIN");

    for (const claim of [
      "member",
      "reader",
      "writer",
      "visitor",
      "Admin",
      "platform_admin",
      "david@davidilie.com",
      "",
      null,
      undefined,
      { role: "admin" },
    ]) {
      expect(seedynRoleFromDavidAppsClaim(claim)).toBe("MEMBER");
    }
  });

  it("recognizes only persisted Seedyn roles", () => {
    expect(isSeedynRole("ADMIN")).toBe(true);
    expect(isSeedynRole("MEMBER")).toBe(true);
    expect(isSeedynRole("admin")).toBe(false);
  });
});
