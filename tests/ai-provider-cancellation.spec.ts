
import { test, expect } from "@playwright/test";

import {
  AIRetryError,
  executeAIWithRetry,
} from "../src/ai/AIProviderRetryExecutor";

const retryPolicy = {
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 200,
};

test.describe(
  "Phase 4.0.9 - AI Provider Cancellation",
  () => {
    test(
      "CAN-001: cancels an active pending operation",
      async () => {
        const controller = new AbortController();

        let calls = 0;
        let started = false;

        let notifyStarted!: () => void;

        const operationStarted = new Promise<void>(
          resolve => {
            notifyStarted = resolve;
          }
        );

        const execution = executeAIWithRetry(
          async () => {
            calls++;
            started = true;
            notifyStarted();

            return new Promise<string>(
              () => undefined
            );
          },
          {
            timeoutMs: 1000,
            signal: controller.signal,
          }
        );

        await operationStarted;

        controller.abort();

        await expect(execution).rejects.toThrow(
          "AI_RETRY_ABORTED"
        );

        expect(started).toBe(true);
        expect(calls).toBe(1);
      }
    );

    test(
      "CAN-002: cancellation prevents further retries",
      async () => {
        const controller = new AbortController();

        let calls = 0;

        let notifyFirstFailure!: () => void;

        const firstFailure = new Promise<void>(
          resolve => {
            notifyFirstFailure = resolve;
          }
        );

        const execution = executeAIWithRetry(
          async () => {
            calls++;
            notifyFirstFailure();

            throw new AIRetryError({
              kind: "http",
              status: 503,
            });
          },
          {
            timeoutMs: 1000,
            policy: retryPolicy,
            signal: controller.signal,
          }
        );

        await firstFailure;

        controller.abort();

        await expect(execution).rejects.toThrow(
          "AI_RETRY_ABORTED"
        );

        expect(calls).toBe(1);
      }
    );

    test(
      "CAN-003: deadline aborts the active operation",
      async () => {
        let capturedSignal:
          | AbortSignal
          | undefined;

        await expect(
          executeAIWithRetry(
            async (_attempt, signal) => {
              capturedSignal = signal;

              return new Promise<string>(
                () => undefined
              );
            },
            {
              timeoutMs: 30,
            }
          )
        ).rejects.toThrow(
          "AI_RETRY_TIMEOUT"
        );

        expect(capturedSignal?.aborted).toBe(true);
      }
    );

    test(
      "CAN-004: completed operations ignore later cancellation",
      async () => {
        const controller = new AbortController();

        const result = await executeAIWithRetry(
          async () => "completed",
          {
            timeoutMs: 1000,
            signal: controller.signal,
          }
        );

        controller.abort();

        expect(result).toBe("completed");
      }
    );

    test(
      "CAN-005: pre-aborted signal prevents execution",
      async () => {
        const controller = new AbortController();
        controller.abort();

        let calls = 0;

        await expect(
          executeAIWithRetry(
            async () => {
              calls++;
              return "unexpected";
            },
            {
              timeoutMs: 1000,
              signal: controller.signal,
            }
          )
        ).rejects.toThrow(
          "AI_RETRY_ABORTED"
        );

        expect(calls).toBe(0);
      }
    );
  }
);
