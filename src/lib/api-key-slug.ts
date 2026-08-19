import slugify from "@sindresorhus/slugify";

export const API_KEY_SLUG_MAX_LENGTH = 48;

/**
 * Stable, ASCII machine identifier derived from the human credential name.
 * Database collision handling appends -2, -3, and so on.
 */
export function apiKeySlugBase(name: string): string {
  const slug = slugify(name.normalize("NFKC"), {
    decamelize: false,
    lowercase: true,
    separator: "-",
    transliterate: true,
  })
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, API_KEY_SLUG_MAX_LENGTH)
    .replace(/-$/u, "");

  return slug || "key";
}
