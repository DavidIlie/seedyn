export const CUSTOM_PUBLIC_SLUG_MIN_LENGTH = 3;
export const CUSTOM_PUBLIC_SLUG_MAX_LENGTH = 48;

const CUSTOM_PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCustomPublicSlug(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("en-US");
}

export function customPublicSlugError(value: string): string | null {
  const normalized = normalizeCustomPublicSlug(value);
  if (
    normalized.length < CUSTOM_PUBLIC_SLUG_MIN_LENGTH ||
    normalized.length > CUSTOM_PUBLIC_SLUG_MAX_LENGTH
  ) {
    return `Use ${CUSTOM_PUBLIC_SLUG_MIN_LENGTH}–${CUSTOM_PUBLIC_SLUG_MAX_LENGTH} characters.`;
  }
  if (!CUSTOM_PUBLIC_SLUG_PATTERN.test(normalized)) {
    return "Use lowercase letters, numbers, and single hyphens only.";
  }
  return null;
}
