
import { test, expect } from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";

test.describe("Phase 4.2 - AI Recovery Explainability", () => {
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
          <button id="hidden-action" hidden>Hidden</button>
          <input id="password-action" type="password" />
        </body>
      </html>
    `);
  });

  test("EXP-001: records accepted candidate", async ({ page }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("SUGGESTED");
    expect(result.explanation).toBeDefined();
    expect(result.explanation?.evaluatedCandidates).toBe(1);
    expect(result.explanation?.acceptedCandidates).toBe(1);
    expect(result.explanation?.rejectedCandidates).toBe(0);

    expect(result.explanation?.decisions).toEqual([
      expect.objectContaining({
        candidateIndex: 0,
        decision: "ACCEPTED",
        reasons: [],
      }),
    ]);
  });

  test("EXP-002: records low-confidence rejection", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.4 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.explanation?.rejectedCandidates).toBe(1);
    expect(result.explanation?.decisions[0].reasons).toEqual([
      "LOW_CONFIDENCE",
    ]);
  });

  test("EXP-003: records ambiguous selector rejection", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "button", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.explanation?.decisions[0].reasons).toEqual([
      "AMBIGUOUS_MATCH",
    ]);
  });

  test("EXP-004: records hidden target rejection", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#hidden-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.explanation?.decisions[0].reasons).toEqual([
      "NOT_VISIBLE",
    ]);
  });

  test("EXP-005: records unsafe target rejection", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#password-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("NO_CANDIDATE");
    expect(result.explanation?.decisions[0].reasons).toEqual([
      "UNSAFE_TARGET",
    ]);
  });

  test("EXP-006: explanation excludes raw selectors", async ({
    page,
  }) => {
    const secretSelector = "#valid-action";

    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: secretSelector, confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    const explanation = JSON.stringify(result.explanation);

    expect(explanation).not.toContain(secretSelector);
    expect(explanation).not.toContain("#missing-action");
    expect(explanation).not.toContain("Submit");
  });

  test("EXP-007: counts match recorded decisions", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.99 },
        { selector: "#missing-element", confidence: 0.95 },
        { selector: "#hidden-action", confidence: 0.9 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    const explanation = result.explanation;

    expect(explanation).toBeDefined();
    expect(explanation?.evaluatedCandidates).toBe(3);
    expect(explanation?.acceptedCandidates).toBe(1);
    expect(explanation?.rejectedCandidates).toBe(2);
    expect(explanation?.decisions).toHaveLength(3);

    expect(
      explanation?.decisions.every(
        (decision) =>
          decision.validationDurationMs !== undefined &&
          decision.validationDurationMs >= 0
      )
    ).toBe(true);
  });

  test("EXP-008: disabled AI produces empty explanation", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action"
    );

    expect(result.status).toBe("DISABLED");
    expect(result.explanation?.evaluatedCandidates).toBe(0);
    expect(result.explanation?.decisions).toEqual([]);
  });

  test("EXP-009: duplicate candidate is rejected during ranking", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.99 },
        { selector: "#valid-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("SUGGESTED");
    expect(result.explanation?.evaluatedCandidates).toBe(2);
    expect(result.explanation?.acceptedCandidates).toBe(1);
    expect(result.explanation?.rejectedCandidates).toBe(1);

    expect(result.explanation?.decisions).toEqual([
      expect.objectContaining({
        candidateIndex: 0,
        decision: "ACCEPTED",
        reasons: [],
      }),
      expect.objectContaining({
        candidateIndex: 1,
        decision: "REJECTED",
        reasons: ["DUPLICATE_SELECTOR"],
      }),
    ]);
  });

  test("EXP-010: ranking preserves candidate identity", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.99 },
        { selector: "#valid-action", confidence: 0.97 },
        { selector: "#second-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      { enabled: true }
    );

    expect(result.status).toBe("SUGGESTED");
    expect(result.explanation?.evaluatedCandidates).toBe(3);
    expect(result.explanation?.acceptedCandidates).toBe(2);
    expect(result.explanation?.rejectedCandidates).toBe(1);
    expect(result.explanation?.decisions).toHaveLength(3);

    expect(result.explanation?.decisions[0]).toEqual(
      expect.objectContaining({
        candidateIndex: 0,
        decision: "ACCEPTED",
        reasons: [],
      })
    );

    expect(result.explanation?.decisions[1]).toEqual(
      expect.objectContaining({
        candidateIndex: 1,
        decision: "REJECTED",
        reasons: ["DUPLICATE_SELECTOR"],
      })
    );

    expect(result.explanation?.decisions[2]).toEqual(
      expect.objectContaining({
        candidateIndex: 2,
        decision: "ACCEPTED",
        reasons: [],
      })
    );
  });

  test("EXP-011: validation timeout records skipped candidates", async ({
    page,
  }) => {
    const orchestrator = new AIRecoveryOrchestrator(
      page,
      new MockAIProvider([
        { selector: "#valid-action", confidence: 0.99 },
        { selector: "#second-action", confidence: 0.95 },
      ])
    );

    const result = await orchestrator.suggest(
      "#missing-action",
      {
        enabled: true,
        validationTimeoutMs: 1,
      }
    );

    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("VALIDATION_TIMEOUT");

    const explanation = result.explanation;

    expect(explanation).toBeDefined();
    expect(explanation?.decisions).toHaveLength(2);

    expect(
      explanation?.decisions.some(
        (decision) =>
          decision.reasons.includes("VALIDATION_TIMEOUT")
      )
    ).toBe(true);

    expect(
      explanation?.decisions.every(
        (decision) =>
          decision.decision === "REJECTED" ||
          decision.decision === "NOT_EVALUATED"
      )
    ).toBe(true);

    expect(explanation?.evaluatedCandidates).toBe(
      explanation?.decisions.filter(
        (decision) =>
          decision.decision !== "NOT_EVALUATED"
      ).length
    );
  });
});
