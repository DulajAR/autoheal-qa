
import {
  test,
  expect,
} from "@playwright/test";

import type {
  TestResult,
} from "@playwright/test/reporter";

import AutoHealReporter from "../../src/reporters/AutoHealReporter";

import type {
  AIRecoveryAuditEvent,
} from "../../src/ai/AIRecoveryAudit";

type ReporterInspection = {
  extractAIRecoveryEvents(
    result: TestResult
  ): AIRecoveryAuditEvent[];
};

const ID_1 =
  "123e4567-e89b-42d3-a456-426614174000";

const ID_2 =
  "123e4567-e89b-42d3-a456-426614174001";

function createEvent(
  recoveryId: string = ID_1
): AIRecoveryAuditEvent {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: new Date().toISOString(),
    status: "FAILED",
    provider: "mock",
    evaluatedCandidates: 0,
    reason: "VALIDATION_TIMEOUT",
    recoveryId,
    diagnostics: {
      recoveryId,
      stage: "VALIDATION",
      durationMs: 120,
      timedOut: true,
    },
  };
}

function extractEvents(
  input: readonly unknown[]
): AIRecoveryAuditEvent[] {
  const reporter = new AutoHealReporter();

  const inspection =
    reporter as unknown as ReporterInspection;

  const result = {
    attachments: input.map(event => ({
      name: "autoheal-ai-recovery-event",
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(event),
        "utf8"
      ),
    })),
  } as TestResult;

  return inspection.extractAIRecoveryEvents(
    result
  );
}

test.describe(
  "Phase 4.8 - Reporter Lifecycle Integrity",
  () => {
    test(
      "RLR-001: accepts a valid recovery event",
      () => {
        const events = extractEvents([
          createEvent(),
        ]);

        expect(events).toHaveLength(1);
        expect(events[0].recoveryId).toBe(ID_1);
      }
    );

    test(
      "RLR-002: rejects duplicate recovery IDs",
      () => {
        const events = extractEvents([
          createEvent(ID_1),
          createEvent(ID_1),
        ]);

        expect(events).toHaveLength(1);
        expect(events[0].recoveryId).toBe(ID_1);
      }
    );

    test(
      "RLR-003: accepts different recovery IDs",
      () => {
        const events = extractEvents([
          createEvent(ID_1),
          createEvent(ID_2),
        ]);

        expect(events).toHaveLength(2);
      }
    );

    test(
      "RLR-004: preserves legacy audit events",
      () => {
        const legacy = {
          event: "AI_RECOVERY_EVALUATED",
          timestamp: new Date().toISOString(),
          status: "NO_CANDIDATE",
          provider: "mock",
          evaluatedCandidates: 0,
        };

        const events = extractEvents([
          legacy,
          legacy,
        ]);

        expect(events).toHaveLength(2);

        expect(
          events.every(
            event => event.recoveryId === undefined
          )
        ).toBe(true);
      }
    );

    test(
      "RLR-005: rejects partial correlation metadata",
      () => {
        const event = {
          ...createEvent(),
          diagnostics: undefined,
        };

        expect(
          extractEvents([event])
        ).toHaveLength(0);
      }
    );

    test(
      "RLR-006: rejects mismatched recovery IDs",
      () => {
        const event = {
          ...createEvent(),
          diagnostics: {
            ...createEvent().diagnostics,
            recoveryId: ID_2,
          },
        };

        expect(
          extractEvents([event])
        ).toHaveLength(0);
      }
    );

    test(
      "RLR-007: preserves valid event after duplicate",
      () => {
        const events = extractEvents([
          createEvent(ID_1),
          createEvent(ID_1),
          createEvent(ID_2),
        ]);

        expect(events).toHaveLength(2);

        expect(
          events.map(event => event.recoveryId)
        ).toEqual([ID_1, ID_2]);
      }
    );

    test(
      "RLR-008: strips unexpected sensitive fields",
      () => {
        const event = {
          ...createEvent(),
          primarySelector: "#private-password",
          domSnapshot: "PRIVATE_DOM_CONTENT",
          secret: "PRIVATE_API_KEY",
        };

        const events = extractEvents([event]);

        expect(events).toHaveLength(1);

        const output = JSON.stringify(events);

        expect(output).not.toContain(
          "#private-password"
        );

        expect(output).not.toContain(
          "PRIVATE_DOM_CONTENT"
        );

        expect(output).not.toContain(
          "PRIVATE_API_KEY"
        );
      }
    );
  }
);
