
import {
  defineConfig,
  devices,
} from "@playwright/test";

import { environment } from "./config/environment";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: true,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI
    ? 2
    : environment.workers,

  timeout: environment.testTimeout,

  expect: {
    timeout: 10000,
  },

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "reports/html",
        open: "never",
      },
    ],
    [
      "junit",
      {
        outputFile: "reports/junit/results.xml",
      },
    ],
  ],

  outputDir: "test-results",

  use: {
    baseURL: environment.baseUrl,

    headless: environment.headless,

    actionTimeout: environment.actionTimeout,

    navigationTimeout: 30000,

    trace: "on-first-retry",

    screenshot: "only-on-failure",

    video: "retain-on-failure",
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
