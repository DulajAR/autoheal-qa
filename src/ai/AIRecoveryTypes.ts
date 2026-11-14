
import type {
  AIRecoveryExplanation,
} from "./AIRecoveryExplainabilityTypes";

import type {
  AIRecoveryDiagnostics,
} from "./AIRecoveryDiagnostics";

/**
 * AutoHeal QA - AI Recovery Types
 *
 * Phase 4.8 - Recovery Isolation &
 * Cancellation Hardening
 *
 * AI-generated locator suggestions remain
 * advisory-only.
 */

export type AIRecoveryStatus =
  | "SUGGESTED"
  | "NO_CANDIDATE"
  | "DISABLED"
  | "FAILED";

export type AIRecoveryResult = {
  status: AIRecoveryStatus;

  provider: string;

  primarySelector: string;

  suggestedSelector?: string;

  confidence?: number;

  evaluatedCandidates: number;

  reason?: string;

  /**
   * Structured candidate-level explanation.
   *
   * Does not expose raw candidate selectors
   * or DOM content.
   */
  explanation?: AIRecoveryExplanation;

  /**
   * Phase 4.7 recovery correlation metadata.
   *
   * Optional for compatibility with older
   * recovery results and audit consumers.
   */
  diagnostics?: AIRecoveryDiagnostics;
};

export type AIRecoveryOptions = {
  /**
   * Enable or disable AI recovery.
   *
   * Default: false
   */
  enabled?: boolean;

  /**
   * Minimum confidence required for
   * an AI-generated locator suggestion.
   *
   * Default: 0.85
   */
  minimumConfidence?: number;

  /**
   * Maximum provider execution time
   * in milliseconds.
   *
   * Default: 3000
   */
  providerTimeoutMs?: number;

  /**
   * Maximum number of AI candidates
   * considered during recovery.
   *
   * Default: 5
   */
  maxCandidates?: number;

  /**
   * Overall wall-clock validation budget.
   * Independent of providerTimeoutMs.
   *
   * Default: 3000
   */
  validationTimeoutMs?: number;

  /**
   * Phase 4.8 - External cancellation support.
   *
   * Allows the caller to request cancellation
   * using an AbortController.
   *
   * Optional to preserve backward compatibility.
   *
   * Cancellation is handled by
   * AIRecoveryOrchestrator.
   *
   * Expected cancellation outcome:
   * status: "FAILED"
   * reason: "RECOVERY_CANCELLED"
   *
   * AI-generated locators remain advisory-only.
   * They must never be automatically executed.
   */
  signal?: AbortSignal;
};
