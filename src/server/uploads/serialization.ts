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
