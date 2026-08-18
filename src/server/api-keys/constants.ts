export const API_KEY_SCOPES = [
  "upload:image",
  "upload:file",
  "upload:text",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const API_KEY_SCOPE_SET: ReadonlySet<string> = new Set(API_KEY_SCOPES);

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return API_KEY_SCOPE_SET.has(value);
}

export function normalizeApiKeyScopes(
  scopes: readonly string[],
): ApiKeyScope[] {
  const requested = new Set(scopes);

  if (requested.size === 0) {
    throw new Error("At least one API key scope is required");
  }

  for (const scope of requested) {
    if (!isApiKeyScope(scope)) {
      throw new Error("Unknown API key scope");
    }
  }

  return API_KEY_SCOPES.filter((scope) => requested.has(scope));
}
