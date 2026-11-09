
import type {
  AICandidateRankingInput,
  AICandidateRankingReason,
  AICandidateRankingResult,
} from "./AICandidateRankingTypes";

/**
 * Deterministic ranking of AI locator candidates.
 *
 * Security boundaries:
 * - Does not execute selectors.
 * - Does not access the DOM.
 * - Does not call external AI providers.
 * - Does not perform browser actions.
 * - Does not log raw selectors or DOM content.
 *
 * uniqueMatch and visible must come from trusted
 * Playwright validation, not an AI provider.
 */
export class AICandidateRanker {
  rank(
    candidates: readonly AICandidateRankingInput[],
    options: { includeInputIndex?: boolean } = {}
  ): AICandidateRankingResult[] {
    const seenSelectors = new Set<string>();

    const ranked = candidates.map((candidate, index) => {
      const reasons: AICandidateRankingReason[] = [];

      const selector =
        typeof candidate?.selector === "string"
          ? candidate.selector.trim()
          : "";

      const confidence =
        typeof candidate?.confidence === "number"
          ? candidate.confidence
          : Number.NaN;

      const validSelector =
        selector.length > 0 &&
        selector.length <= 500;

      const validConfidence =
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1;

      if (!validSelector) {
        reasons.push("INVALID_SELECTOR");
      }

      if (!validConfidence) {
        reasons.push("INVALID_CONFIDENCE");
      }

      if (candidate?.uniqueMatch !== true) {
        reasons.push("NOT_UNIQUE");
      }

      if (candidate?.visible !== true) {
        reasons.push("NOT_VISIBLE");
      }

      if (validSelector) {
        if (seenSelectors.has(selector)) {
          reasons.push("DUPLICATE_SELECTOR");
        } else {
          seenSelectors.add(selector);
        }
      }

      const eligible = reasons.length === 0;

      const score = eligible
        ? confidence * 100
        : 0;

      const result: AICandidateRankingResult = {
        selector,
        confidence,
        score,
        eligible,
        reasons,
        ...(options.includeInputIndex
          ? { inputIndex: index }
          : {}),
      };

      return {
        index,
        result,
      };
    });

    ranked.sort((a, b) => {
      if (a.result.eligible !== b.result.eligible) {
        return a.result.eligible ? -1 : 1;
      }

      const scoreDifference =
        b.result.score - a.result.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return a.index - b.index;
    });

    return ranked.map(({ result }) => result);
  }
}
