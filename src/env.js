import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    DATABASE_URL: z.string().url(),

    APP_URL: z.string().url(),

    ENABLED_UPLOAD_MANAGERS: z.array(z.enum(["FS", "MINIO"])),
    FS_MANAGER_UPLOAD_DIR: z.string(),

    MINIO_UPLOAD_DIR: z.string(),
    MINIO_PORT: z.string(),
    MINIO_KEY_ID: z.string(),
    MINIO_KEY_SECRET: z.string(),

    AUTH_DISCORD_ID: z.string(),
    AUTH_DISCORD_SECRET: z.string(),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },
  experimental__runtimeEnv: {},
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
