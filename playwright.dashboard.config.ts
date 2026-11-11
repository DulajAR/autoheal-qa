
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/dashboard",
  testMatch: "**/*.spec.ts",

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),

  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30000,

  expect: {
    timeout: 10000,
  },

  reporter: [["list"]],

  outputDir: "test-results/dashboard",

  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
