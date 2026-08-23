import { rmSync } from "node:fs";

/**
 * Remove route types that describe routes which may no longer exist.
 *
 * `tsconfig.json` includes `.next/dev/types/**`. Next writes that entry itself,
 * so deleting it from the config is not durable. Only `next dev` populates the
 * directory, and it writes one module per route: delete a route while the dev
 * server is stopped and its generated module survives, importing a file that is
 * gone. `pnpm typecheck` then fails forever with errors pointing at deleted
 * code, and `pnpm check` looks broken before any work starts.
 *
 * `next typegen` cannot repair it — that writes `.next/types`, a different
 * directory — so clear the dev copy first. Nothing is lost: `next typegen`
 * regenerates the authoritative route types, and the next dev compile
 * regenerates its own.
 */
rmSync(new URL("../.next/dev/types", import.meta.url), {
  recursive: true,
  force: true,
});
