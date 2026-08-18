import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertProductionEnvironment } from "./production-env-preflight.mjs";

assertProductionEnvironment();

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");
await mkdir(resolve(standalone, ".next"), { recursive: true });
await Promise.all([
  cp(resolve(root, ".next/static"), resolve(standalone, ".next/static"), {
    recursive: true,
  }),
  cp(resolve(root, "public"), resolve(standalone, "public"), {
    recursive: true,
  }),
]);
await import(pathToFileURL(resolve(standalone, "server.js")).href);
