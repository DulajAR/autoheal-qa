
import {
  test,
} from "../src/fixtures/test.fixture";

import { testUsers } from "../src/test-data/users";

test.describe("Login Tests", () => {
  test(
    "TC-001 @smoke Valid login",
    async ({ loginPage, securePage }) => {
      await loginPage.open();

      await loginPage.login(
        testUsers.valid.username,
        testUsers.valid.password
      );

      await securePage.verifySuccessfulLogin();
    }
  );

  test(
    "TC-002 @regression Invalid login",
    async ({ loginPage }) => {
      await loginPage.open();

      await loginPage.login(
        testUsers.invalid.username,
        testUsers.invalid.password
      );

      await loginPage.verifyError(
        "Your username is invalid!"
      );
    }
  );
});
