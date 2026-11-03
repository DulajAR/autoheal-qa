
import {
  test,
  expect,
} from "../src/fixtures/test.fixture";

import {
  SelfHealingLocator,
} from "../src/core/SelfHealingLocator";

test.describe("Self-Healing Locator Tests", () => {
  /**
   * TC-003
   * Verify that a valid primary locator works.
   */
  test("TC-003 @smoke Primary locator works", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="submit-btn">Submit</button>
    `);

    const healing = new SelfHealingLocator(page);

    const button = await healing.resolve(
      "#submit-btn",
      [
        {
          name: "data-testid fallback",
          selector: '[data-testid="submit"]',
          confidence: 0.95,
        },
      ],
      {
        enabled: false,
        timeoutMs: 300,
      }
    );

    await expect(button).toHaveText("Submit");
  });

  /**
   * TC-004
   * Verify that a broken primary locator
   * can recover using a trusted fallback.
   */
  test("TC-004 @regression Broken locator is healed", async ({
    page,
  }) => {
    await page.setContent(`
      <button data-testid="submit">Submit</button>
    `);

    const healing = new SelfHealingLocator(page);

    const button = await healing.resolve(
      "#old-submit-btn",
      [
        {
          name: "data-testid fallback",
          selector: '[data-testid="submit"]',
          confidence: 0.95,
        },
      ],
      {
        enabled: true,
        timeoutMs: 300,
      }
    );

    await expect(button).toHaveText("Submit");
  });

  /**
   * TC-005
   * Verify that low-confidence fallback
   * locators are rejected.
   */
  test("TC-005 @regression Low-confidence fallback rejected", async ({
    page,
  }) => {
    await page.setContent(`
      <button class="submit">Submit</button>
    `);

    const healing = new SelfHealingLocator(page);

    await expect(
      healing.resolve(
        "#missing-button",
        [
          {
            name: "weak class fallback",
            selector: ".submit",
            confidence: 0.5,
          },
        ],
        {
          enabled: true,
          timeoutMs: 300,
          minimumConfidence: 0.85,
        }
      )
    ).rejects.toThrow("Self-healing failed");
  });

  /**
   * TC-006
   * Verify that ambiguous fallback
   * locators are rejected.
   */
  test("TC-006 @regression Ambiguous fallback rejected", async ({
    page,
  }) => {
    await page.setContent(`
      <button class="submit">First</button>
      <button class="submit">Second</button>
    `);

    const healing = new SelfHealingLocator(page);

    await expect(
      healing.resolve(
        "#missing-button",
        [
          {
            name: "ambiguous fallback",
            selector: ".submit",
            confidence: 0.95,
          },
        ],
        {
          enabled: true,
          timeoutMs: 300,
        }
      )
    ).rejects.toThrow("Self-healing failed");
  });

  /**
   * TC-007
   * Verify that healing disabled prevents
   * fallback locator recovery.
   */
  test("TC-007 @regression Healing disabled rejects fallback", async ({
    page,
  }) => {
    await page.setContent(`
      <button data-testid="submit">Submit</button>
    `);

    const healing = new SelfHealingLocator(page);

    await expect(
      healing.resolve(
        "#missing-button",
        [
          {
            name: "data-testid fallback",
            selector: '[data-testid="submit"]',
            confidence: 0.95,
          },
        ],
        {
          enabled: false,
          timeoutMs: 300,
        }
      )
    ).rejects.toThrow(/self-healing disabled/);
  });

  /**
   * TC-008
   * Verify that healing enabled allows
   * trusted fallback locator recovery.
   */
  test("TC-008 @regression Healing enabled recovers locator", async ({
    page,
  }) => {
    await page.setContent(`
      <button data-testid="submit">Submit</button>
    `);

    const healing = new SelfHealingLocator(page);

    const button = await healing.resolve(
      "#missing-button",
      [
        {
          name: "data-testid fallback",
          selector: '[data-testid="submit"]',
          confidence: 0.95,
        },
      ],
      {
        enabled: true,
        timeoutMs: 300,
        minimumConfidence: 0.85,
      }
    );

    await expect(button).toBeVisible();
    await expect(button).toHaveText("Submit");
  });

  /**
   * TC-009
   * Verify that the primary locator takes
   * priority over fallback locators.
   */
  test("TC-009 @regression Primary locator has priority", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="primary-btn">Primary</button>
      <button data-testid="fallback-btn">Fallback</button>
    `);

    const healing = new SelfHealingLocator(page);

    const button = await healing.resolve(
      "#primary-btn",
      [
        {
          name: "fallback button",
          selector: '[data-testid="fallback-btn"]',
          confidence: 0.99,
        },
      ],
      {
        enabled: true,
        timeoutMs: 300,
      }
    );

    await expect(button).toHaveText("Primary");
  });
});
