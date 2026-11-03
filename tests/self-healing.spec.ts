
import { test, expect } from "../src/fixtures/test.fixture";
import { SelfHealingLocator } from "../src/core/SelfHealingLocator";

test.describe("Self-Healing Locator Tests", () => {
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
      ]
    );

    await expect(button).toHaveText("Submit");
  });

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
        timeoutMs: 300,
      }
    );

    await expect(button).toHaveText("Submit");
  });

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
          timeoutMs: 300,
          minimumConfidence: 0.85,
        }
      )
    ).rejects.toThrow(
      "Self-healing failed"
    );
  });

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
          timeoutMs: 300,
        }
      )
    ).rejects.toThrow(
      "Self-healing failed"
    );
  });
});
