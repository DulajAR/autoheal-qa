
import { test, expect } from "@playwright/test";

import type {
  AIProvider,
  AILocatorRequest,
  AILocatorCandidate,
} from "../../src/ai/AIProvider";

import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";

test.describe("AI Recovery Orchestration", () => {
  /**
   * Prepare an isolated HTTP page for every test.
   *
   * The DOM sanitizer requires an HTTP/HTTPS origin.
   * Using page.setContent() on about:blank would
   * cause the secure request builder to reject
   * the extracted DOM context.
   */
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
                <title>AutoHeal QA Test Page</title>
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
          <title>AutoHeal QA Mock DOM</title>
        </head>

        <body>
          <main>
            <button
              id="new-submit"
              data-testid="submit-button"
            >
              Submit
            </button>

            <button class="duplicate">
              One
            </button>

            <button class="duplicate">
              Two
            </button>

            <input
              id="password"
              type="password"
            />
          </main>
        </body>
      </html>
    `);

    // Confirm the page has a valid HTTP origin.
    expect(page.url()).toBe("http://autoheal.test/");
  });

  /**
   * ORC-001
   * A valid, high-confidence mock AI suggestion
   * should be accepted.
   */
  test("ORC-001: accepts a valid mock suggestion", async ({
    page,
  }) => {
    const provider = new MockAIProvider([
      {
        selector: "#new-submit",
        confidence: 0.95,
      },
    ]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("SUGGESTED");

    expect(result.suggestedSelector).toBe(
      "#new-submit"
    );

    expect(result.confidence).toBe(0.95);

    expect(result.evaluatedCandidates).toBe(1);
  });

  /**
   * ORC-002
   * AI recovery must remain disabled by default.
   */
  test("ORC-002: disabled by default", async ({
    page,
  }) => {
    const provider = new MockAIProvider([
      {
        selector: "#new-submit",
        confidence: 0.95,
      },
    ]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit"
    );

    expect(result.status).toBe("DISABLED");

    expect(result.evaluatedCandidates).toBe(0);
  });

  /**
   * ORC-003
   * Missing provider should disable AI recovery.
   */
  test("ORC-003: null provider is disabled", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      null
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("DISABLED");

    expect(result.provider).toBe("disabled");
  });

  /**
   * ORC-004
   * Low-confidence suggestions must be rejected.
   */
  test("ORC-004: rejects low confidence", async ({
    page,
  }) => {
    const provider = new MockAIProvider([
      {
        selector: "#new-submit",
        confidence: 0.4,
      },
    ]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
        minimumConfidence: 0.85,
      }
    );

    expect(result.status).toBe("NO_CANDIDATE");

    expect(result.suggestedSelector).toBeUndefined();
  });

  /**
   * ORC-005
   * A selector matching multiple elements
   * must not be accepted.
   */
  test("ORC-005: rejects ambiguous selectors", async ({
    page,
  }) => {
    const provider = new MockAIProvider([
      {
        selector: ".duplicate",
        confidence: 0.99,
      },
    ]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("NO_CANDIDATE");

    expect(result.suggestedSelector).toBeUndefined();
  });

  /**
   * ORC-006
   * If the highest-confidence candidate is invalid,
   * the next valid candidate should be considered.
   */
  test("ORC-006: tries another candidate", async ({
    page,
  }) => {
    const provider = new MockAIProvider([
      {
        selector: "#missing",
        confidence: 0.99,
      },
      {
        selector: "#new-submit",
        confidence: 0.95,
      },
    ]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("SUGGESTED");

    expect(result.suggestedSelector).toBe(
      "#new-submit"
    );

    expect(result.evaluatedCandidates).toBe(2);
  });

  /**
   * ORC-007
   * An empty provider response should return
   * NO_CANDIDATE without throwing.
   */
  test("ORC-007: empty response returns no candidate", async ({
    page,
  }) => {
    const provider = new MockAIProvider([]);

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("NO_CANDIDATE");

    expect(result.evaluatedCandidates).toBe(0);
  });

  /**
   * ORC-008
   * Provider exceptions must fail safely.
   */
  test("ORC-008: provider errors fail safely", async ({
    page,
  }) => {
    const provider: AIProvider = {
      name: "mock",

      async suggestLocators() {
        throw new Error(
          "Sensitive internal error"
        );
      },
    };

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("FAILED");

    expect(JSON.stringify(result)).not.toContain(
      "Sensitive internal error"
    );
  });

  /**
   * ORC-009
   * Provider timeouts should return FAILED
   * instead of hanging indefinitely.
   */
  test("ORC-009: timeout fails safely", async ({
    page,
  }) => {
    const provider: AIProvider = {
      name: "mock",

      async suggestLocators() {
        return new Promise<AILocatorCandidate[]>(
          () => {
            // Intentionally unresolved promise.
          }
        );
      },
    };

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
        providerTimeoutMs: 20,
      }
    );

    expect(result.status).toBe("FAILED");

    expect(result.reason).toBe(
      "RECOVERY_PIPELINE_FAILED"
    );
  });

  /**
   * ORC-010
   * Only sanitized DOM context should reach
   * the mock provider.
   */
  test("ORC-010: request contains sanitized context", async ({
    page,
  }) => {
    let capturedRequest:
      | AILocatorRequest
      | undefined;

    const provider: AIProvider = {
      name: "mock",

      async suggestLocators(request) {
        capturedRequest = request;

        return [];
      },
    };

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("NO_CANDIDATE");

    expect(capturedRequest).toBeDefined();

    expect(
      capturedRequest?.primarySelector
    ).toBe("#old-submit");

    expect(
      capturedRequest?.domSnapshot
    ).not.toContain("Submit");

    expect(
      capturedRequest?.domSnapshot
    ).not.toContain("password");

    expect(
      capturedRequest?.domSnapshot
    ).toContain("new-submit");
  });

  /**
   * ORC-011
   * Non-mock providers are disabled in Phase 3.5.
   */
  test("ORC-011: rejects non-mock providers", async ({
    page,
  }) => {
    const provider: AIProvider = {
      name: "external",

      async suggestLocators() {
        throw new Error(
          "External provider must not be called"
        );
      },
    };

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-submit",
      {
        enabled: true,
      }
    );

    expect(result.status).toBe("DISABLED");

    expect(result.reason).toBe(
      "PROVIDER_NOT_ALLOWED"
    );
  });

  /**
   * ORC-012
   * Invalid configuration values must be rejected.
   */
  test("ORC-012: validates configuration", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider()
    );

    await expect(
      orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
          minimumConfidence: 1.5,
        }
      )
    ).rejects.toThrow(
      "minimumConfidence must be between 0 and 1"
    );

    await expect(
      orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
          maxCandidates: 0,
        }
      )
    ).rejects.toThrow(
      "maxCandidates must be an integer between 1 and 10"
    );

    await expect(
      orchestrator.suggest(
        "#old-submit",
        {
          enabled: true,
          providerTimeoutMs: -1,
        }
      )
    ).rejects.toThrow(
      "providerTimeoutMs must be an integer between 1 and 10000"
    );
  });
});
