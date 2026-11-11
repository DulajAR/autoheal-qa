
import { test, expect } from "@playwright/test";

import { AILocatorValidator } from "../../src/ai/AILocatorValidator";

test.describe("AI Locator Candidate Validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
      <button id="submit">Submit</button>
      <button class="duplicate">One</button>
      <button class="duplicate">Two</button>
      <button id="hidden" style="display:none">Hidden</button>
      <input id="password" type="password" />
    `);
  });

  test("AIV-001: accepts a valid unique selector", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#submit",
      confidence: 0.95,
    });

    expect(result.valid).toBe(true);
    expect(result.selector).toBe("#submit");
  });

  test("AIV-002: rejects low confidence", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#submit",
      confidence: 0.5,
    });

    expect(result.reason).toBe("LOW_CONFIDENCE");
  });

  test("AIV-003: rejects missing elements", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#missing",
      confidence: 0.95,
    });

    expect(result.reason).toBe("NO_MATCH");
  });

  test("AIV-004: rejects ambiguous selectors", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: ".duplicate",
      confidence: 0.95,
    });

    expect(result.reason).toBe("AMBIGUOUS_MATCH");
  });

  test("AIV-005: rejects hidden elements", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#hidden",
      confidence: 0.95,
    });

    expect(result.reason).toBe("NOT_VISIBLE");
  });

  test("AIV-006: rejects sensitive inputs", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#password",
      confidence: 0.95,
    });

    expect(result.reason).toBe("UNSAFE_TARGET");
  });

  test("AIV-007: rejects invalid confidence", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#submit",
      confidence: 1.5,
    });

    expect(result.reason).toBe("INVALID_CONFIDENCE");
  });

  test("AIV-008: rejects non-CSS selector engines", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "xpath=//button",
      confidence: 0.95,
    });

    expect(result.reason).toBe("INVALID_SELECTOR");
  });

  test("AIV-009: accepts minimum confidence boundary", async ({
    page,
  }) => {
    const result = await new AILocatorValidator(page).validate({
      selector: "#submit",
      confidence: 0.85,
    });

    expect(result.valid).toBe(true);
  });

  test("AIV-010: rejects invalid options", async ({
    page,
  }) => {
    const validator = new AILocatorValidator(page);

    await expect(
      validator.validate(
        {
          selector: "#submit",
          confidence: 0.95,
        },
        {
          minConfidence: 1.5,
        }
      )
    ).rejects.toThrow();

    await expect(
      validator.validate(
        {
          selector: "#submit",
          confidence: 0.95,
        },
        {
          timeoutMs: 0,
        }
      )
    ).rejects.toThrow();
  });

  /**
   * Phase 4.6 - Validation Deadline Classification
   *
   * Simulates a delayed locator count operation.
   *
   * Expected behavior:
   * - Validation fails closed.
   * - No candidate is accepted.
   * - The rejection reason is VALIDATION_TIMEOUT.
   */
  test("AIV-011: expired validation deadline is classified", async ({
    page,
  }) => {
    const validator = new AILocatorValidator(page);

    const originalLocator = page.locator.bind(page);

    const delayedLocator = {
      count: async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        return 1;
      },
    };

    page.locator = (() =>
      delayedLocator) as unknown as typeof page.locator;

    try {
      const result = await validator.validate(
        {
          selector: "#submit",
          confidence: 0.95,
        },
        {
          timeoutMs: 5,
        }
      );

      expect(result.valid).toBe(false);

      expect(result.reason).toBe(
        "VALIDATION_TIMEOUT"
      );

      expect(result.selector).toBe("#submit");
    } finally {
      // Restore Playwright's original locator method.
      page.locator = originalLocator;
    }
  });
});
