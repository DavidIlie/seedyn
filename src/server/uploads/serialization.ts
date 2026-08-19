type VariantLike = {
  id: string;
  publicSlug: string;
  kind: string;
  state: string;
  extension: string;
  contentType: string;
  disposition: string;
  byteSize: bigint;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
};

type UploadLike = {
  id: string;
  publicSlug: string;
  kind: string;
  state: string;
  originalName: string;
  textLanguage: string | null;
  passwordHash?: string | null;
  origin: SerializedUploadOrigin;
  apiKeyIdSnapshot: string | null;
  apiKeyNameSnapshot: string | null;
  clientLabelSnapshot: string | null;
  s3ObjectKey: string | null;
  s3PublicNamespaceSnapshot: string | null;
  extension: string;
  contentType: string;
  disposition: string;
  byteSize: bigint;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  variants?: readonly VariantLike[];
};

export type SerializedUploadOrigin =
  | "LEGACY_UNKNOWN"
  | "BROWSER"
  | "HTTP"
  | "SHAREX"
  | "S3";

export type SerializedUploadProvenance = {
  origin: SerializedUploadOrigin;
  credential: {
    id: string;
    name: string;
    clientLabel: string | null;
  } | null;
  s3: { objectKey: string; publicNamespace: string } | null;
};

type UploadProvenanceLike = Pick<
  UploadLike,
  | "origin"
  | "apiKeyIdSnapshot"
  | "apiKeyNameSnapshot"
  | "clientLabelSnapshot"
  | "s3ObjectKey"
  | "s3PublicNamespaceSnapshot"
>;

export function serializeUploadProvenance(
  value: UploadProvenanceLike,
): SerializedUploadProvenance {
  return {
    origin: value.origin,
    credential:
      value.apiKeyIdSnapshot && value.apiKeyNameSnapshot
        ? {
            id: value.apiKeyIdSnapshot,
            name: value.apiKeyNameSnapshot,
            clientLabel: value.clientLabelSnapshot,
          }
        : null,
    s3:
      value.s3ObjectKey && value.s3PublicNamespaceSnapshot
        ? {
            objectKey: value.s3ObjectKey,
            publicNamespace: value.s3PublicNamespaceSnapshot,
          }
        : null,
  };
}

export type SerializedVariant = {
  id: string;
  publicSlug: string;
  kind: string;
  state: string;
  extension: string;
  contentType: string;
  disposition: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
};

export type SerializedUpload = {
  id: string;
  publicSlug: string;
  kind: string;
  state: string;
  originalName: string;
  textLanguage: string | null;
  passwordProtected: boolean;
  provenance: SerializedUploadProvenance;
  extension: string;
  contentType: string;
  disposition: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  variants: SerializedVariant[];
};

export function serializeVariant(value: VariantLike): SerializedVariant {
  return {
    id: value.id,
    publicSlug: value.publicSlug,
    kind: value.kind,
    state: value.state,
    extension: value.extension,
    contentType: value.contentType,
    disposition: value.disposition,
    byteSize: value.byteSize.toString(10),
    width: value.width,
    height: value.height,
    durationMs: value.durationMs,
    createdAt: value.createdAt.toISOString(),
  };
}

export function serializeUpload(value: UploadLike): SerializedUpload {
  return {
    id: value.id,
    publicSlug: value.publicSlug,
    kind: value.kind,
    state: value.state,
    originalName: value.originalName,
    textLanguage: value.textLanguage,
    passwordProtected: Boolean(value.passwordHash),
    provenance: serializeUploadProvenance(value),
    extension: value.extension,
    contentType: value.contentType,
    disposition: value.disposition,
    byteSize: value.byteSize.toString(10),
    width: value.width,
    height: value.height,
    durationMs: value.durationMs,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    variants: (value.variants ?? []).map(serializeVariant),
  };
}
