import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const production = process.env.E2E_PRODUCTION === "true";
const port = production ? 3101 : 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://seedyn.localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "**/no-js.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-no-js",
      testMatch: "**/no-js.spec.ts",
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
    },
  ],
  webServer: {
    command: production ? "pnpm build && pnpm start:standalone" : "pnpm dev",
    url: `http://seedyn.localhost:${port}/api/healthz`,
    reuseExistingServer: production ? false : !process.env.CI,
    timeout: 120_000,
  },
});
