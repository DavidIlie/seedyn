import { spawn } from "node:child_process";
import { readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const exposeInstantTesting =
  process.env.SEEDYN_BUILD_INSTANT_TESTING === "true";

// Next evaluates route modules while collecting build output. Use deliberately
// non-secret OIDC values for that child process so a local development provider
// never weakens the production runtime guard. These values are not inherited by
// the standalone server; its entrypoint and instrumentation validate the real
// runtime environment.
const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    NEXT_INSTANT_TESTING: exposeInstantTesting ? "true" : "false",
    SEEDYN_BUILD_INSTANT_TESTING: "false",
    SEEDYN_DEV_AUTH: "false",
    AUTH_SECRET: "seedyn-build-only-auth-secret-never-used-at-runtime",
    AUTH_DAVIDAPPS_ID: "seedyn-build-only-client",
    AUTH_DAVIDAPPS_SECRET: "seedyn-build-only-client-secret",
  },
});

child.once("error", (error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to start Next.js",
  );
  process.exitCode = 1;
});

async function removeStandaloneEnvironmentCopies() {
  const standalone = resolve(process.cwd(), ".next/standalone");
  let entries;
  try {
    entries = await readdir(standalone, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name === ".env" || entry.name.startsWith(".env.")),
      )
      .map((entry) => unlink(resolve(standalone, entry.name))),
  );
}

child.once("exit", async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  try {
    await removeStandaloneEnvironmentCopies();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Unable to scrub standalone environment copies",
    );
    process.exitCode = 1;
  }
});
