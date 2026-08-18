import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@ffmpeg/core/dist/esm");
const destination = resolve(root, "public/ffmpeg");

await mkdir(destination, { recursive: true });
await Promise.all(
  ["ffmpeg-core.js", "ffmpeg-core.wasm"].map((filename) =>
    copyFile(resolve(source, filename), resolve(destination, filename)),
  ),
);
