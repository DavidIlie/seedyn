"use server";

import { refresh } from "next/cache";

import {
  createApiKey,
  ApiKeyInputError,
  isApiKeyScope,
  revokeApiKey,
  updateApiKeyMediaDomain,
  updateApiKeyName,
  type ApiKeyScope,
} from "~/server/api-keys";
import { expiryDateFromChoice } from "~/server/api-keys/expiry";
import {
  describeS3Credential,
  rotateS3Credential,
  S3CredentialConfigurationError,
  S3CredentialInputError,
} from "~/server/api-keys/s3-credentials";
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
      id: string;
      name: string;
      slug: string;
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
  const mediaDomain = formData.get("mediaDomain");
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
      mediaDomain: typeof mediaDomain === "string" ? mediaDomain : null,
      scopes,
      expiresAt,
    });

    // The list below is server-rendered, so re-read it rather than splicing a
    // row in on the client.
    refresh();

    return {
      status: "created",
      id: created.id,
      name: created.name,
      slug: created.slug,
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

export type UpdateKeyNameState =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

export type UpdateKeyDomainState = UpdateKeyNameState;

export type S3CredentialState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "revealed";
      accessKeyId: string;
      /** Returned once by this mutation and never persisted in Postgres. */
      secretAccessKey: string;
      bucket: string;
      endpoint: string;
      publicBaseUrl: string;
      publicNamespace: string;
    };

const API_KEY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export async function rotateS3CredentialAction(
  _previous: S3CredentialState,
  formData: FormData,
): Promise<S3CredentialState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      status: "error",
      message:
        authorization.status === 429
          ? "Too many credential changes. Wait a moment."
          : "Your session or request origin could not be verified.",
    };
  }

  const apiKeyId = formData.get("apiKeyId");
  if (typeof apiKeyId !== "string" || !API_KEY_ID.test(apiKeyId)) {
    return { status: "error", message: "The API key is invalid." };
  }

  try {
    const credential = await rotateS3Credential({
      apiKeyId,
      userId: authorization.userId,
    });
    const display = describeS3Credential(
      credential.publicNamespace,
      credential.mediaDomain,
      credential.userDefaultMediaDomain,
    );
    refresh();
    return {
      status: "revealed",
      accessKeyId: credential.accessKeyId,
      secretAccessKey: credential.secretAccessKey,
      ...display,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof S3CredentialInputError ||
        error instanceof S3CredentialConfigurationError
          ? error.message
          : "The S3 credential could not be created. Try again.",
    };
  }
}

export async function updateApiKeyNameAction(
  _previous: UpdateKeyNameState,
  formData: FormData,
): Promise<UpdateKeyNameState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      status: "error",
      message:
        authorization.status === 429
          ? "Too many key changes. Wait a moment."
          : "Your session or request origin could not be verified.",
    };
  }

  const apiKeyId = formData.get("apiKeyId");
  const name = formData.get("name");
  if (
    typeof apiKeyId !== "string" ||
    apiKeyId.length === 0 ||
    apiKeyId.length > 128 ||
    typeof name !== "string"
  ) {
    return { status: "error", message: "The name could not be saved." };
  }

  try {
    const updated = await updateApiKeyName({
      userId: authorization.userId,
      apiKeyId,
      name,
    });
    if (!updated) {
      return { status: "error", message: "The API key was not found." };
    }
    refresh();
    return {
      status: "saved",
      message: "Name saved. The identifier stays unchanged.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof ApiKeyInputError
          ? error.message
          : "The name could not be saved.",
    };
  }
}

export async function updateApiKeyMediaDomainAction(
  _previous: UpdateKeyDomainState,
  formData: FormData,
): Promise<UpdateKeyDomainState> {
  const authorization = await authorizeServerActionMutation();
  if (authorization instanceof Response) {
    return {
      status: "error",
      message:
        authorization.status === 429
          ? "Too many key changes. Wait a moment."
          : "Your session or request origin could not be verified.",
    };
  }

  const apiKeyId = formData.get("apiKeyId");
  const mediaDomain = formData.get("mediaDomain");
  if (
    typeof apiKeyId !== "string" ||
    apiKeyId.length === 0 ||
    apiKeyId.length > 128 ||
    typeof mediaDomain !== "string"
  ) {
    return { status: "error", message: "The media domain could not be saved." };
  }

  try {
    const updated = await updateApiKeyMediaDomain({
      userId: authorization.userId,
      apiKeyId,
      mediaDomain,
    });
    if (!updated) {
      return { status: "error", message: "The API key was not found." };
    }
    refresh();
    return {
      status: "saved",
      message: mediaDomain
        ? "Future uploads will use this domain."
        : "Future uploads will follow the account default.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof ApiKeyInputError
          ? error.message
          : "The media domain could not be saved.",
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
