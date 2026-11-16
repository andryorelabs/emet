import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs the E2E specs in `e2e/` against a running Website, by default
 * the nginx image on port 8080 (`docker run -p 127.0.0.1:8080:80`), or the URL
 * in `SITE_URL`. Retries in CI turn a flaky test into a "flaky" entry of the
 * JSON report, which site-quality.yml summarizes.
 */
const isCi = process.env.CI !== undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e/.output/results.json" }],
    ["html", { outputFolder: "e2e/.output/report", open: "never" }],
  ],
  outputDir: "e2e/.output/test-results",
  use: {
    baseURL: process.env.SITE_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
