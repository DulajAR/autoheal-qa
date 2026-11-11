
import {
  test,
  expect,
} from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { AILocatorValidator } from "../../src/ai/AILocatorValidator";
import { MockAIProvider } from "../../src/ai/MockAIProvider";

type ValidationResult = Awaited<
  ReturnType<AILocatorValidator["validate"]>
>;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

test.describe(
  "Phase 4.6 - Orchestrator Timeout Consistency",
  () => {
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
            <button id="first-action">First</button>
            <button id="second-action">Second</button>
            <button id="third-action">Third</button>
          </body>
        </html>
      `);
    });

    test(
      "OTC-001: candidate timeout continues when recovery budget remains",
      async ({ page }) => {
        const originalValidate =
          AILocatorValidator.prototype.validate;

        const evaluatedSelectors: string[] = [];

        AILocatorValidator.prototype.validate =
          async function (candidate): Promise<ValidationResult> {
            evaluatedSelectors.push(candidate.selector);

            if (candidate.selector === "#first-action") {
              return {
                valid: false,
                selector: candidate.selector,
                confidence: candidate.confidence,
                reason: "VALIDATION_TIMEOUT",
              };
            }

            return {
              valid: true,
              selector: candidate.selector,
              confidence: candidate.confidence,
            };
          };

        try {
          const orchestrator =
            new AIRecoveryOrchestrator(
              page,
              new MockAIProvider([
                {
                  selector: "#first-action",
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
              validationTimeoutMs: 3000,
            }
          );

          expect(result.status).toBe("SUGGESTED");
          expect(result.suggestedSelector).toBe(
            "#second-action"
          );

          expect(result.evaluatedCandidates).toBe(2);

          expect(evaluatedSelectors).toEqual([
            "#first-action",
            "#second-action",
          ]);

          expect(result.explanation?.decisions).toEqual([
            expect.objectContaining({
              candidateIndex: 0,
              decision: "REJECTED",
              reasons: ["VALIDATION_TIMEOUT"],
            }),
            expect.objectContaining({
              candidateIndex: 1,
              decision: "ACCEPTED",
              reasons: [],
            }),
          ]);
        } finally {
          AILocatorValidator.prototype.validate =
            originalValidate;
        }
      }
    );

    test(
      "OTC-002: exhausted recovery budget prevents further candidates",
      async ({ page }) => {
        const originalValidate =
          AILocatorValidator.prototype.validate;

        const evaluatedSelectors: string[] = [];

        AILocatorValidator.prototype.validate =
          async function (candidate): Promise<ValidationResult> {
            evaluatedSelectors.push(candidate.selector);

            await delay(150);

            return {
              valid: false,
              selector: candidate.selector,
              confidence: candidate.confidence,
              reason: "VALIDATION_TIMEOUT",
            };
          };

        try {
          const orchestrator =
            new AIRecoveryOrchestrator(
              page,
              new MockAIProvider([
                {
                  selector: "#first-action",
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
              validationTimeoutMs: 30,
            }
          );

          expect(result.status).toBe("FAILED");
          expect(result.reason).toBe(
            "VALIDATION_TIMEOUT"
          );

          expect(result.suggestedSelector).toBeUndefined();

          expect(result.evaluatedCandidates).toBe(1);

          expect(evaluatedSelectors).toEqual([
            "#first-action",
          ]);

          expect(result.explanation?.decisions).toEqual([
            expect.objectContaining({
              candidateIndex: 0,
              decision: "REJECTED",
              reasons: ["VALIDATION_TIMEOUT"],
            }),
            expect.objectContaining({
              candidateIndex: 1,
              decision: "NOT_EVALUATED",
              reasons: ["VALIDATION_TIMEOUT"],
            }),
          ]);
        } finally {
          AILocatorValidator.prototype.validate =
            originalValidate;
        }
      }
    );

    test(
      "OTC-003: late valid result cannot override recovery timeout",
      async ({ page }) => {
        const originalValidate =
          AILocatorValidator.prototype.validate;

        let resolveValidation:
          | ((value: ValidationResult) => void)
          | undefined;

        AILocatorValidator.prototype.validate =
          async function (): Promise<ValidationResult> {
            return new Promise<ValidationResult>(
              (resolve) => {
                resolveValidation = resolve;
              }
            );
          };

        try {
          const orchestrator =
            new AIRecoveryOrchestrator(
              page,
              new MockAIProvider([
                {
                  selector: "#first-action",
                  confidence: 0.99,
                },
              ])
            );

          const result = await orchestrator.suggest(
            "#missing-action",
            {
              enabled: true,
              validationTimeoutMs: 50,
            }
          );

          expect(result.status).toBe("FAILED");
          expect(result.reason).toBe(
            "VALIDATION_TIMEOUT"
          );

          expect(result.suggestedSelector).toBeUndefined();

          expect(resolveValidation).toBeDefined();

          resolveValidation?.({
            valid: true,
            selector: "#first-action",
            confidence: 0.99,
          });

          await Promise.resolve();

          expect(result.status).toBe("FAILED");
          expect(result.suggestedSelector).toBeUndefined();
          expect(result.explanation?.acceptedCandidates).toBe(0);
        } finally {
          AILocatorValidator.prototype.validate =
            originalValidate;
        }
      }
    );

    test(
      "OTC-004: ordinary rejection still allows a valid candidate",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            new MockAIProvider([
              {
                selector: "#missing-action",
                confidence: 0.99,
              },
              {
                selector: "#second-action",
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
          "#second-action"
        );

        expect(result.evaluatedCandidates).toBe(2);

        expect(result.explanation?.rejectedCandidates).toBe(1);
        expect(result.explanation?.acceptedCandidates).toBe(1);
      }
    );

    test(
      "OTC-005: previously accepted candidate is not suggested after overall timeout",
      async ({ page }) => {
        const originalValidate =
          AILocatorValidator.prototype.validate;

        const evaluatedSelectors: string[] = [];

        AILocatorValidator.prototype.validate =
          async function (candidate): Promise<ValidationResult> {
            evaluatedSelectors.push(candidate.selector);

            if (candidate.selector === "#first-action") {
              return {
                valid: true,
                selector: candidate.selector,
                confidence: candidate.confidence,
              };
            }

            return new Promise<ValidationResult>(() => {});
          };

        try {
          const orchestrator =
            new AIRecoveryOrchestrator(
              page,
              new MockAIProvider([
                {
                  selector: "#first-action",
                  confidence: 0.99,
                },
                {
                  selector: "#second-action",
                  confidence: 0.95,
                },
                {
                  selector: "#third-action",
                  confidence: 0.90,
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
          expect(result.reason).toBe(
            "VALIDATION_TIMEOUT"
          );

          expect(result.suggestedSelector).toBeUndefined();

          expect(evaluatedSelectors).toEqual([
            "#first-action",
            "#second-action",
          ]);

          expect(result.evaluatedCandidates).toBe(2);

          expect(result.explanation?.decisions).toEqual([
            expect.objectContaining({
              candidateIndex: 0,
              decision: "ACCEPTED",
            }),
            expect.objectContaining({
              candidateIndex: 1,
              decision: "REJECTED",
              reasons: ["VALIDATION_TIMEOUT"],
            }),
            expect.objectContaining({
              candidateIndex: 2,
              decision: "NOT_EVALUATED",
              reasons: ["VALIDATION_TIMEOUT"],
            }),
          ]);
        } finally {
          AILocatorValidator.prototype.validate =
            originalValidate;
        }
      }
    );
  }
);
