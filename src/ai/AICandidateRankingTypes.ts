
export type AICandidateRankingInput = {
  selector: string;
  confidence: number;
  uniqueMatch: boolean;
  visible: boolean;
};

export type AICandidateRankingReason =
  | "INVALID_SELECTOR"
  | "INVALID_CONFIDENCE"
  | "NOT_UNIQUE"
  | "NOT_VISIBLE"
  | "DUPLICATE_SELECTOR";

export type AICandidateRankingResult = {
  selector: string;
  confidence: number;
  score: number;
  eligible: boolean;
  reasons: AICandidateRankingReason[];
};
