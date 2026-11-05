
/**
 * AutoHeal QA
 * Phase 4.0.7 - Provider Diagnostics
 *
 * Security:
 * - No API keys or credentials stored
 * - No DOM snapshots or selectors stored
 * - No request bodies or raw errors stored
 * - Strict provider validation
 * - Strict error-code allowlisting
 * - Numeric value normalization
 * - Bounded in-memory event retention
 * - Defensive copies of stored events
 */

export type AIProviderName =
  | "openai"
  | "gemini";

export type AIProviderOutcome =
  | "success"
  | "failure";

export type AIProviderErrorCode =
  | "NONE"
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMITED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "UNKNOWN_ERROR";

export type AIProviderDiagnostic = Readonly<{
  provider: AIProviderName;
  outcome: AIProviderOutcome;
  errorCode: AIProviderErrorCode;
  durationMs: number;
  candidateCount: number;
}>;

export type AIProviderMetrics = Readonly<{
  provider: AIProviderName;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDurationMs: number;
}>;

/**
 * Maximum number of events retained.
 */
const MAX_EVENTS = 1000;

/**
 * Approved diagnostic error codes.
 */
const ALLOWED_ERROR_CODES =
  new Set<AIProviderErrorCode>([
    "NONE",
    "UNAUTHORIZED",
    "INVALID_REQUEST",
    "AUTHENTICATION_ERROR",
    "RATE_LIMITED",
    "HTTP_ERROR",
    "TIMEOUT",
    "NETWORK_ERROR",
    "INVALID_RESPONSE",
    "RESPONSE_TOO_LARGE",
    "UNKNOWN_ERROR",
  ]);

/**
 * Validate a diagnostic error code.
 */
function isAllowedErrorCode(
  value: unknown
): value is AIProviderErrorCode {
  return (
    typeof value === "string" &&
    ALLOWED_ERROR_CODES.has(
      value as AIProviderErrorCode
    )
  );
}

/**
 * Normalize numeric diagnostic values.
 */
function normalizeNonNegativeInteger(
  value: unknown,
  maximum: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.min(
    maximum,
    Math.max(0, Math.floor(value))
  );
}

/**
 * In-memory AI provider diagnostics.
 *
 * This class never makes network calls.
 */
export class AIProviderDiagnostics {
  private readonly events:
    AIProviderDiagnostic[] = [];

  /**
   * Record a sanitized diagnostic event.
   *
   * Invalid provider names are rejected.
   * Unknown error messages are replaced
   * with UNKNOWN_ERROR.
   */
  record(
    event: AIProviderDiagnostic
  ): void {
    // Reject unknown provider identities.
    if (
      event.provider !== "openai" &&
      event.provider !== "gemini"
    ) {
      return;
    }

    const provider: AIProviderName =
      event.provider;

    const outcome: AIProviderOutcome =
      event.outcome === "success"
        ? "success"
        : "failure";

    const errorCode: AIProviderErrorCode =
      isAllowedErrorCode(event.errorCode)
        ? event.errorCode
        : "UNKNOWN_ERROR";

    const durationMs =
      normalizeNonNegativeInteger(
        event.durationMs,
        3_600_000
      );

    const candidateCount =
      normalizeNonNegativeInteger(
        event.candidateCount,
        5
      );

    const safeEvent: AIProviderDiagnostic = {
      provider,
      outcome,
      errorCode:
        outcome === "success"
          ? "NONE"
          : errorCode === "NONE"
            ? "UNKNOWN_ERROR"
            : errorCode,
      durationMs,
      candidateCount:
        outcome === "success"
          ? candidateCount
          : 0,
    };

    this.events.push(safeEvent);

    // Prevent unbounded memory growth.
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }
  }

  /**
   * Return defensive copies of events.
   */
  getEvents(): AIProviderDiagnostic[] {
    return this.events.map(
      event => ({ ...event })
    );
  }

  /**
   * Calculate metrics for one provider.
   */
  getMetrics(
    provider: AIProviderName
  ): AIProviderMetrics {
    const providerEvents =
      this.events.filter(
        event =>
          event.provider === provider
      );

    const totalRequests =
      providerEvents.length;

    const successfulRequests =
      providerEvents.filter(
        event =>
          event.outcome === "success"
      ).length;

    const failedRequests =
      totalRequests - successfulRequests;

    const totalDuration =
      providerEvents.reduce(
        (sum, event) =>
          sum + event.durationMs,
        0
      );

    const averageDurationMs =
      totalRequests === 0
        ? 0
        : Math.round(
            totalDuration /
              totalRequests
          );

    return {
      provider,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageDurationMs,
    };
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.events.length = 0;
  }
}
