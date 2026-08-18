import { parseApiKey } from "./key-format";

export interface AuthorizationParserOptions {
  allowLegacyRaw?: boolean;
}

/**
 * Extracts a candidate from one Authorization header. This function never
 * inspects URLs; callers must not add query-string authentication fallbacks.
 */
export function parseApiKeyAuthorization(
  header: string | null,
  options: AuthorizationParserOptions = {},
): string | null {
  if (!header || header.length > 256 || header.includes(",")) return null;

  const bearer = /^Bearer ([^\s]+)$/i.exec(header);
  if (bearer?.[1]) {
    return parseApiKey(bearer[1]) ? bearer[1] : null;
  }

  if (options.allowLegacyRaw && parseApiKey(header)) return header;

  return null;
}
