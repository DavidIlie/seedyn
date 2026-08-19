import { createEnv } from "@t3-oss/env-nextjs";
import { isIP } from "node:net";
import { z } from "zod";

import { shouldSkipEnvironmentValidation } from "~/lib/env-validation";

const optionalSecret = z.string().min(1).optional();
const originUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}, "Must be an origin URL without credentials, path, query, or fragment");

export const env = createEnv({
  server: {
    APP_URL: originUrl,
    CDN_URL: originUrl,
    APP_HOSTS: z.string().min(1),
    MEDIA_HOSTS: z.string().min(1),
    POD_IP: z
      .string()
      .refine((value) => isIP(value) !== 0, "Must be a literal IP address")
      .optional(),
    AUTH_SECRET: optionalSecret,
    AUTH_DAVIDAPPS_ID: optionalSecret,
    AUTH_DAVIDAPPS_SECRET: optionalSecret,
    S3_MASTER_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    MINIO_URL: z.string().min(1),
    MINIO_PORT: z.coerce.number().int().min(1).max(65535),
    MINIO_SECURE: z.stringbool().default(true),
    MINIO_KEY_ID: z.string().min(1),
    MINIO_PASSWORD: z.string().min(1),
    MINIO_BUCKET: z.string().min(3),
    SEEDYN_DEV_AUTH: z.stringbool().default(false),
    SEEDYN_DEV_AUTH_EMAIL: z.email().optional(),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(4).default(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  experimental__runtimeEnv: {},
  skipValidation: shouldSkipEnvironmentValidation(
    process.env.SKIP_ENV_VALIDATION,
    process.env.NODE_ENV,
  ),
  emptyStringAsUndefined: true,
});

export function assertAuthConfigured(): void {
  if (env.SEEDYN_DEV_AUTH && env.NODE_ENV !== "production") return;

  if (
    !env.AUTH_SECRET ||
    !env.AUTH_DAVIDAPPS_ID ||
    !env.AUTH_DAVIDAPPS_SECRET
  ) {
    throw new Error("DavidApps authentication is not configured");
  }
}
