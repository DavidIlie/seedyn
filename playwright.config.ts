import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const production = process.env.E2E_PRODUCTION === "true";
const reuseDevelopmentServer =
  process.env.E2E_REUSE_EXISTING_SERVER === "true" || !process.env.CI;
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
    url: `http://127.0.0.1:${port}/api/healthz`,
    reuseExistingServer: production ? false : reuseDevelopmentServer,
    // A cold standalone build on the shared CI runner can take longer than the
    // development server startup. Keep the tighter feedback loop for dev E2E,
    // while giving the production build enough time to become healthy.
    timeout: production ? 300_000 : 120_000,
  },
});
