
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
   * Enable parallel test execution.
   */
  fullyParallel: true,

  /**
   * Prevent test.only() from running in CI.
   */
  forbidOnly: !!process.env.CI,

  /**
   * Retry failed tests in CI.
   */
  retries: process.env.CI ? 2 : 0,

  /**
   * Number of parallel workers.
   */
  workers: environment.workers,

  /**
   * Maximum duration for each test.
   */
  timeout: environment.testTimeout,

  /**
   * Assertion timeout.
   */
  expect: {
    timeout: 10000,
  },

  /**
   * Test reporters.
   *
   * 1. List reporter: terminal output
   * 2. HTML reporter: interactive test report
   * 3. JUnit reporter: CI/CD integration
   * 4. AutoHeal reporter: custom JSON summary
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
   * Directory for screenshots,
   * videos, traces, and other artifacts.
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
     * Run browser in headless mode.
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
     * Capture trace on first retry.
     */
    trace: "on-first-retry",

    /**
     * Capture screenshot on failure.
     */
    screenshot: "only-on-failure",

    /**
     * Retain video when a test fails.
     */
    video: "retain-on-failure",
  },

  /**
   * Browser projects.
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
