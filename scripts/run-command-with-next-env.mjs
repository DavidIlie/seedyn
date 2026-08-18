import { spawn } from "node:child_process";

import nextEnv from "@next/env";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("A command is required");
if (!process.env.NODE_ENV) {
  throw new Error("NODE_ENV must be explicit before loading an environment");
}

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
});

const forwardedSignals = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
  const forward = () => child.kill(signal);
  forwardedSignals.set(signal, forward);
  process.on(signal, forward);
}

child.once("error", (error) => {
  throw error;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    for (const [forwardedSignal, forward] of forwardedSignals) {
      process.removeListener(forwardedSignal, forward);
    }
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
