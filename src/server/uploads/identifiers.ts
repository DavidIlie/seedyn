import { randomBytes, randomUUID } from "node:crypto";

const SLUG_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export function createRecordId(): string {
  return randomUUID();
}

export function createPublicSlug(): string {
  // 192 random bits. The slug contains no user, filename, time, or checksum data.
  return randomBytes(24).toString("base64url");
}

export function isPublicSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function normalizePublicExtension(value: string): string | null {
  const extension = value.toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : null;
}
