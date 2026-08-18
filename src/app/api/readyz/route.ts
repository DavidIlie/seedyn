import { connection } from "next/server";

import { db } from "~/server/db";
import { isDirectProbeRequest } from "~/server/http/request";
import { ensureRedisReady, getRedis } from "~/server/redis";
import { checkObjectStorageReadiness } from "~/server/storage/minio";

const READINESS_CACHE_MS = 1_000;
const READINESS_TIMEOUT_MS = 3_000;

let cachedReadiness: { ready: boolean; expiresAt: number } | null = null;
let dependencyCheckInFlight: Promise<boolean> | null = null;

async function dependenciesAreReady(): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    db.$queryRaw`SELECT 1`,
    ensureRedisReady(redis).then(async () => {
      if ((await redis.ping()) !== "PONG")
        throw new Error("Redis is unavailable");
      return undefined;
    }),
    checkObjectStorageReadiness(),
  ]);
}

function currentDependencyCheck(): Promise<boolean> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return Promise.resolve(cachedReadiness.ready);
  }
  if (dependencyCheckInFlight) return dependencyCheckInFlight;

  const operation = dependenciesAreReady().then(
    () => true,
    () => false,
  );
  const tracked = operation
    .then((ready) => {
      cachedReadiness = {
        ready,
        expiresAt: Date.now() + READINESS_CACHE_MS,
      };
      return ready;
    })
    .finally(() => {
      if (dependencyCheckInFlight === tracked) dependencyCheckInFlight = null;
    });
  dependencyCheckInFlight = tracked;
  return tracked;
}

async function readReadinessWithinTimeout(): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      currentDependencyCheck(),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function unavailable(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  // Defense in depth: proxy.ts has the same loopback/exact-POD_IP rule, but the
  // dependency-bearing handler does not rely on a front-of-stack matcher.
  if (!isDirectProbeRequest(request)) return unavailable();

  await connection();
  if (await readReadinessWithinTimeout()) {
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { status: "not_ready" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
