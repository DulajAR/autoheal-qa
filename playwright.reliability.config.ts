
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/reliability",

  testMatch: "**/*.spec.ts",

  fullyParallel: false,

  forbidOnly: Boolean(process.env.CI),

  retries: 0,

  workers: 1,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "reports/reliability-tests",
        open: "never",
      },
    ],
  ],

  outputDir: "test-results/reliability",

  use: {
    baseURL: "http://localhost",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "reliability-chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
  ],

  timeout: 15000,

  expect: {
    timeout: 3000,
  },
});
