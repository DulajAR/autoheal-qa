
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
};

export type AIRecoveryOptions = {
  enabled?: boolean;

  minimumConfidence?: number;

  providerTimeoutMs?: number;

  maxCandidates?: number;
};
