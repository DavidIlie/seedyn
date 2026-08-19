import { randomUUID } from "node:crypto";

import sharp from "sharp";
import {
  Agent,
  fetch as undiciFetch,
  FormData as UndiciFormData,
} from "undici";

import { env } from "~/env";
import { createApiKey } from "~/server/api-keys/service";
import { db } from "~/server/db";
import { deleteOwnedUpload } from "~/server/uploads/service";

type UploadResponse = {
  id: string;
  kind: string;
  url: string;
  message: string;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const LOOPBACK_DISPATCHER = new Agent({
  connect: {
    lookup: (_hostname, _options, callback) => {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
    },
  },
});

function fetchLocal(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input);
  if (url.hostname !== "localhost" && !url.hostname.endsWith(".localhost")) {
    return fetch(url, init);
  }
  return undiciFetch(url, {
    ...init,
    dispatcher: LOOPBACK_DISPATCHER,
  } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}

async function postUpload(input: {
  path: string;
  field: string;
  body: Blob;
  filename: string;
  authorization: string;
  expectedStatus: number;
}): Promise<Record<string, unknown>> {
  const form = new UndiciFormData();
  form.set(input.field, input.body, input.filename);
  const response = await fetchLocal(new URL(input.path, env.APP_URL), {
    method: "POST",
    headers: { Authorization: input.authorization },
    body: form as unknown as BodyInit,
  });
  if (response.status !== input.expectedStatus) {
    throw new Error(
      `${input.path} returned ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  invariant(
    env.NODE_ENV !== "production" && env.SEEDYN_DEV_AUTH,
    "Integration smoke requires explicit local development auth",
  );
  const appHost = new URL(env.APP_URL).hostname;
  const databaseHost = new URL(env.DATABASE_URL).hostname;
  invariant(
    appHost === "localhost" || appHost.endsWith(".localhost"),
    "Integration smoke requires a localhost application target",
  );
  invariant(
    databaseHost === "localhost" ||
      databaseHost === "127.0.0.1" ||
      databaseHost === "::1" ||
      databaseHost.endsWith(".localhost"),
    "Integration smoke requires a local database target",
  );
  const email = env.SEEDYN_DEV_AUTH_EMAIL?.toLowerCase();
  invariant(email, "SEEDYN_DEV_AUTH_EMAIL is required");
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  invariant(user, "Run pnpm db:seed or sign in locally first");

  const key = await createApiKey({
    userId: user.id,
    name: `Integration smoke ${randomUUID()}`,
    scopes: ["upload:image", "upload:file", "upload:text"],
  });
  const uploadIds: string[] = [];
  const publicUrls: string[] = [];
  let failure: unknown;

  try {
    const canonical = (await postUpload({
      path: "/api/upload",
      field: "file",
      body: new Blob(["Seedyn integration text"], { type: "text/plain" }),
      filename: "integration.txt",
      authorization: `Bearer ${key.rawKey}`,
      expectedStatus: 201,
    })) as UploadResponse;
    if (typeof canonical.id === "string") uploadIds.push(canonical.id);
    if (typeof canonical.url === "string") publicUrls.push(canonical.url);
    invariant(
      canonical.id && canonical.kind === "text",
      "Canonical shape is invalid",
    );
    invariant(
      canonical.url === canonical.message,
      "Canonical URL aliases differ",
    );
    const media = await fetchLocal(canonical.url);
    invariant(media.status === 200, "Public media GET failed");
    invariant(
      (await media.text()) === "Seedyn integration text",
      "Public media bytes differ",
    );
    const etag = media.headers.get("etag");
    invariant(etag, "Public media ETag is missing");
    const conditional = await fetchLocal(canonical.url, {
      headers: { "If-None-Match": etag },
    });
    invariant(conditional.status === 304, "Conditional media GET failed");
    const range = await fetchLocal(canonical.url, {
      headers: { Range: "bytes=0-5" },
    });
    invariant(range.status === 206, "Public media range failed");
    invariant((await range.text()) === "Seedyn", "Range bytes differ");
    const head = await fetchLocal(canonical.url, { method: "HEAD" });
    invariant(head.status === 200, "Public media HEAD failed");
    invariant(
      head.headers.get("content-length") === "23",
      "HEAD length differs",
    );

    const legacyText = await postUpload({
      path: "/api/texts",
      field: "text",
      body: new Blob(["legacy"], { type: "text/plain" }),
      filename: "legacy.txt",
      authorization: key.rawKey,
      expectedStatus: 200,
    });
    if (typeof legacyText.message === "string") {
      publicUrls.push(legacyText.message);
    }
    invariant(
      typeof legacyText.message === "string" &&
        Object.keys(legacyText).length === 1,
      "Legacy response shape differs",
    );
    const legacyTextRow = await db.upload.findUnique({
      where: {
        publicSlug: new URL(legacyText.message).pathname
          .split(".")[0]!
          .slice(1),
      },
      select: { id: true },
    });
    invariant(legacyTextRow, "Legacy text row is missing");
    uploadIds.push(legacyTextRow.id);

    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 188, b: 212, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const legacyImage = await postUpload({
      path: "/api/images",
      field: "image",
      body: new Blob([png], { type: "image/png" }),
      filename: "pixel.png",
      authorization: key.rawKey,
      expectedStatus: 200,
    });
    if (typeof legacyImage.message === "string") {
      publicUrls.push(legacyImage.message);
    }
    invariant(typeof legacyImage.message === "string", "Legacy image failed");
    const legacyImageRow = await db.upload.findUnique({
      where: {
        publicSlug: new URL(legacyImage.message).pathname
          .split(".")[0]!
          .slice(1),
      },
      select: { id: true },
    });
    invariant(legacyImageRow, "Legacy image row is missing");
    uploadIds.push(legacyImageRow.id);

    const legacyFile = await postUpload({
      path: "/api/files",
      field: "file",
      body: new Blob([new Uint8Array([0, 255, 0, 254])]),
      filename: "bytes.bin",
      authorization: key.rawKey,
      expectedStatus: 200,
    });
    if (typeof legacyFile.message === "string") {
      publicUrls.push(legacyFile.message);
    }
    invariant(typeof legacyFile.message === "string", "Legacy file failed");
    const legacyFileRow = await db.upload.findUnique({
      where: {
        publicSlug: new URL(legacyFile.message).pathname
          .split(".")[0]!
          .slice(1),
      },
      select: { id: true },
    });
    invariant(legacyFileRow, "Legacy file row is missing");
    uploadIds.push(legacyFileRow.id);

    // Next Proxy used to clone and silently cut request bodies at 10 MiB.
    // Exercise a genuinely larger multipart upload through the real HTTP stack
    // and MinIO multipart path so that regression cannot hide behind unit tests.
    const largeBytes = new Uint8Array(10 * 1024 * 1024 + 256 * 1024);
    largeBytes[0] = 0;
    largeBytes[1] = 255;
    const largeFile = await postUpload({
      path: "/api/files",
      field: "file",
      body: new Blob([largeBytes]),
      filename: "large-integration.bin",
      authorization: key.rawKey,
      expectedStatus: 200,
    });
    invariant(typeof largeFile.message === "string", "Large upload failed");
    publicUrls.push(largeFile.message);
    const largeSlug = new URL(largeFile.message).pathname
      .split(".")[0]!
      .slice(1);
    const largeFileRow = await db.upload.findUnique({
      where: { publicSlug: largeSlug },
      select: { id: true },
    });
    invariant(largeFileRow, "Large upload row is missing");
    uploadIds.push(largeFileRow.id);
    const largeHead = await fetchLocal(largeFile.message, { method: "HEAD" });
    invariant(largeHead.status === 200, "Large public media HEAD failed");
    invariant(
      largeHead.headers.get("content-length") === String(largeBytes.byteLength),
      "Large upload length differs",
    );

    const queryKey = await fetchLocal(
      new URL(
        `/api/upload?key=sdn_live_AAAAAAAA_${"A".repeat(43)}`,
        env.APP_URL,
      ),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.rawKey}` },
      },
    );
    invariant(queryKey.status === 401, "Query-string key was not rejected");

    process.stdout.write(
      "Integration smoke passed canonical, legacy, >10 MiB streaming, MinIO, CDN, range, ETag, and rejection contracts.\n",
    );
  } catch (error) {
    failure = error;
  }

  let cleanupFailure: unknown;
  for (const url of publicUrls) {
    try {
      const publicSlug = new URL(url).pathname.split(".")[0]?.slice(1);
      if (!publicSlug) throw new Error("Public URL has no slug");
      const row = await db.upload.findUnique({
        where: { publicSlug },
        select: { id: true },
      });
      if (row && !uploadIds.includes(row.id)) uploadIds.push(row.id);
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  for (const uploadId of uploadIds.reverse()) {
    try {
      await deleteOwnedUpload({ userId: user.id, uploadId });
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  try {
    await db.apiKey.deleteMany({ where: { id: key.id, userId: user.id } });
  } catch (error) {
    cleanupFailure ??= error;
  }
  for (const url of publicUrls) {
    try {
      const response = await fetchLocal(url);
      await response.body?.cancel();
      if (response.status === 404) continue;
      cleanupFailure ??= new Error(
        "Deleted media remained publicly retrievable",
      );
    } catch (error) {
      cleanupFailure ??= new Error("Could not verify deleted public media", {
        cause: error,
      });
    }
  }

  if (failure) throw failure;
  if (cleanupFailure) throw cleanupFailure;
}

await main().finally(async () => db.$disconnect());
