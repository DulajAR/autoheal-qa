
import { test, expect } from "@playwright/test";

import {
  AIRetryError,
  executeAIWithRetry,
} from "../src/ai/AIProviderRetryExecutor";

const retryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 2,
};

test.describe(
  "Phase 4.0.8 - AI Retry Executor",
  () => {
    test("REX-001: succeeds immediately", async () => {
      let calls = 0;

      const result = await executeAIWithRetry(
        async () => {
          calls++;
          return "success";
        },
        {
          timeoutMs: 1000,
          policy: retryPolicy,
        }
      );

      expect(result).toBe("success");
      expect(calls).toBe(1);
    });

    test("REX-002: retries HTTP 503", async () => {
      let calls = 0;

      const result = await executeAIWithRetry(
        async () => {
          calls++;

          if (calls < 3) {
            throw new AIRetryError({
              kind: "http",
              status: 503,
            });
          }

          return "recovered";
        },
        {
          timeoutMs: 1000,
          policy: retryPolicy,
        }
      );

      expect(result).toBe("recovered");
      expect(calls).toBe(3);
    });

    test("REX-003: does not retry HTTP 401", async () => {
      let calls = 0;

      await expect(
        executeAIWithRetry(
          async () => {
            calls++;

            throw new AIRetryError({
              kind: "http",
              status: 401,
            });
          },
          {
            timeoutMs: 1000,
            policy: retryPolicy,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_OPERATION_FAILED"
      );

      expect(calls).toBe(1);
    });

    test("REX-004: respects retry limit", async () => {
      let calls = 0;

      await expect(
        executeAIWithRetry(
          async () => {
            calls++;

            throw new AIRetryError({
              kind: "http",
              status: 429,
            });
          },
          {
            timeoutMs: 1000,
            policy: retryPolicy,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_OPERATION_FAILED"
      );

      expect(calls).toBe(3);
    });

    test("REX-005: retries network failure", async () => {
      let calls = 0;

      const result = await executeAIWithRetry(
        async () => {
          calls++;

          if (calls === 1) {
            throw new AIRetryError({
              kind: "network",
            });
          }

          return "network-recovered";
        },
        {
          timeoutMs: 1000,
          policy: retryPolicy,
        }
      );

      expect(result).toBe(
        "network-recovered"
      );
      expect(calls).toBe(2);
    });

    test("REX-006: does not retry invalid response", async () => {
      let calls = 0;

      await expect(
        executeAIWithRetry(
          async () => {
            calls++;

            throw new AIRetryError({
              kind: "invalid_response",
            });
          },
          {
            timeoutMs: 1000,
            policy: retryPolicy,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_OPERATION_FAILED"
      );

      expect(calls).toBe(1);
    });

    test("REX-007: enforces overall timeout", async () => {
      await expect(
        executeAIWithRetry(
          async () =>
            new Promise<string>(
              () => undefined
            ),
          {
            timeoutMs: 20,
            policy: retryPolicy,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_TIMEOUT"
      );
    });

    test("REX-008: default policy disables retries", async () => {
      let calls = 0;

      await expect(
        executeAIWithRetry(
          async () => {
            calls++;

            throw new AIRetryError({
              kind: "http",
              status: 503,
            });
          },
          {
            timeoutMs: 1000,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_OPERATION_FAILED"
      );

      expect(calls).toBe(1);
    });

    test("REX-009: rejects invalid timeout", async () => {
      await expect(
        executeAIWithRetry(
          async () => "unused",
          {
            timeoutMs: 0,
          }
        )
      ).rejects.toThrow(
        "INVALID_AI_TIMEOUT"
      );
    });

    test("REX-010: honors external cancellation", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeAIWithRetry(
          async () => "unused",
          {
            timeoutMs: 1000,
            signal: controller.signal,
          }
        )
      ).rejects.toThrow(
        "AI_RETRY_ABORTED"
      );
    });
  }
);
