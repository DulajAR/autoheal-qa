
import type {
  AILocatorRejectionReason,
} from "./AILocatorValidationTypes";

import type {
  AICandidateRankingReason,
} from "./AICandidateRankingTypes";

export type AICandidateDecision =
  | "ACCEPTED"
  | "REJECTED"
  | "NOT_EVALUATED";

export type AICandidateDecisionReason =
  | AILocatorRejectionReason
  | AICandidateRankingReason
  | "MALFORMED_CANDIDATE"
  | "VALIDATION_TIMEOUT"
  | "NOT_SELECTED";

export type AICandidateDecisionRecord = {
  /**
   * Position in confidence-sorted evaluation order.
   */
  candidateIndex: number;

  decision: AICandidateDecision;

  reasons: AICandidateDecisionReason[];

  validationDurationMs?: number;
};

export type AIRecoveryExplanation = {
  evaluatedCandidates: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  validationDurationMs: number;
  decisions: AICandidateDecisionRecord[];
};
