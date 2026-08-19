import "server-only";

import { parseApiKeyAuthorization } from "~/server/api-keys/authorization";
import type { ApiKeyScope } from "~/server/api-keys/constants";
import { resolveApiKeyIdentity } from "~/server/api-keys/service";
import { domainErrorResponse } from "~/server/http/errors";
import { resolveMediaDomainPreference } from "~/server/media/origin-preferences";
import {
  checkAuthenticatedUploadRateLimit,
  checkAuthenticationRateLimit,
  contentLengthIsPermitted,
  createRequestId,
  isAppHostRequest,
  rateLimitFailureResponse,
  requestSourceAddress,
  safeJsonError,
  successRateLimitHeaders,
} from "~/server/http/request";
import {
  assertClassificationSize,
  assertForcedUploadKind,
  classifyUpload,
  type ForcedUploadKind,
  type UploadKindValue,
} from "~/server/uploads/classification";
import { DomainError } from "~/server/uploads/errors";
import {
  parseMultipartUpload,
  UPLOAD_LIMITS,
} from "~/server/uploads/multipart";
import { createUpload } from "~/server/uploads/service";

type MachineUploadRoute = {
  fileField: "file" | "image" | "text";
  forcedKind: ForcedUploadKind;
  origin: "HTTP" | "SHAREX";
};

function requiredScope(kind: UploadKindValue): ApiKeyScope {
  if (kind === "IMAGE") return "upload:image";
  if (kind === "TEXT") return "upload:text";
  return "upload:file";
}

function fixedLegacyScope(route: MachineUploadRoute): ApiKeyScope | null {
  if (route.origin !== "SHAREX" || route.forcedKind === "auto") return null;
  if (route.forcedKind === "image") return "upload:image";
  if (route.forcedKind === "text") return "upload:text";
  return "upload:file";
}

function maximumBytes(route: MachineUploadRoute): number {
  return route.forcedKind === "image" || route.forcedKind === "text"
    ? UPLOAD_LIMITS.imageOrText
    : UPLOAD_LIMITS.generic;
}

function requestedKind(value: string | undefined): ForcedUploadKind | null {
  if (value === undefined || value === "auto") return "auto";
  if (value === "image" || value === "file" || value === "text") return value;
  return null;
}

export async function handleMachineUpload(
  request: Request,
  route: MachineUploadRoute,
): Promise<Response> {
  const requestId = createRequestId();
  if (!isAppHostRequest(request)) {
    return safeJsonError(404, "not_found", "Not found.", requestId);
  }

  const url = new URL(request.url);
  if (url.searchParams.has("key") || url.searchParams.has("api_key")) {
    return safeJsonError(
      401,
      "invalid_api_key",
      "A valid API key is required.",
      requestId,
    );
  }

  const candidate = parseApiKeyAuthorization(
    request.headers.get("authorization"),
    { allowLegacyRaw: route.origin === "SHAREX" },
  );
  if (!candidate) {
    return safeJsonError(
      401,
      "invalid_api_key",
      "A valid API key is required.",
      requestId,
    );
  }

  const sourceAddress = requestSourceAddress(request);
  if (!sourceAddress) {
    return safeJsonError(
      503,
      "rate_limit_unavailable",
      "Upload protection is temporarily unavailable.",
      requestId,
    );
  }

  const authLimit = await checkAuthenticationRateLimit({
    candidate,
    sourceAddress,
  });
  if (!authLimit.allowed) return rateLimitFailureResponse(authLimit, requestId);

  let key;
  try {
    key = await resolveApiKeyIdentity(candidate);
  } catch (error) {
    return domainErrorResponse(
      new DomainError("database_unavailable", { cause: error }),
      requestId,
    );
  }
  if (!key) {
    return safeJsonError(
      401,
      "invalid_api_key",
      "A valid API key is required.",
      requestId,
    );
  }

  const uploadLimit = await checkAuthenticatedUploadRateLimit({
    userId: key.userId,
    sourceAddress,
  });
  if (!uploadLimit.allowed) {
    return rateLimitFailureResponse(uploadLimit, requestId);
  }

  const routeScope = fixedLegacyScope(route);
  if (routeScope && !key.scopes.includes(routeScope)) {
    return safeJsonError(
      403,
      "missing_scope",
      "The API key does not permit this upload type.",
      requestId,
    );
  }

  const maximum = maximumBytes(route);
  if (!contentLengthIsPermitted(request, maximum)) {
    return safeJsonError(
      413,
      "payload_too_large",
      "The multipart request exceeds the permitted size.",
      requestId,
    );
  }

  let file;
  try {
    file = await parseMultipartUpload(request, {
      permittedFileFields: new Set([route.fileField]),
      permittedScalarFields:
        route.origin === "SHAREX"
          ? new Set(["filename", "textLanguage"])
          : new Set(["kind", "filename", "textLanguage"]),
      maxFileBytes: maximum,
    });
    const forcedKind =
      route.origin === "SHAREX"
        ? route.forcedKind
        : requestedKind(file.fields.kind);
    if (!forcedKind) {
      return safeJsonError(
        400,
        "invalid_input",
        "The kind field must be auto, image, file, or text.",
        requestId,
      );
    }

    const classification = await classifyUpload(file, {
      forcedKind,
      textLanguage: file.fields.textLanguage,
    });
    assertClassificationSize(file, classification);
    assertForcedUploadKind(classification, forcedKind);
    const authoritativeScope = routeScope ?? requiredScope(classification.kind);
    if (!key.scopes.includes(authoritativeScope)) {
      return safeJsonError(
        403,
        "missing_scope",
        "The API key does not permit this upload type.",
        requestId,
      );
    }

    const result = await createUpload({
      userId: key.userId,
      mediaOrigin: resolveMediaDomainPreference(
        key.mediaDomain,
        key.userDefaultMediaDomain,
      ).origin,
      file,
      provenance: {
        origin: route.origin,
        credential: {
          id: key.id,
          name: key.name,
          slug: key.slug,
        },
      },
      classification,
      forcedKind,
      signal: request.signal,
    });
    const headers = successRateLimitHeaders(uploadLimit);
    headers.set("Cache-Control", "no-store");
    if (route.origin === "SHAREX") {
      return Response.json({ message: result.url }, { status: 200, headers });
    }
    return Response.json(
      {
        id: result.upload.id,
        kind: result.upload.kind.toLowerCase(),
        url: result.url,
        message: result.url,
      },
      { status: 201, headers },
    );
  } catch (error) {
    return domainErrorResponse(error, requestId);
  } finally {
    await file?.dispose().catch(() => undefined);
  }
}
