import "server-only";

import Redis from "ioredis";

import { env } from "~/env";

const REDIS_CONNECT_TIMEOUT_MS = 1_500;
const REDIS_COMMAND_TIMEOUT_MS = 1_000;

interface RedisGlobal {
  seedynRedis?: Redis;
  seedynRedisConnect?: Promise<void>;
}

const redisGlobal = globalThis as typeof globalThis & RedisGlobal;

function isRedisReady(client: Redis): boolean {
  return client.status === "ready";
}

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    autoResendUnfulfilledCommands: false,
    connectionName: "seedyn",
    retryStrategy(attempt) {
      return attempt <= 2 ? Math.min(attempt * 100, 250) : null;
    },
  });

  // ioredis emits errors even when command/connect promises reject. Consume the
  // event without logging its potentially sensitive connection details.
  client.on("error", () => undefined);
  return client;
}

export function getRedis(): Redis {
  redisGlobal.seedynRedis ??= createRedisClient();
  return redisGlobal.seedynRedis;
}

export async function ensureRedisReady(
  client: Redis = getRedis(),
): Promise<void> {
  if (client.status === "ready") return;

  if (client !== redisGlobal.seedynRedis) {
    if (client.status !== "wait" && client.status !== "end") {
      throw new Error("Redis is unavailable");
    }
    await client.connect();
    return;
  }

  if (!redisGlobal.seedynRedisConnect) {
    if (client.status !== "wait" && client.status !== "end") {
      throw new Error("Redis is unavailable");
    }

    redisGlobal.seedynRedisConnect = client.connect().finally(() => {
      redisGlobal.seedynRedisConnect = undefined;
    });
  }

  await redisGlobal.seedynRedisConnect;

  if (!isRedisReady(client)) {
    throw new Error("Redis is unavailable");
  }
}
