
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

/**
 * AutoHeal QA
 * Phase 4.0.9 - Retry Executor Hardening
 *
 * Features:
 * - Bounded retry policy
 * - One overall deadline
 * - Immediate external cancellation
 * - Abort propagation
 * - No retries after cancellation
 * - Sanitized retry observability
 * - Safe optional progress callbacks
 *
 * Security:
 * - No credentials recorded
 * - No request bodies recorded
 * - No raw provider responses recorded
 * - No raw error messages recorded
 */

export type AIRetryFailureCategory =
  | "RATE_LIMITED"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "NONE";

export type AIRetryProgress = Readonly<{
  attemptCount: number;
  retryCount: number;
  lastRetryErrorCode: AIRetryFailureCategory;
}>;

export type AIRetryExecutorOptions = {
  policy?: AIProviderRetryPolicy;
  timeoutMs: number;
  signal?: AbortSignal;

  /**
   * Optional sanitized retry progress observer.
   *
   * Called when an attempt starts or when
   * a retryable failure is scheduled.
   *
   * Observer exceptions are ignored.
   */
  onRetryProgress?: (
    progress: AIRetryProgress
  ) => void;
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

/**
 * Convert a retry failure to an approved
 * diagnostic category.
 *
 * Never expose arbitrary error messages.
 */
function classifyRetryFailure(
  failure: AIRetryFailure
): AIRetryFailureCategory {
  if (failure.kind === "network") {
    return "NETWORK_ERROR";
  }

  if (failure.kind === "http") {
    if (failure.status === 429) {
      return "RATE_LIMITED";
    }

    return "HTTP_ERROR";
  }

  return "NONE";
}

/**
 * Wait for a bounded retry delay.
 *
 * The delay can be interrupted by an
 * AbortSignal.
 */
function waitForDelay(
  durationMs: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("AI_RETRY_ABORTED"));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

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

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    signal.addEventListener(
      "abort",
      onAbort,
      { once: true }
    );

    // Handle an abort that occurred
    // while the listener was registered.
    if (signal.aborted) {
      onAbort();
    }
  });
}

/**
 * Execute an AI operation using a bounded
 * retry policy and one overall deadline.
 *
 * Cancellation cannot forcibly terminate
 * operations that ignore AbortSignal.
 * However, the public promise settles
 * without waiting for those operations.
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

  let attemptCount = 0;
  let retriesUsed = 0;

  let lastRetryErrorCode:
    AIRetryFailureCategory = "NONE";

  let deadlineTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  let rejectCancellation:
    | ((reason: Error) => void)
    | undefined;

  /**
   * Notify observers using sanitized,
   * bounded progress information.
   *
   * Diagnostics must never affect the
   * execution result.
   */
  const notifyProgress = (): void => {
    if (!options.onRetryProgress) {
      return;
    }

    const progress: AIRetryProgress = {
      attemptCount: Math.min(
        attemptCount,
        3
      ),

      retryCount: Math.min(
        retriesUsed,
        Math.max(0, attemptCount - 1),
        2
      ),

      lastRetryErrorCode,
    };

    try {
      options.onRetryProgress(progress);
    } catch {
      // Observer errors must never
      // interrupt provider execution.
    }
  };

  /**
   * External cancellation promise.
   *
   * This allows immediate settlement even
   * when the active operation ignores
   * its AbortSignal.
   */
  const cancellation = new Promise<never>(
    (_, reject) => {
      rejectCancellation = reject;
    }
  );

  const onExternalAbort = () => {
    if (controller.signal.aborted) {
      return;
    }

    controller.abort();

    rejectCancellation?.(
      new Error("AI_RETRY_ABORTED")
    );
  };

  options.signal?.addEventListener(
    "abort",
    onExternalAbort,
    { once: true }
  );

  if (options.signal?.aborted) {
    onExternalAbort();
  }

  /**
   * Overall deadline applies to:
   * - Active operations
   * - Retry backoff
   * - All retry attempts combined
   */
  const deadline = new Promise<never>(
    (_, reject) => {
      deadlineTimer = setTimeout(() => {
        if (controller.signal.aborted) {
          return;
        }

        timedOut = true;
        controller.abort();

        reject(
          new Error("AI_RETRY_TIMEOUT")
        );
      }, options.timeoutMs);
    }
  );

  /**
   * Execute attempts sequentially.
   */
  const execution = (async (): Promise<T> => {
    while (true) {
      if (controller.signal.aborted) {
        throw new Error("AI_RETRY_ABORTED");
      }

      attemptCount++;

      notifyProgress();

      try {
        const result = await operation(
          attemptCount,
          controller.signal
        );

        if (controller.signal.aborted) {
          throw new Error("AI_RETRY_ABORTED");
        }

        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error("AI_RETRY_ABORTED");
        }

        if (!(error instanceof AIRetryError)) {
          throw error;
        }

        const retryAllowed =
          shouldRetryAIRequest(
            error.failure,
            retriesUsed,
            policy
          );

        if (!retryAllowed) {
          throw error;
        }

        /**
         * Record the category of the
         * failure that caused a retry.
         */
        lastRetryErrorCode =
          classifyRetryFailure(
            error.failure
          );

        retriesUsed++;

        const delay = calculateAIRetryDelay(
          retriesUsed,
          policy
        );

        /**
         * Wait before starting the next
         * attempt.
         */
        await waitForDelay(
          delay,
          controller.signal
        );
      }
    }
  })();

  try {
    return await Promise.race([
      execution,
      deadline,
      cancellation,
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
