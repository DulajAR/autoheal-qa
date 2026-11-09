
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";

test.describe("Phase 4.1 - Validation Timeout", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      "http://autoheal.test/",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body></body></html>",
        });
      }
    );

    await page.goto("http://autoheal.test/");

    await page.setContent(`
      <html>
        <body>
          <button id="valid-action">Submit</button>
        </body>
      </html>
    `);
  });

  test("VT-001: accepts a valid candidate within budget", async ({
    page,
  }) => {
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
      "#old-action",
      {
        enabled: true,
        validationTimeoutMs: 3000,
      }
    );

    expect(result.status).toBe("SUGGESTED");
    expect(result.suggestedSelector).toBe(
      "#valid-action"
    );
  });

  test("VT-002: rejects invalid validation timeout configuration", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider()
    );

    for (const timeout of [
      0,
      -1,
      10001,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      await expect(
        orchestrator.suggest("#old-action", {
          enabled: true,
          validationTimeoutMs: timeout,
        })
      ).rejects.toThrow(
        "validationTimeoutMs must be an integer between 1 and 10000"
      );
    }
  });

  test("VT-003: expires when validation budget is exhausted", async ({
    page,
  }) => {
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
      "#old-action",
      {
        enabled: true,
        validationTimeoutMs: 1,
      }
    );

    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe(
      "VALIDATION_TIMEOUT"
    );
    expect(result.suggestedSelector).toBeUndefined();
  });

  test("VT-004: provider timeout remains independent", async ({
    page,
  }) => {
    const provider = {
      name: "mock",

      async suggestLocators(): Promise<
        { selector: string; confidence: number }[]
      > {
        return new Promise(() => {});
      },
    };

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      provider
    );

    const result = await orchestrator.suggest(
      "#old-action",
      {
        enabled: true,
        providerTimeoutMs: 20,
        validationTimeoutMs: 3000,
      }
    );

    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe(
      "RECOVERY_PIPELINE_FAILED"
    );
    expect(result.evaluatedCandidates).toBe(0);
  });
});
