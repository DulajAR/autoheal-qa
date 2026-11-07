
import { test, expect } from "@playwright/test";

import {
  DEFAULT_AI_RETRY_POLICY,
  validateAIRetryPolicy,
  isRetryableAIFailure,
  calculateAIRetryDelay,
  shouldRetryAIRequest,
} from "../src/ai/AIProviderRetryPolicy";

test.describe(
  "Phase 4.0.8 - AI Provider Retry Policy",
  () => {
    const policy = {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 500,
    };

    test("RET-001: retries disabled by default", () => {
      expect(
        DEFAULT_AI_RETRY_POLICY.maxRetries
      ).toBe(0);
    });

    test("RET-002: valid policy accepted", () => {
      expect(
        validateAIRetryPolicy(policy)
      ).toEqual(policy);
    });

    test("RET-003: excessive retries rejected", () => {
      expect(() =>
        validateAIRetryPolicy({
          ...policy,
          maxRetries: 10,
        })
      ).toThrow("INVALID_AI_RETRY_POLICY");
    });

    test("RET-004: invalid delays rejected", () => {
      expect(() =>
        validateAIRetryPolicy({
          ...policy,
          baseDelayMs: -1,
        })
      ).toThrow("INVALID_AI_RETRY_POLICY");
    });

    test("RET-005: HTTP 429 is retryable", () => {
      expect(
        isRetryableAIFailure({
          kind: "http",
          status: 429,
        })
      ).toBe(true);
    });

    test("RET-006: HTTP 503 is retryable", () => {
      expect(
        isRetryableAIFailure({
          kind: "http",
          status: 503,
        })
      ).toBe(true);
    });

    test("RET-007: authentication errors are not retryable", () => {
      for (const status of [401, 403]) {
        expect(
          isRetryableAIFailure({
            kind: "http",
            status,
          })
        ).toBe(false);
      }
    });

    test("RET-008: malformed responses are not retryable", () => {
      expect(
        isRetryableAIFailure({
          kind: "invalid_response",
        })
      ).toBe(false);
    });

    test("RET-009: network errors are retryable", () => {
      expect(
        isRetryableAIFailure({
          kind: "network",
        })
      ).toBe(true);
    });

    test("RET-010: exponential backoff is bounded", () => {
      expect(
        calculateAIRetryDelay(1, policy)
      ).toBe(100);

      expect(
        calculateAIRetryDelay(2, policy)
      ).toBe(200);
    });

    test("RET-011: retry limit is enforced", () => {
      const failure = {
        kind: "http" as const,
        status: 429,
      };

      expect(
        shouldRetryAIRequest(
          failure,
          0,
          policy
        )
      ).toBe(true);

      expect(
        shouldRetryAIRequest(
          failure,
          1,
          policy
        )
      ).toBe(true);

      expect(
        shouldRetryAIRequest(
          failure,
          2,
          policy
        )
      ).toBe(false);
    });

    test("RET-012: timeout is not retried", () => {
      expect(
        shouldRetryAIRequest(
          { kind: "timeout" },
          0,
          policy
        )
      ).toBe(false);
    });

    test("RET-013: invalid retry number rejected", () => {
      expect(() =>
        calculateAIRetryDelay(0, policy)
      ).toThrow("INVALID_AI_RETRY_NUMBER");
    });
  }
);
