import { Client } from "minio";
import {
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "~/env";

async function main(): Promise<void> {
  if (
    env.NODE_ENV === "production" ||
    !env.SEEDYN_DEV_AUTH ||
    !/-(?:dev|ci)$/u.test(env.MINIO_BUCKET)
  ) {
    throw new Error(
      "Bucket setup requires local development auth and a -dev or -ci bucket",
    );
  }

  const client = new Client({
    endPoint: env.MINIO_URL,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_SECURE,
    accessKey: env.MINIO_KEY_ID,
    secretKey: env.MINIO_PASSWORD,
  });

  if (!(await client.bucketExists(env.MINIO_BUCKET))) {
    await client.makeBucket(env.MINIO_BUCKET);
  }

  const endpoint = `${env.MINIO_SECURE ? "https" : "http"}://${env.MINIO_URL}:${env.MINIO_PORT}`;
  const s3 = new S3Client({
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
  try {
    if (env.DIRECT_UPLOAD_TRANSPORT === "presigned") {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: env.MINIO_BUCKET,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [new URL(env.APP_URL).origin],
                AllowedMethods: ["PUT"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3_600,
              },
            ],
          },
        }),
      );
    }
    try {
      await s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: env.MINIO_BUCKET,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "seedyn-abort-incomplete-direct-uploads",
                Status: "Enabled",
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
              },
            ],
          },
        }),
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null
          ? Reflect.get(error, "name")
          : null;
      if (code !== "NotImplemented" && code !== "InvalidArgument") throw error;
      process.stderr.write(
        "Storage does not expose lifecycle configuration; schedule pnpm uploads:sweep and configure seven-day incomplete-multipart cleanup at the gateway.\n",
      );
    }
  } finally {
    s3.destroy();
  }
  process.stdout.write(
    `Prepared private development bucket ${env.MINIO_BUCKET} for ${env.DIRECT_UPLOAD_TRANSPORT} direct uploads.\n`,
  );
}

await main();
