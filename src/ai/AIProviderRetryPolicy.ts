
/**
 * AutoHeal QA
 * Phase 4.0.8 - AI Provider Retry Policy
 *
 * Security and reliability:
 * - Retries disabled by default
 * - Maximum two additional attempts
 * - Exponential backoff
 * - No random or unbounded delays
 * - Only temporary failures are retryable
 * - No API keys or response bodies retained
 */

export type AIProviderRetryPolicy = Readonly<{
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>;

export type AIRetryFailure =
  | Readonly<{
      kind: "http";
      status: number;
    }>
  | Readonly<{
      kind: "network";
    }>
  | Readonly<{
      kind:
        | "timeout"
        | "invalid_request"
        | "invalid_response"
        | "unauthorized"
        | "response_too_large";
    }>;

export const DEFAULT_AI_RETRY_POLICY:
  AIProviderRetryPolicy = Object.freeze({
    maxRetries: 0,
    baseDelayMs: 100,
    maxDelayMs: 500,
  });

export function validateAIRetryPolicy(
  policy: AIProviderRetryPolicy
): AIProviderRetryPolicy {
  if (
    !Number.isSafeInteger(policy.maxRetries) ||
    policy.maxRetries < 0 ||
    policy.maxRetries > 2
  ) {
    throw new Error("INVALID_AI_RETRY_POLICY");
  }

  if (
    !Number.isSafeInteger(policy.baseDelayMs) ||
    policy.baseDelayMs < 0 ||
    policy.baseDelayMs > 1000
  ) {
    throw new Error("INVALID_AI_RETRY_POLICY");
  }

  if (
    !Number.isSafeInteger(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxDelayMs > 2000
  ) {
    throw new Error("INVALID_AI_RETRY_POLICY");
  }

  return Object.freeze({
    maxRetries: policy.maxRetries,
    baseDelayMs: policy.baseDelayMs,
    maxDelayMs: policy.maxDelayMs,
  });
}

export function isRetryableAIFailure(
  failure: AIRetryFailure
): boolean {
  switch (failure.kind) {
    case "http":
      return (
        failure.status === 429 ||
        failure.status === 500 ||
        failure.status === 502 ||
        failure.status === 503 ||
        failure.status === 504
      );

    case "network":
      return true;

    default:
      return false;
  }
}

/**
 * retryNumber starts at 1 for the first retry.
 */
export function calculateAIRetryDelay(
  retryNumber: number,
  policy: AIProviderRetryPolicy
): number {
  const safePolicy =
    validateAIRetryPolicy(policy);

  if (
    !Number.isSafeInteger(retryNumber) ||
    retryNumber < 1 ||
    retryNumber > safePolicy.maxRetries
  ) {
    throw new Error("INVALID_AI_RETRY_NUMBER");
  }

  const exponentialDelay =
    safePolicy.baseDelayMs *
    2 ** (retryNumber - 1);

  return Math.min(
    exponentialDelay,
    safePolicy.maxDelayMs
  );
}

/**
 * Determines whether another attempt is allowed.
 *
 * retriesUsed:
 * 0 = first request has failed
 * 1 = first retry has failed
 */
export function shouldRetryAIRequest(
  failure: AIRetryFailure,
  retriesUsed: number,
  policy: AIProviderRetryPolicy
): boolean {
  const safePolicy =
    validateAIRetryPolicy(policy);

  if (
    !Number.isSafeInteger(retriesUsed) ||
    retriesUsed < 0
  ) {
    return false;
  }

  return (
    retriesUsed < safePolicy.maxRetries &&
    isRetryableAIFailure(failure)
  );
}
