
import {
  test as base,
  expect,
} from "@playwright/test";

import { LoginPage } from "../pages/LoginPage";
import { SecurePage } from "../pages/SecurePage";

type PageFixtures = {
  loginPage: LoginPage;
  securePage: SecurePage;
};

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  securePage: async ({ page }, use) => {
    await use(new SecurePage(page));
  },
});

export { expect };
