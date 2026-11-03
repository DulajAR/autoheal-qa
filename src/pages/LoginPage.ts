
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

  async open(): Promise<void> {
    Logger.info("Navigating to login page");

    await this.navigate("/login");

    const username = await this.resolveLocator(
      "#username",
      [
        {
          name: "username name attribute",
          selector: 'input[name="username"]',
          confidence: 0.95,
        },
      ]
    );

    await expect(username).toBeVisible();

    Logger.info("Login page loaded successfully");
  }

  async login(
    username: string,
    password: string
  ): Promise<void> {
    Logger.info("Login attempt started");

    const usernameField = await this.resolveLocator(
      "#username",
      [
        {
          name: "username name attribute",
          selector: 'input[name="username"]',
          confidence: 0.95,
        },
      ]
    );

    const passwordField = await this.resolveLocator(
      "#password",
      [
        {
          name: "password name attribute",
          selector: 'input[name="password"]',
          confidence: 0.95,
        },
      ]
    );

    const submitButton = await this.resolveLocator(
      'button[type="submit"]',
      [
        {
          name: "login button class",
          selector: "button.radius",
          confidence: 0.9,
        },
      ]
    );

    await usernameField.fill(username);
    await passwordField.fill(password);

    const loginResponsePromise: Promise<Response | null> =
      this.page
        .waitForResponse(
          (response) =>
            response.url().includes("/authenticate") &&
            response.request().method() === "POST",
          { timeout: 15000 }
        )
        .catch(() => null);

    await submitButton.click();

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

  async verifyError(message: string): Promise<void> {
    Logger.info("Verifying login error message");

    // Functional assertions must not be bypassed
    // by the locator healing engine.
    await expect(this.notification).toContainText(message);

    Logger.info("Login error message verified");
  }
}
