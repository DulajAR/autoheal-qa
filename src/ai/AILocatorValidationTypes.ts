
export type AILocatorRejectionReason =
  | "INVALID_SELECTOR"
  | "INVALID_CONFIDENCE"
  | "LOW_CONFIDENCE"
  | "NO_MATCH"
  | "AMBIGUOUS_MATCH"
  | "NOT_VISIBLE"
  | "UNSAFE_TARGET";

export type AILocatorValidationResult = {
  valid: boolean;
  selector: string;
  confidence: number;
  reason?: AILocatorRejectionReason;
};

export type AILocatorValidationOptions = {
  minConfidence?: number;
  timeoutMs?: number;
};
