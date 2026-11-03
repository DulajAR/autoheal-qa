
import {
  expect,
  type Page,
} from "@playwright/test";

import {
  SelfHealingLocator,
} from "./SelfHealingLocator";

export abstract class BasePage {
  protected readonly healing: SelfHealingLocator;

  constructor(
    protected readonly page: Page
  ) {
    this.healing = new SelfHealingLocator(page);
  }

  protected async navigate(
    path: string
  ): Promise<void> {
    await this.page.goto(path, {
      waitUntil: "domcontentloaded",
    });
  }

  protected async verifyUrl(
    pattern: RegExp
  ): Promise<void> {
    await expect(this.page).toHaveURL(pattern);
  }
}
