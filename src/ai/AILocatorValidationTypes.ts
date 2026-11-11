
/**
 * AutoHeal QA
 * Phase 4.6 - AI Locator Validation Types
 *
 * Defines the validation result, rejection reasons,
 * and configuration options for AI locator candidates.
 *
 * AI-generated selectors must pass validation before
 * they can be considered eligible suggestions.
 */

export type AILocatorRejectionReason =
  | "INVALID_SELECTOR"
  | "INVALID_CONFIDENCE"
  | "LOW_CONFIDENCE"
  | "NO_MATCH"
  | "AMBIGUOUS_MATCH"
  | "NOT_VISIBLE"
  | "UNSAFE_TARGET"
  | "VALIDATION_TIMEOUT";

export type AILocatorValidationResult = {
  /**
   * Whether the candidate passed validation.
   */
  valid: boolean;

  /**
   * Candidate CSS selector.
   */
  selector: string;

  /**
   * Candidate confidence score (0 to 1).
   */
  confidence: number;

  /**
   * Reason for rejecting an invalid candidate.
   */
  reason?: AILocatorRejectionReason;
};

export type AILocatorValidationOptions = {
  /**
   * Minimum confidence required to accept a candidate.
   *
   * Default: 0.85
   */
  minConfidence?: number;

  /**
   * Maximum validation duration in milliseconds.
   *
   * Default: 1000
   * Allowed range: 1 to 10000
   */
  timeoutMs?: number;
};
