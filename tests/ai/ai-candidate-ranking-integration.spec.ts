
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";

import type {
  AILocatorCandidate,
} from "../../src/ai/AIProvider";

test.describe("Phase 4.1 - AI Candidate Ranking Integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      "http://autoheal.test/",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8" />
                <title>Ranking Integration Tests</title>
              </head>
              <body></body>
            </html>
          `,
        });
      }
    );

    await page.goto("http://autoheal.test/");

    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Ranking Test DOM</title>
        </head>
        <body>
          <main>
            <button id="primary-action">
              Primary
            </button>

            <button id="secondary-action">
              Secondary
            </button>

            <button class="duplicate">
              Duplicate One
            </button>

            <button class="duplicate">
              Duplicate Two
            </button>

            <button
              id="invisible-action"
              style="display: none"
            >
              Invisible
            </button>

            <input
              id="secret-input"
              type="password"
            />
          </main>
        </body>
      </html>
    `);

    expect(page.url()).toBe("http://autoheal.test/");
  });

  const evaluate = async (
    page: ConstructorParameters<
      typeof AIRecoveryOrchestrator
    >[0],
    candidates: AILocatorCandidate[],
    maxCandidates = 5
  ) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider(candidates)
    );

    return orchestrator.suggest("#old-action", {
      enabled: true,
      minimumConfidence: 0.85,
      maxCandidates,
    });
  };

  test("RINT-001: selects highest-confidence valid candidate", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#secondary-action",
        confidence: 0.9,
      },
      {
        selector: "#primary-action",
        confidence: 0.97,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#primary-action"
    );
    expect(result.confidence).toBe(0.97);
    expect(result.evaluatedCandidates).toBe(2);
  });

  test("RINT-002: rejects ambiguous candidate despite higher confidence", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: ".duplicate",
        confidence: 0.99,
      },
      {
        selector: "#primary-action",
        confidence: 0.92,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#primary-action"
    );
    expect(result.evaluatedCandidates).toBe(2);
  });

  test("RINT-003: rejects invisible candidate", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#invisible-action",
        confidence: 0.99,
      },
      {
        selector: "#secondary-action",
        confidence: 0.9,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#secondary-action"
    );
    expect(result.evaluatedCandidates).toBe(2);
  });

  test("RINT-004: rejects unsafe password target", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#secret-input",
        confidence: 0.99,
      },
      {
        selector: "#primary-action",
        confidence: 0.9,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#primary-action"
    );
    expect(result.evaluatedCandidates).toBe(2);
  });

  test("RINT-005: handles duplicate selectors deterministically", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#primary-action",
        confidence: 0.95,
      },
      {
        selector: " #primary-action ",
        confidence: 0.94,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#primary-action"
    );
    expect(result.confidence).toBe(0.95);
    expect(result.evaluatedCandidates).toBe(2);
  });

  test("RINT-006: respects maximum candidate limit", async ({
    page,
  }) => {
    const result = await evaluate(
      page,
      [
        {
          selector: "#missing-one",
          confidence: 0.99,
        },
        {
          selector: "#missing-two",
          confidence: 0.98,
        },
        {
          selector: "#primary-action",
          confidence: 0.97,
        },
      ],
      2
    );

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.evaluatedCandidates).toBe(2);
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("RINT-007: rejects all invalid candidates", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#missing-action",
        confidence: 0.99,
      },
      {
        selector: ".duplicate",
        confidence: 0.98,
      },
      {
        selector: "#invisible-action",
        confidence: 0.97,
      },
    ]);

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.reason).toBe(
      "NO_VALID_CANDIDATE"
    );
    expect(result.evaluatedCandidates).toBe(3);
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("RINT-008: rejects candidates below confidence threshold", async ({
    page,
  }) => {
    const result = await evaluate(page, [
      {
        selector: "#primary-action",
        confidence: 0.84,
      },
      {
        selector: "#secondary-action",
        confidence: 0.7,
      },
    ]);

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.evaluatedCandidates).toBe(2);
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("RINT-009: suggestion does not click the target", async ({
    page,
  }) => {
    await page.evaluate(() => {
      (
        window as Window & {
          autohealClickCount?: number;
        }
      ).autohealClickCount = 0;

      document
        .querySelector("#primary-action")
        ?.addEventListener("click", () => {
          (
            window as Window & {
              autohealClickCount?: number;
            }
          ).autohealClickCount!++;
        });
    });

    const result = await evaluate(page, [
      {
        selector: "#primary-action",
        confidence: 0.99,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");

    const clickCount = await page.evaluate(() => {
      return (
        window as Window & {
          autohealClickCount?: number;
        }
      ).autohealClickCount;
    });

    expect(clickCount).toBe(0);
  });

  test("RINT-010: rejects malformed candidate without failing pipeline", async ({
    page,
  }) => {
    const malformed = {
      selector: null,
      confidence: 0.99,
    } as unknown as AILocatorCandidate;

    const result = await evaluate(page, [
      malformed,
      {
        selector: "#secondary-action",
        confidence: 0.91,
      },
    ]);

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#secondary-action"
    );
    expect(result.evaluatedCandidates).toBe(2);
  });
});
