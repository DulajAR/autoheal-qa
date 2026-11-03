
import {
  expect,
  type Page,
  type Locator,
} from "@playwright/test";

import { BasePage } from "../core/BasePage";

export class SecurePage extends BasePage {
  readonly heading: Locator;
  readonly notification: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole("heading", {
      name: "Secure Area",
      exact: true,
    });

    this.notification = page.locator("#flash");

    this.logoutButton = page.getByRole("link", {
      name: "Logout",
      exact: true,
    });
  }

  async verifySuccessfulLogin(): Promise<void> {
    await this.verifyUrl(/\/secure\/?$/);

    await expect(
      this.heading
    ).toBeVisible();

    await expect(
      this.notification
    ).toContainText(
      "You logged into a secure area!"
    );

    await expect(
      this.logoutButton
    ).toBeVisible();
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();

    await this.verifyUrl(/\/login\/?$/);
  }
}
