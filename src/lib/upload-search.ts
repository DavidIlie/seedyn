/** Normalize a filename query exactly once for both UI state and DB filtering. */
export function normalizeUploadSearchQuery(value: string | undefined): string {
  return value?.normalize("NFC").trim().slice(0, 100) ?? "";
}

/**
 * Prisma's PostgreSQL `contains` filter is implemented with LIKE/ILIKE. Escape
 * its metacharacters so `%`, `_`, and `\` are searched as literal filename
 * characters rather than silently widening the result set.
 */
export function escapePostgresLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
