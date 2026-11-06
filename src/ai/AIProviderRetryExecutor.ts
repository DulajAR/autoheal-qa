
import {
  DEFAULT_AI_RETRY_POLICY,
  calculateAIRetryDelay,
  shouldRetryAIRequest,
  validateAIRetryPolicy,
} from "./AIProviderRetryPolicy";

import type {
  AIRetryFailure,
  AIProviderRetryPolicy,
} from "./AIProviderRetryPolicy";

export type AIRetryExecutorOptions = {
  policy?: AIProviderRetryPolicy;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type AIRetryOperation<T> = (
  attempt: number,
  signal: AbortSignal
) => Promise<T>;

export class AIRetryError extends Error {
  constructor(
    public readonly failure: AIRetryFailure
  ) {
    super("AI_RETRY_OPERATION_FAILED");
    this.name = "AIRetryError";
  }
}

function waitForDelay(
  durationMs: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("AI_RETRY_ABORTED"));
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener(
        "abort",
        onAbort
      );
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("AI_RETRY_ABORTED"));
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    signal.addEventListener(
      "abort",
      onAbort,
      { once: true }
    );
  });
}

/**
 * Executes a provider operation using one
 * overall timeout and a bounded retry policy.
 *
 * The operation must throw AIRetryError for
 * classified failures.
 */
export async function executeAIWithRetry<T>(
  operation: AIRetryOperation<T>,
  options: AIRetryExecutorOptions
): Promise<T> {
  const policy = validateAIRetryPolicy(
    options.policy ?? DEFAULT_AI_RETRY_POLICY
  );

  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 10_000
  ) {
    throw new Error("INVALID_AI_TIMEOUT");
  }

  const controller = new AbortController();

  let timedOut = false;
  let retriesUsed = 0;

  const onExternalAbort = () => {
    controller.abort();
  };

  options.signal?.addEventListener(
    "abort",
    onExternalAbort,
    { once: true }
  );

  if (options.signal?.aborted) {
    controller.abort();
  }

  let deadlineTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    const deadline = new Promise<never>(
      (_, reject) => {
        deadlineTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("AI_RETRY_TIMEOUT"));
        }, options.timeoutMs);
      }
    );

    const execution = (async (): Promise<T> => {
      while (true) {
        if (controller.signal.aborted) {
          throw new Error("AI_RETRY_ABORTED");
        }

        try {
          return await operation(
            retriesUsed + 1,
            controller.signal
          );
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error("AI_RETRY_ABORTED");
          }

          if (!(error instanceof AIRetryError)) {
            throw error;
          }

          if (
            !shouldRetryAIRequest(
              error.failure,
              retriesUsed,
              policy
            )
          ) {
            throw error;
          }

          retriesUsed++;

          const delay = calculateAIRetryDelay(
            retriesUsed,
            policy
          );

          await waitForDelay(
            delay,
            controller.signal
          );
        }
      }
    })();

    return await Promise.race([
      execution,
      deadline,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new Error("AI_RETRY_TIMEOUT");
    }

    throw error;
  } finally {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
    }

    options.signal?.removeEventListener(
      "abort",
      onExternalAbort
    );

    controller.abort();
  }
}
