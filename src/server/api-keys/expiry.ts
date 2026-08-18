const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Convert the small UI allowlist into an expiry timestamp.
 *
 * A switch is deliberate here. Indexing a plain object with attacker-provided
 * FormData also exposes inherited names such as `constructor` and `toString`.
 */
export function expiryDateFromChoice(
  value: FormDataEntryValue | null,
  nowMs = Date.now(),
): Date | null | undefined {
  if (typeof value !== "string") return undefined;

  switch (value) {
    case "never":
      return null;
    case "30":
      return new Date(nowMs + 30 * DAY_MS);
    case "90":
      return new Date(nowMs + 90 * DAY_MS);
    default:
      return undefined;
  }
}
