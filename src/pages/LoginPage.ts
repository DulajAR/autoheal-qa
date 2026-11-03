
import {
  expect,
  type Page,
  type Locator,
} from "@playwright/test";

import { BasePage } from "../core/BasePage";

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly notification: Locator;

  constructor(page: Page) {
    super(page);

    this.usernameInput =
      page.locator("#username");

    this.passwordInput =
      page.locator("#password");

    this.loginButton =
      page.getByRole("button", {
        name: "Login",
      });

    this.notification =
      page.locator("#flash");
  }

  async open(): Promise<void> {
    await this.navigate("/login");

    await expect(
      this.usernameInput
    ).toBeVisible();
  }

  async login(
    username: string,
    password: string
  ): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async verifyError(
    message: string
  ): Promise<void> {
    await expect(
      this.notification
    ).toContainText(message);
  }
}
