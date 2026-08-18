"use server";

import { refresh } from "next/cache";

import {
  createApiKey,
  ApiKeyInputError,
  isApiKeyScope,
  revokeApiKey,
  type ApiKeyScope,
} from "~/server/api-keys";
import { expiryDateFromChoice } from "~/server/api-keys/expiry";
import { authorizeServerActionMutation } from "~/server/http/browser-mutation";

/**
 * API-key mutations.
 *
 * `createApiKeyAction` is the only place in the product where a complete key
 * exists outside the caller's own storage. It returns the key exactly once, to
 * the component that asked for it, and nothing writes it anywhere else: not the
 * URL, not `localStorage`, not a log line, and not a later "download config"
 * endpoint. The digest in the database cannot reproduce it.
 */

export type CreateKeyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "created";
      name: string;
      prefix: string;
      scopes: ApiKeyScope[];
      /** Present in this response only. Never persisted, never re-fetchable. */
      rawKey: string;
    };

export async function createApiKeyAction(
  _previous: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      status: "error",
      message:
        authorization.status === 429
          ? "Too many key changes. Wait a moment and try again."
          : "Your session or request origin could not be verified.",
    };
  }

  const name = formData.get("name");
  if (typeof name !== "string" || name.trim().length === 0) {
    return {
      status: "error",
      message: "Give the key a name you will recognise.",
    };
  }

  const scopes = formData
    .getAll("scopes")
    .filter((value): value is string => typeof value === "string")
    .filter(isApiKeyScope);

  if (scopes.length === 0) {
    return { status: "error", message: "Choose at least one scope." };
  }

  const expiresAt = expiryDateFromChoice(formData.get("expiry"));
  if (expiresAt === undefined) {
    return { status: "error", message: "Choose a valid expiry." };
  }

  try {
    const created = await createApiKey({
      userId: authorization.userId,
      name,
      scopes,
      expiresAt,
    });

    // The list below is server-rendered, so re-read it rather than splicing a
    // row in on the client.
    refresh();

    return {
      status: "created",
      name: created.name,
      prefix: created.prefix,
      scopes: created.scopes,
      rawKey: created.rawKey,
    };
  } catch (error) {
    // `createApiKey` throws on a duplicate name, a bad name, or an unknown
    // scope. Its messages are safe to show and contain no key material.
    return {
      status: "error",
      message:
        error instanceof ApiKeyInputError
          ? error.message
          : "The key could not be created. Try again.",
    };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) return;
  const apiKeyId = formData.get("apiKeyId");
  if (typeof apiKeyId !== "string" || apiKeyId.length === 0) return;

  // Scoped by user id: revoking someone else's key id simply matches nothing.
  await revokeApiKey(authorization.userId, apiKeyId);
  refresh();
}
