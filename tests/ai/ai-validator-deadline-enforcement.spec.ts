
import {
  test,
  expect,
  type Page,
} from "@playwright/test";

import { AILocatorValidator } from "../../src/ai/AILocatorValidator";

/**
 * Phase 4.6 - Validator Deadline Enforcement
 *
 * Tests verify that browser operations cannot cause
 * validation to wait indefinitely or accept late results.
 */

type BrowserOperation =
  | "count"
  | "visibility"
  | "evaluate";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createDelayedPage = (
  operation: BrowserOperation,
  delayMs: number
): Page => {
  const locator = {
    count: async (): Promise<number> => {
      if (operation === "count") {
        await delay(delayMs);
      }

      return 1;
    },

    isVisible: async (): Promise<boolean> => {
      if (operation === "visibility") {
        await delay(delayMs);
      }

      return true;
    },

    evaluate: async (): Promise<boolean> => {
      if (operation === "evaluate") {
        await delay(delayMs);
      }

      return false;
    },
  };

  return {
    locator: () => locator,
  } as unknown as Page;
};

test.describe(
  "Phase 4.6 - Validator Deadline Enforcement",
  () => {
    test(
      "VDE-001: slow count operation times out promptly",
      async () => {
        const page = createDelayedPage("count", 500);

        const validator = new AILocatorValidator(page);

        const startedAt = performance.now();

        const result = await validator.validate(
          {
            selector: "#submit",
            confidence: 0.95,
          },
          {
            timeoutMs: 50,
          }
        );

        const elapsed = performance.now() - startedAt;

        expect(result.valid).toBe(false);
        expect(result.reason).toBe("VALIDATION_TIMEOUT");

        // Allow scheduling overhead on slower CI machines.
        expect(elapsed).toBeLessThan(350);
      }
    );

    test(
      "VDE-002: slow visibility operation times out promptly",
      async () => {
        const page = createDelayedPage(
          "visibility",
          500
        );

        const validator = new AILocatorValidator(page);

        const startedAt = performance.now();

        const result = await validator.validate(
          {
            selector: "#submit",
            confidence: 0.95,
          },
          {
            timeoutMs: 50,
          }
        );

        const elapsed = performance.now() - startedAt;

        expect(result.valid).toBe(false);
        expect(result.reason).toBe("VALIDATION_TIMEOUT");

        expect(elapsed).toBeLessThan(350);
      }
    );

    test(
      "VDE-003: slow safety evaluation times out promptly",
      async () => {
        const page = createDelayedPage(
          "evaluate",
          500
        );

        const validator = new AILocatorValidator(page);

        const startedAt = performance.now();

        const result = await validator.validate(
          {
            selector: "#submit",
            confidence: 0.95,
          },
          {
            timeoutMs: 50,
          }
        );

        const elapsed = performance.now() - startedAt;

        expect(result.valid).toBe(false);
        expect(result.reason).toBe("VALIDATION_TIMEOUT");

        expect(elapsed).toBeLessThan(350);
      }
    );

    test(
      "VDE-004: valid candidate succeeds within budget",
      async () => {
        const page = createDelayedPage("count", 5);

        const validator = new AILocatorValidator(page);

        const result = await validator.validate(
          {
            selector: "#submit",
            confidence: 0.95,
          },
          {
            timeoutMs: 1000,
          }
        );

        expect(result.valid).toBe(true);
        expect(result.selector).toBe("#submit");
      }
    );

    test(
      "VDE-005: late operation cannot change timeout result",
      async () => {
        const page = createDelayedPage("count", 150);

        const validator = new AILocatorValidator(page);

        const result = await validator.validate(
          {
            selector: "#submit",
            confidence: 0.95,
          },
          {
            timeoutMs: 20,
          }
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe("VALIDATION_TIMEOUT");

        // Allow the underlying operation to finish.
        await delay(200);

        // The returned result must remain rejected.
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("VALIDATION_TIMEOUT");
      }
    );
  }
);
