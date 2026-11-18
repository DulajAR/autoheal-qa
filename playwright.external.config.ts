import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/external",
  testMatch: "**/*.spec.ts",

  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "reports/external-html",
        open: "never",
      },
    ],
    [
      "./src/reporters/AutoHealReporter.ts",
    ],
  ],

  outputDir: "test-results/external",

  use: {
    baseURL: "https://www.saucedemo.com",
    headless: true,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});