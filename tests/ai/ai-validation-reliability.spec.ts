
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { AILocatorValidator } from "../../src/ai/AILocatorValidator";

test.describe("Phase 4.1.1 - AI Validation Reliability", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://autoheal.test/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body></body></html>",
      });
    });

    await page.goto("http://autoheal.test/");

    await page.setContent(`
      <html>
        <body>
          <button id="valid-action">Submit</button>
          <button id="second-action">Continue</button>
        </body>
      </html>
    `);
  });

  test("REL-001: stalled validation fails closed", async ({
    page,
  }) => {
    const originalValidate =
      AILocatorValidator.prototype.validate;

    let validationCalls = 0;

    AILocatorValidator.prototype.validate =
      async function () {
        validationCalls++;

        return new Promise(() => {});
      };

    try {
      const orchestrator = new AIRecoveryOrchestrator(
        page,
        new MockAIProvider([
          {
            selector: "#valid-action",
            confidence: 0.95,
          },
        ])
      );

      const result = await orchestrator.suggest(
        "#missing-action",
        {
          enabled: true,
          validationTimeoutMs: 100,
        }
      );

      expect(result.status).toBe("FAILED");
      expect(result.reason).toBe("VALIDATION_TIMEOUT");
      expect(result.evaluatedCandidates).toBe(1);
      expect(result.suggestedSelector).toBeUndefined();
      expect(validationCalls).toBe(1);
    } finally {
      AILocatorValidator.prototype.validate =
        originalValidate;
    }
  });

  test("REL-002: timeout prevents further candidate validation", async ({
    page,
  }) => {
    const originalValidate =
      AILocatorValidator.prototype.validate;

    const evaluatedSelectors: string[] = [];

    AILocatorValidator.prototype.validate =
      async function (candidate) {
        evaluatedSelectors.push(candidate.selector);

        return new Promise(() => {});
      };

    try {
      const orchestrator = new AIRecoveryOrchestrator(
        page,
        new MockAIProvider([
          {
            selector: "#valid-action",
            confidence: 0.99,
          },
          {
            selector: "#second-action",
            confidence: 0.95,
          },
        ])
      );

      const result = await orchestrator.suggest(
        "#missing-action",
        {
          enabled: true,
          validationTimeoutMs: 100,
        }
      );

      expect(result.status).toBe("FAILED");
      expect(result.reason).toBe("VALIDATION_TIMEOUT");
      expect(result.evaluatedCandidates).toBe(1);
      expect(evaluatedSelectors).toEqual([
        "#valid-action",
      ]);
    } finally {
      AILocatorValidator.prototype.validate =
        originalValidate;
    }
  });

  test("REL-003: late validation result cannot change timeout outcome", async ({
    page,
  }) => {
    const originalValidate =
      AILocatorValidator.prototype.validate;

    let resolveValidation:
      | ((value: Awaited<ReturnType<
          AILocatorValidator["validate"]
        >>) => void)
      | undefined;

    AILocatorValidator.prototype.validate =
      async function () {
        return new Promise((resolve) => {
          resolveValidation = resolve;
        });
      };

    try {
      const orchestrator = new AIRecoveryOrchestrator(
        page,
        new MockAIProvider([
          {
            selector: "#valid-action",
            confidence: 0.99,
          },
        ])
      );

      const result = await orchestrator.suggest(
        "#missing-action",
        {
          enabled: true,
          validationTimeoutMs: 100,
        }
      );

      expect(result.status).toBe("FAILED");
      expect(result.reason).toBe("VALIDATION_TIMEOUT");
      expect(result.suggestedSelector).toBeUndefined();

      expect(resolveValidation).toBeDefined();

      resolveValidation?.({
        valid: true,
        selector: "#valid-action",
        confidence: 0.99,
      });

      await Promise.resolve();

      expect(result.status).toBe("FAILED");
      expect(result.suggestedSelector).toBeUndefined();
    } finally {
      AILocatorValidator.prototype.validate =
        originalValidate;
    }
  });
});
