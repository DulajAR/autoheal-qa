
import {
  test,
  expect,
} from "@playwright/test";

import { AIRecoveryOrchestrator } from "../../src/ai/AIRecoveryOrchestrator";
import { AIRecoveryAudit } from "../../src/ai/AIRecoveryAudit";
import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { Logger } from "../../src/core/Logger";

import type {
  AIRecoveryAuditEvent,
} from "../../src/ai/AIRecoveryAudit";

test.describe(
  "Phase 4.7 - Structured Recovery Diagnostics",
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
            <button id="valid-action">
              Submit
            </button>
          </body>
        </html>
      `);
    });

    test(
      "RD-001: successful recovery includes correlation metadata",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
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
          { enabled: true }
        );

        expect(result.status).toBe("SUGGESTED");

        expect(result.diagnostics).toEqual({
          recoveryId: expect.any(String),
          stage: "COMPLETED",
          durationMs: expect.any(Number),
          timedOut: false,
        });

        expect(
          result.diagnostics?.recoveryId
        ).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );

        expect(
          result.diagnostics?.durationMs
        ).toBeGreaterThanOrEqual(0);
      }
    );

    test(
      "RD-002: every invocation receives a unique ID",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            new MockAIProvider([])
          );

        const first = await orchestrator.suggest(
          "#missing-action",
          { enabled: true }
        );

        const second = await orchestrator.suggest(
          "#missing-action",
          { enabled: true }
        );

        expect(first.diagnostics?.recoveryId).toBeDefined();
        expect(second.diagnostics?.recoveryId).toBeDefined();

        expect(
          first.diagnostics?.recoveryId
        ).not.toBe(
          second.diagnostics?.recoveryId
        );
      }
    );

    test(
      "RD-003: disabled recovery retains diagnostics",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            null
          );

        const result = await orchestrator.suggest(
          "#missing-action",
          { enabled: true }
        );

        expect(result.status).toBe("DISABLED");

        expect(result.diagnostics?.stage).toBe(
          "AUTHORIZATION"
        );

        expect(result.diagnostics?.timedOut).toBe(
          false
        );

        expect(result.evaluatedCandidates).toBe(0);
      }
    );

    test(
      "RD-004: provider timeout is identified without changing failure reason",
      async ({ page }) => {
        const provider = {
          name: "mock",

          async suggestLocators(): Promise<
            { selector: string; confidence: number }[]
          > {
            return new Promise(() => {});
          },
        };

        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            provider
          );

        const result = await orchestrator.suggest(
          "#missing-action",
          {
            enabled: true,
            providerTimeoutMs: 30,
          }
        );

        expect(result.status).toBe("FAILED");

        expect(result.reason).toBe(
          "RECOVERY_PIPELINE_FAILED"
        );

        expect(result.diagnostics?.stage).toBe(
          "PROVIDER"
        );

        expect(result.diagnostics?.timedOut).toBe(
          true
        );

        expect(result.suggestedSelector).toBeUndefined();
      }
    );

    test(
      "RD-005: validation timeout remains fail-closed",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
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
            validationTimeoutMs: 1,
          }
        );

        expect(result.status).toBe("FAILED");

        expect(result.reason).toBe(
          "VALIDATION_TIMEOUT"
        );

        expect(result.diagnostics?.stage).toBe(
          "VALIDATION"
        );

        expect(result.diagnostics?.timedOut).toBe(
          true
        );

        expect(result.suggestedSelector).toBeUndefined();
      }
    );

    test(
      "RD-006: audit log and attachment share recovery ID",
      async ({ page }, testInfo) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            new MockAIProvider([])
          );

        const result = await orchestrator.suggest(
          "#missing-action",
          { enabled: true }
        );

        const originalInfo = Logger.info;

        const loggedContexts: Array<
          Record<
            string,
            string | number | boolean | null
          >
        > = [];

        Logger.info = (
          _message,
          context
        ): void => {
          if (context) {
            loggedContexts.push(context);
          }
        };

        try {
          AIRecoveryAudit.record(result);

          const attachment = testInfo.attachments
            .filter(
              (item) =>
                item.name ===
                "autoheal-ai-recovery-event"
            )
            .at(-1);

          expect(attachment?.body).toBeDefined();

          const event = JSON.parse(
            attachment!.body!.toString("utf8")
          ) as AIRecoveryAuditEvent;

          expect(event.recoveryId).toBe(
            result.diagnostics?.recoveryId
          );

          expect(event.diagnostics?.recoveryId).toBe(
            result.diagnostics?.recoveryId
          );

          expect(loggedContexts).toContainEqual(
            expect.objectContaining({
              recoveryId:
                result.diagnostics?.recoveryId,
              recoveryStage:
                result.diagnostics?.stage,
            })
          );
        } finally {
          Logger.info = originalInfo;
        }
      }
    );

    test(
      "RD-007: diagnostics and audit exclude raw selectors",
      async ({ page }, testInfo) => {
        const sensitiveSelector =
          "#private-account-secret-12345";

        const orchestrator =
          new AIRecoveryOrchestrator(
            page,
            new MockAIProvider([])
          );

        const result = await orchestrator.suggest(
          sensitiveSelector,
          { enabled: true }
        );

        expect(
          JSON.stringify(result.diagnostics)
        ).not.toContain(sensitiveSelector);

        AIRecoveryAudit.record(result);

        const attachment = testInfo.attachments
          .filter(
            (item) =>
              item.name ===
              "autoheal-ai-recovery-event"
          )
          .at(-1);

        expect(attachment?.body).toBeDefined();

        expect(
          attachment!.body!.toString("utf8")
        ).not.toContain(sensitiveSelector);
      }
    );

    test(
      "RD-008: existing recovery result fields remain available",
      async ({ page }) => {
        const orchestrator =
          new AIRecoveryOrchestrator(
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
          { enabled: true }
        );

        expect(result).toEqual(
          expect.objectContaining({
            status: "SUGGESTED",
            provider: "mock",
            primarySelector: "#old-action",
            suggestedSelector: "#valid-action",
            confidence: 0.95,
            evaluatedCandidates: 1,
          })
        );

        expect(
          result.explanation?.acceptedCandidates
        ).toBe(1);

        expect(
          result.diagnostics?.recoveryId
        ).toBeDefined();
      }
    );
  }
);
