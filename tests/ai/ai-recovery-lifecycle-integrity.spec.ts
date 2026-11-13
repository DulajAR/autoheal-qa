
import {
  test,
  expect,
} from "@playwright/test";

import {
  validateRecoveryLifecycle,
} from "../../src/ai/AIRecoveryLifecycleIntegrity";

import type {
  AIRecoveryAuditEvent,
} from "../../src/ai/AIRecoveryAudit";

const ID_1 =
  "123e4567-e89b-42d3-a456-426614174000";

const ID_2 =
  "123e4567-e89b-42d3-a456-426614174001";

function makeEvent(
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

function issueCodes(events: readonly unknown[]) {
  return validateRecoveryLifecycle(events)
    .issues.map(issue => issue.code);
}

test.describe(
  "Phase 4.8 - Recovery Lifecycle Integrity",
  () => {
    test("RLI-001: accepts a valid recovery event", () => {
      const result = validateRecoveryLifecycle([
        makeEvent(),
      ]);

      expect(result.valid).toBe(true);
      expect(result.correlatedEvents).toBe(1);
      expect(result.invalidEvents).toBe(0);
      expect(result.issues).toEqual([]);
    });

    test("RLI-002: accepts unique recovery IDs", () => {
      const result = validateRecoveryLifecycle([
        makeEvent(ID_1),
        makeEvent(ID_2),
      ]);

      expect(result.valid).toBe(true);
      expect(result.correlatedEvents).toBe(2);
    });

    test("RLI-003: detects duplicate recovery IDs", () => {
      const result = validateRecoveryLifecycle([
        makeEvent(ID_1),
        makeEvent(ID_1),
      ]);

      expect(result.valid).toBe(false);
      expect(result.invalidEvents).toBe(1);
      expect(result.issues).toContainEqual({
        eventIndex: 1,
        code: "DUPLICATE_RECOVERY_ID",
      });
    });

    test("RLI-004: rejects mismatched IDs", () => {
      const event = makeEvent();

      event.diagnostics = {
        ...event.diagnostics!,
        recoveryId: ID_2,
      };

      expect(issueCodes([event])).toContain(
        "MISMATCHED_RECOVERY_ID"
      );
    });

    test("RLI-005: detects partial correlation", () => {
      const event = {
        ...makeEvent(),
        diagnostics: undefined,
      };

      expect(issueCodes([event])).toContain(
        "PARTIAL_CORRELATION"
      );
    });

    test("RLI-006: preserves legacy events", () => {
      const event = makeEvent();

      delete event.recoveryId;
      delete event.diagnostics;

      const result = validateRecoveryLifecycle([
        event,
      ]);

      expect(result.valid).toBe(true);
      expect(result.legacyEvents).toBe(1);
      expect(result.correlatedEvents).toBe(0);
    });

    test("RLI-007: rejects inconsistent timeouts", () => {
      const event = {
        ...makeEvent(),
        status: "SUGGESTED",
      };

      expect(issueCodes([event])).toContain(
        "INCONSISTENT_TIMEOUT"
      );
    });

    test("RLI-008: rejects invalid durations", () => {
      const event = {
        ...makeEvent(),
        diagnostics: {
          ...makeEvent().diagnostics,
          durationMs: -1,
        },
      };

      expect(issueCodes([event])).toContain(
        "INVALID_DIAGNOSTICS"
      );
    });

    test("RLI-009: accepts zero duration", () => {
      const event = makeEvent();

      event.diagnostics = {
        ...event.diagnostics!,
        durationMs: 0,
      };

      expect(
        validateRecoveryLifecycle([event]).valid
      ).toBe(true);
    });

    test("RLI-010: excludes sensitive metadata", () => {
      const event = {
        ...makeEvent(),
        primarySelector: "#private-password",
        domSnapshot: "PRIVATE_DOM_CONTENT",
        secret: "PRIVATE_API_KEY",
      };

      const result = validateRecoveryLifecycle([
        event,
      ]);

      const output = JSON.stringify(result);

      expect(output).not.toContain(
        "#private-password"
      );

      expect(output).not.toContain(
        "PRIVATE_DOM_CONTENT"
      );

      expect(output).not.toContain(
        "PRIVATE_API_KEY"
      );
    });

    test("RLI-011: rejects malformed records", () => {
      const result = validateRecoveryLifecycle([
        null,
        "invalid",
        {},
      ]);

      expect(result.valid).toBe(false);
      expect(result.invalidEvents).toBe(3);
    });

    test("RLI-012: accepts empty event collections", () => {
      const result = validateRecoveryLifecycle([]);

      expect(result).toEqual({
        valid: true,
        totalEvents: 0,
        correlatedEvents: 0,
        legacyEvents: 0,
        invalidEvents: 0,
        issues: [],
      });
    });
  }
);
