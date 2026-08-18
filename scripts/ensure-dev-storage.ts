import { Client } from "minio";

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

  if (await client.bucketExists(env.MINIO_BUCKET)) {
    process.stdout.write(
      `Development bucket ${env.MINIO_BUCKET} already exists and remains private.\n`,
    );
    return;
  }

  await client.makeBucket(env.MINIO_BUCKET);
  process.stdout.write(
    `Created private development bucket ${env.MINIO_BUCKET}.\n`,
  );
}

await main();
