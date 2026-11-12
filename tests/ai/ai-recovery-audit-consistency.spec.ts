
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

/**
 * Test the reporter's audit ingestion boundary
 * without changing its public production API.
 */
function extractEvents(
  event: unknown
): AIRecoveryAuditEvent[] {
  const reporter = new AutoHealReporter();

  const inspection =
    reporter as unknown as ReporterInspection;

  const result = {
    attachments: [
      {
        name: "autoheal-ai-recovery-event",
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(event),
          "utf8"
        ),
      },
    ],
  } as TestResult;

  return inspection.extractAIRecoveryEvents(
    result
  );
}

const RECOVERY_ID =
  "123e4567-e89b-42d3-a456-426614174000";

function createEvent(): AIRecoveryAuditEvent {
  return {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: new Date().toISOString(),

    status: "FAILED",
    provider: "mock",

    evaluatedCandidates: 1,
    reason: "VALIDATION_TIMEOUT",

    recoveryId: RECOVERY_ID,

    diagnostics: {
      recoveryId: RECOVERY_ID,
      stage: "VALIDATION",
      durationMs: 120,
      timedOut: true,
    },

    analytics: {
      acceptedCandidates: 0,
      rejectedCandidates: 1,
      notEvaluatedCandidates: 2,
      validationDurationMs: 100,

      rejectionReasons: {
        VALIDATION_TIMEOUT: 1,
      },
    },
  };
}

test.describe(
  "Phase 4.7 - Recovery Audit Consistency",
  () => {
    test(
      "RAC-001: preserves valid recovery correlation metadata",
      () => {
        const events = extractEvents(
          createEvent()
        );

        expect(events).toHaveLength(1);

        expect(events[0].recoveryId).toBe(
          RECOVERY_ID
        );

        expect(events[0].diagnostics).toEqual({
          recoveryId: RECOVERY_ID,
          stage: "VALIDATION",
          durationMs: 120,
          timedOut: true,
        });
      }
    );

    test(
      "RAC-002: accepts not-evaluated candidates separately",
      () => {
        const events = extractEvents(
          createEvent()
        );

        expect(events).toHaveLength(1);

        expect(
          events[0].evaluatedCandidates
        ).toBe(1);

        expect(
          events[0].analytics
            ?.notEvaluatedCandidates
        ).toBe(2);

        expect(
          events[0].analytics
            ?.rejectedCandidates
        ).toBe(1);
      }
    );

    test(
      "RAC-003: rejects mismatched recovery IDs",
      () => {
        const event = createEvent();

        event.recoveryId =
          "123e4567-e89b-42d3-a456-426614174001";

        expect(
          extractEvents(event)
        ).toHaveLength(0);
      }
    );

    test(
      "RAC-004: rejects inconsistent candidate counts",
      () => {
        const event = createEvent();

        event.evaluatedCandidates = 3;

        expect(
          extractEvents(event)
        ).toHaveLength(0);
      }
    );

    test(
      "RAC-005: rejects invalid recovery stages",
      () => {
        const event = createEvent();

        const invalid = {
          ...event,

          diagnostics: {
            ...event.diagnostics,
            stage: "SECRET_STAGE",
          },
        };

        expect(
          extractEvents(invalid)
        ).toHaveLength(0);
      }
    );

    test(
      "RAC-006: strips unexpected sensitive fields",
      () => {
        const event = {
          ...createEvent(),

          primarySelector:
            "#private-password-field",

          domSnapshot:
            "Sensitive DOM content",

          diagnostics: {
            ...createEvent().diagnostics,

            rawProviderError:
              "Sensitive provider error",

            secret:
              "PRIVATE_TEST_SECRET",
          },
        };

        const events = extractEvents(event);

        expect(events).toHaveLength(1);

        const serialized =
          JSON.stringify(events[0]);

        expect(serialized).not.toContain(
          "#private-password-field"
        );

        expect(serialized).not.toContain(
          "Sensitive DOM content"
        );

        expect(serialized).not.toContain(
          "Sensitive provider error"
        );

        expect(serialized).not.toContain(
          "PRIVATE_TEST_SECRET"
        );
      }
    );

    test(
      "RAC-007: preserves legacy audit events",
      () => {
        const legacy = {
          event: "AI_RECOVERY_EVALUATED",
          timestamp:
            new Date().toISOString(),

          status: "NO_CANDIDATE",
          provider: "mock",

          evaluatedCandidates: 0,
          reason: "NO_CANDIDATES_RETURNED",
        };

        const events = extractEvents(
          legacy
        );

        expect(events).toHaveLength(1);

        expect(
          events[0].recoveryId
        ).toBeUndefined();

        expect(
          events[0].diagnostics
        ).toBeUndefined();
      }
    );

    test(
      "RAC-008: rejects partial correlation metadata",
      () => {
        const event = createEvent();

        const partial = {
          ...event,
          diagnostics: undefined,
        };

        expect(
          extractEvents(partial)
        ).toHaveLength(0);
      }
    );

    test(
      "RAC-009: rejects timeout metadata on successful outcomes",
      () => {
        const event = {
          ...createEvent(),
          status: "SUGGESTED",
          reason: undefined,
          confidence: 0.95,
        };

        expect(
          extractEvents(event)
        ).toHaveLength(0);
      }
    );
  }
);
