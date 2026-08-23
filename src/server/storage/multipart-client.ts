import "server-only";

import type { Readable } from "node:stream";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "~/env";
import {
  storageMetadata,
  type ManagedObjectMetadata,
} from "~/server/storage/object-store";
import type { ObservedUploadPart } from "~/server/uploads/direct/plan";

export type MultipartStorage = {
  create(input: {
    key: string;
    contentType: string;
    metadata: ManagedObjectMetadata;
  }): Promise<string>;
  signPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<string>;
  uploadPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    byteSize: number;
    body: Readable;
  }): Promise<string>;
  listParts(input: {
    key: string;
    uploadId: string;
  }): Promise<ObservedUploadPart[]>;
  complete(input: {
    key: string;
    uploadId: string;
    parts: ReadonlyArray<ObservedUploadPart>;
  }): Promise<void>;
  abort(input: {
    key: string;
    uploadId: string;
  }): Promise<"aborted" | "missing">;
};

function endpointFromInternalConfiguration(): string {
  const protocol = env.MINIO_SECURE ? "https" : "http";
  const defaultPort = env.MINIO_SECURE ? 443 : 80;
  const port = env.MINIO_PORT === defaultPort ? "" : `:${env.MINIO_PORT}`;
  return `${protocol}://${env.MINIO_URL}${port}`;
}

function createS3Client(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    forcePathStyle: true,
    region: env.MINIO_REGION,
    credentials: {
      accessKeyId: env.MINIO_KEY_ID,
      secretAccessKey: env.MINIO_PASSWORD,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const globalForMultipartStorage = globalThis as unknown as {
  seedynInternalS3?: S3Client;
  seedynPublicS3?: S3Client;
};

const internalClient =
  globalForMultipartStorage.seedynInternalS3 ??
  createS3Client(endpointFromInternalConfiguration());
const publicSigningClient =
  globalForMultipartStorage.seedynPublicS3 ??
  createS3Client(env.MINIO_PUBLIC_URL);

if (env.NODE_ENV !== "production") {
  globalForMultipartStorage.seedynInternalS3 = internalClient;
  globalForMultipartStorage.seedynPublicS3 = publicSigningClient;
}

function storageErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const name = Reflect.get(error, "name");
  if (typeof name === "string") return name;
  const code = Reflect.get(error, "Code") ?? Reflect.get(error, "code");
  return typeof code === "string" ? code : null;
}

export function isMissingMultipartUpload(error: unknown): boolean {
  return storageErrorCode(error) === "NoSuchUpload";
}

class S3MultipartStorage implements MultipartStorage {
  async create(input: {
    key: string;
    contentType: string;
    metadata: ManagedObjectMetadata;
  }): Promise<string> {
    const result = await internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: env.MINIO_BUCKET,
        Key: input.key,
        ContentType: input.contentType,
        Metadata: storageMetadata(input.metadata),
      }),
    );
    if (!result.UploadId) {
      throw new Error("Object storage returned no multipart upload id");
    }
    return result.UploadId;
  }

  async signPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      publicSigningClient,
      new UploadPartCommand({
        Bucket: env.MINIO_BUCKET,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async listParts(input: {
    key: string;
    uploadId: string;
  }): Promise<ObservedUploadPart[]> {
    const parts: ObservedUploadPart[] = [];
    let marker: string | undefined;
    do {
      const result = await internalClient.send(
        new ListPartsCommand({
          Bucket: env.MINIO_BUCKET,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumberMarker: marker,
          MaxParts: 1_000,
        }),
      );
      for (const part of result.Parts ?? []) {
        if (
          part.PartNumber === undefined ||
          part.Size === undefined ||
          part.ETag === undefined
        ) {
          throw new Error("Object storage returned an incomplete part record");
        }
        parts.push({
          partNumber: part.PartNumber,
          byteSize: part.Size,
          eTag: part.ETag,
        });
      }
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
      if (result.IsTruncated && !marker) {
        throw new Error(
          "Object storage returned a truncated part list without a marker",
        );
      }
    } while (marker);
    return parts;
  }

  async uploadPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    byteSize: number;
    body: Readable;
  }): Promise<string> {
    const result = await internalClient.send(
      new UploadPartCommand({
        Bucket: env.MINIO_BUCKET,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.byteSize,
        Body: input.body,
      }),
    );
    if (!result.ETag) throw new Error("Object storage returned no part ETag");
    return result.ETag;
  }

  async complete(input: {
    key: string;
    uploadId: string;
    parts: ReadonlyArray<ObservedUploadPart>;
  }): Promise<void> {
    await internalClient.send(
      new CompleteMultipartUploadCommand({
        Bucket: env.MINIO_BUCKET,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts.map((part) => ({
            ETag: part.eTag,
            PartNumber: part.partNumber,
          })),
        },
      }),
    );
  }

  async abort(input: {
    key: string;
    uploadId: string;
  }): Promise<"aborted" | "missing"> {
    try {
      await internalClient.send(
        new AbortMultipartUploadCommand({
          Bucket: env.MINIO_BUCKET,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
      return "aborted";
    } catch (error) {
      if (isMissingMultipartUpload(error)) return "missing";
      throw error;
    }
  }
}

export const multipartStorage: MultipartStorage = new S3MultipartStorage();

export { S3MultipartStorage };
