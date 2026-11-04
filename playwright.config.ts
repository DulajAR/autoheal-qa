
import {
  defineConfig,
  devices,
} from "@playwright/test";

import { environment } from "./config/environment";

export default defineConfig({
  /**
   * Directory containing automated tests.
   */
  testDir: "./tests",

  /**
   * Exclude isolated reliability tests from
   * the main cross-browser suite.
   */
  testIgnore: ["**/reliability/**"],

  /**
   * Enable parallel test execution.
   */
  fullyParallel: true,

  /**
   * Prevent test.only() from running in CI.
   */
  forbidOnly: Boolean(process.env.CI),

  /**
   * Retry failed tests in CI.
   */
  retries: process.env.CI ? 2 : 0,

  /**
   * Number of parallel workers.
   */
  workers: environment.workers,

  /**
   * Maximum duration of each test.
   */
  timeout: environment.testTimeout,

  /**
   * Assertion timeout.
   */
  expect: {
    timeout: 10000,
  },

  /**
   * Test reporters:
   *
   * 1. List reporter
   * 2. HTML reporter
   * 3. JUnit reporter
   * 4. AutoHeal custom JSON reporter
   */
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

    [
      "./src/reporters/AutoHealReporter.ts",
    ],
  ],

  /**
   * Directory for Playwright test artifacts.
   */
  outputDir: "test-results",

  /**
   * Shared browser and test settings.
   */
  use: {
    /**
     * Target application URL.
     */
    baseURL: environment.baseUrl,

    /**
     * Browser execution mode.
     */
    headless: environment.headless,

    /**
     * Timeout for browser actions.
     */
    actionTimeout: environment.actionTimeout,

    /**
     * Timeout for page navigation.
     */
    navigationTimeout: 30000,

    /**
     * In CI, retain traces for failed attempts.
     *
     * Locally, capture traces on the first retry
     * to reduce execution overhead.
     */
    trace: process.env.CI
      ? "retain-on-failure"
      : "on-first-retry",

    /**
     * Capture screenshots for failed tests.
     */
    screenshot: "only-on-failure",

    /**
     * Retain video recordings for failed tests.
     */
    video: "retain-on-failure",
  },

  /**
   * Cross-browser test projects.
   */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },

    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],
});
