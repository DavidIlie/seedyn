import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = resolve(root, "node_modules/@ffmpeg/core/dist/esm");
// The worker is served unbundled too: bundlers rewrite its `import(coreURL)`
// into a "too dynamic" throw, so the bundled copy can never load the core.
const worker = resolve(root, "node_modules/@ffmpeg/ffmpeg/dist/esm");
const destination = resolve(root, "public/ffmpeg");

await mkdir(destination, { recursive: true });
await Promise.all([
  ...["ffmpeg-core.js", "ffmpeg-core.wasm"].map((filename) =>
    copyFile(resolve(core, filename), resolve(destination, filename)),
  ),
  ...["worker.js", "const.js", "errors.js"].map((filename) =>
    copyFile(resolve(worker, filename), resolve(destination, filename)),
  ),
]);
