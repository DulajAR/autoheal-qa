
import {
  expect,
  type Page,
  type Locator,
  type Response,
} from "@playwright/test";

import { BasePage } from "../core/BasePage";
import { Logger } from "../core/Logger";

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly notification: Locator;

  constructor(page: Page) {
    super(page);

    this.usernameInput = page.locator("#username");

    this.passwordInput = page.locator("#password");

    this.loginButton = page.getByRole("button", {
      name: "Login",
    });

    this.notification = page.locator("#flash");
  }

  /**
   * Navigate to the login page.
   */
  async open(): Promise<void> {
    Logger.info("Navigating to login page");

    await this.navigate("/login");

    await expect(
      this.usernameInput
    ).toBeVisible();

    Logger.info("Login page loaded successfully");
  }

  /**
   * Fill credentials and submit the login form.
   *
   * Includes temporary diagnostics to investigate
   * intermittent Firefox login failures.
   *
   * Passwords and response bodies are never logged.
   */
  async login(
    username: string,
    password: string
  ): Promise<void> {
    Logger.info("Login attempt started");

    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    // Start listening before submitting the form.
    const loginResponsePromise: Promise<Response | null> =
      this.page.waitForResponse(
        (response) =>
          response.url().includes("/authenticate") &&
          response.request().method() === "POST",
        {
          timeout: 15000,
        }
      ).catch(() => null);

    await this.loginButton.click();

    const response = await loginResponsePromise;

    if (response) {
      Logger.info(
        `Login response status: ${response.status()}`
      );

      Logger.info(
        `Login response URL: ${response.url()}`
      );
    } else {
      Logger.warn(
        "No matching login response captured"
      );
    }

    Logger.info(
      `Current page URL: ${this.page.url()}`
    );

    Logger.info("Login form submitted");
  }

  /**
   * Verify that the expected login error appears.
   */
  async verifyError(
    message: string
  ): Promise<void> {
    Logger.info("Verifying login error message");

    await expect(
      this.notification
    ).toContainText(message);

    Logger.info("Login error message verified");
  }
}
