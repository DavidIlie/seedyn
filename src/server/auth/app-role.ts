export const SEEDYN_ROLES = ["MEMBER", "ADMIN"] as const;

export type SeedynRole = (typeof SEEDYN_ROLES)[number];

/**
 * DavidApps signs a per-application `app_role` into the validated ID token.
 * Seedyn has only two authorization levels, so every non-admin application
 * role deliberately collapses to MEMBER. Unknown and malformed claims fail
 * closed the same way.
 */
export function seedynRoleFromDavidAppsClaim(value: unknown): SeedynRole {
  return value === "admin" ? "ADMIN" : "MEMBER";
}

export function isSeedynRole(value: unknown): value is SeedynRole {
  return value === "MEMBER" || value === "ADMIN";
}
