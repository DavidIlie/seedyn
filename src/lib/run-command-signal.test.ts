import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("environment command wrapper", () => {
  it("never reports a signal-killed child as success", async () => {
    const wrapper = spawn(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/run-command-with-next-env.mjs"),
        process.execPath,
        "-e",
        "setInterval(() => {}, 1000)",
      ],
      {
        env: { ...process.env, NODE_ENV: "test" },
        stdio: "ignore",
      },
    );

    const outcome = new Promise<{ code: number | null; signal: string | null }>(
      (resolveOutcome, reject) => {
        wrapper.once("error", reject);
        wrapper.once("close", (code, signal) =>
          resolveOutcome({ code, signal }),
        );
      },
    );

    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 150));
    wrapper.kill("SIGTERM");

    const result = await outcome;
    expect(result.code !== 0 || result.signal !== null).toBe(true);
  });
});
