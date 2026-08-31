import type { Prisma } from "@prisma/client";

const TOKEN_LIKE_KEY = /(?:authorization|cookie|secret|token|password|key)/iu;
const SAFE_VALUE = /^[\p{L}\p{N} ._:@/+-]{0,160}$/u;

export function safeAuditMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined,
): Prisma.InputJsonObject | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !TOKEN_LIKE_KEY.test(key))
      .slice(0, 12)
      .map(([key, value]) => {
        if (typeof value !== "string") return [key.slice(0, 40), value];
        const clean = value.normalize("NFC").slice(0, 160);
        return [
          key.slice(0, 40),
          SAFE_VALUE.test(clean) ? clean : "[redacted]",
        ];
      }),
  );
}
