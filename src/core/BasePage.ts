
import {
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  SelfHealingLocator,
  type HealingOptions,
  type LocatorStrategy,
} from "./SelfHealingLocator";

export abstract class BasePage {
  protected readonly healing: SelfHealingLocator;

  constructor(protected readonly page: Page) {
    this.healing = new SelfHealingLocator(page);
  }

  protected async resolveLocator(
    primarySelector: string,
    alternatives: LocatorStrategy[] = [],
    options: HealingOptions = {}
  ): Promise<Locator> {
    return this.healing.resolve(
      primarySelector,
      alternatives,
      options
    );
  }

  protected async navigate(path: string): Promise<void> {
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
