
import {
  expect,
  type Page,
} from "@playwright/test";

export abstract class BasePage {
  constructor(
    protected readonly page: Page
  ) {}

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
    await expect(
      this.page
    ).toHaveURL(pattern);
  }
}
