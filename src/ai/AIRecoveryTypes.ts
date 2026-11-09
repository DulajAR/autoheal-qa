
import type {
  AIRecoveryExplanation,
} from "./AIRecoveryExplainabilityTypes";

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
   * Structured recovery diagnostics.
   *
   * Does not expose raw candidate selectors
   * or DOM content.
   */
  explanation?: AIRecoveryExplanation;
};

export type AIRecoveryOptions = {
  enabled?: boolean;

  minimumConfidence?: number;

  providerTimeoutMs?: number;

  maxCandidates?: number;

  /**
   * Overall wall-clock validation budget.
   * Independent of providerTimeoutMs.
   */
  validationTimeoutMs?: number;
};
