
import type {
  AIRecoveryExplanation,
} from "./AIRecoveryExplainabilityTypes";

import type {
  AIRecoveryDiagnostics,
} from "./AIRecoveryDiagnostics";

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
