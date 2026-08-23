import { randomBytes, randomUUID } from "node:crypto";

const SLUG_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,62}[A-Za-z0-9])?$/;

export function createRecordId(): string {
  return randomUUID();
}

export function createPublicSlug(): string {
  // Fixed alphanumeric guards keep all 192 random bits while satisfying the
  // public route's stricter first/last-character contract.
  return `s${randomBytes(24).toString("base64url")}s`;
}

export function isPublicSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function normalizePublicExtension(value: string): string | null {
  const extension = value.toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : null;
}
