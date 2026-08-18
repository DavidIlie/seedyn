import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import nextEnv from "@next/env";

const target = process.argv[2];
if (!target) throw new Error("A script path is required");
if (!process.env.NODE_ENV) {
  throw new Error("NODE_ENV must be explicit before loading an environment");
}

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
await import(pathToFileURL(resolve(process.cwd(), target)).href);
