#!/usr/bin/env node

import { run } from "../src/cli.mjs";
import { CliError } from "../src/errors.mjs";

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
