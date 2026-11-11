
import type { Page } from "@playwright/test";

import type {
  AIProvider,
  AILocatorCandidate,
} from "./AIProvider";

import { DOMContextExtractor } from "./DOMContextExtractor";
import { AIRequestBuilder } from "./AIRequestBuilder";
import { AILocatorValidator } from "./AILocatorValidator";
import { AICandidateRanker } from "./AICandidateRanker";

import type {
  AICandidateRankingInput,
} from "./AICandidateRankingTypes";

import type {
  AICandidateDecisionRecord,
  AIRecoveryExplanation,
} from "./AIRecoveryExplainabilityTypes";

import {
  isAuthorizedProductionProvider,
} from "./AIProviderFactory";

import type {
  AIRecoveryOptions,
  AIRecoveryResult,
} from "./AIRecoveryTypes";

/**
 * AutoHeal QA - AI Recovery Orchestrator
 *
 * Phase 4.6 - Step 3
 *
 * Responsibilities:
 * - Enforce provider authorization.
 * - Extract controlled DOM context.
 * - Request advisory AI locator candidates.
 * - Enforce provider timeout independently.
 * - Validate candidates within an overall deadline.
 * - Distinguish candidate and recovery timeouts.
 * - Preserve structured decision explanations.
 * - Prevent late results from producing suggestions.
 *
 * AI suggestions are advisory only.
 * This class never executes recovered locators.
 */
export class AIRecoveryOrchestrator {
  private readonly extractor: DOMContextExtractor;

  private readonly requestBuilder =
    new AIRequestBuilder();

  private readonly validator: AILocatorValidator;

  private readonly ranker =
    new AICandidateRanker();

  constructor(
    page: Page,
    private readonly provider: AIProvider | null
  ) {
    this.extractor = new DOMContextExtractor(page);
    this.validator = new AILocatorValidator(page);
  }

  async suggest(
    primarySelector: string,
    options: AIRecoveryOptions = {}
  ): Promise<AIRecoveryResult> {
    const enabled = options.enabled ?? false;

    const minimumConfidence =
      options.minimumConfidence ?? 0.85;

    const providerTimeoutMs =
      options.providerTimeoutMs ?? 3000;

    const maxCandidates =
      options.maxCandidates ?? 5;

    const validationTimeoutMs =
      options.validationTimeoutMs ?? 3000;

    // -----------------------------------------------
    // 1. Validate configuration
    // -----------------------------------------------

    if (
      !Number.isFinite(minimumConfidence) ||
      minimumConfidence < 0 ||
      minimumConfidence > 1
    ) {
      throw new Error(
        "minimumConfidence must be between 0 and 1"
      );
    }

    if (
      !Number.isSafeInteger(providerTimeoutMs) ||
      providerTimeoutMs < 1 ||
      providerTimeoutMs > 10000
    ) {
      throw new Error(
        "providerTimeoutMs must be an integer between 1 and 10000"
      );
    }

    if (
      !Number.isSafeInteger(maxCandidates) ||
      maxCandidates < 1 ||
      maxCandidates > 10
    ) {
      throw new Error(
        "maxCandidates must be an integer between 1 and 10"
      );
    }

    if (
      !Number.isSafeInteger(validationTimeoutMs) ||
      validationTimeoutMs < 1 ||
      validationTimeoutMs > 10000
    ) {
      throw new Error(
        "validationTimeoutMs must be an integer between 1 and 10000"
      );
    }

    // -----------------------------------------------
    // 2. Recovery state and explainability
    // -----------------------------------------------

    const providerName =
      this.provider?.name ?? "disabled";

    let evaluatedCandidates = 0;

    const decisions: AICandidateDecisionRecord[] = [];

    let validationStartedAt: number | undefined;

    const buildExplanation = (): AIRecoveryExplanation => ({
      evaluatedCandidates,

      acceptedCandidates: decisions.filter(
        (record) => record.decision === "ACCEPTED"
      ).length,

      rejectedCandidates: decisions.filter(
        (record) => record.decision === "REJECTED"
      ).length,

      validationDurationMs:
        validationStartedAt === undefined
          ? 0
          : Math.max(
              0,
              performance.now() - validationStartedAt
            ),

      decisions: decisions.map((record) => ({
        candidateIndex: record.candidateIndex,
        decision: record.decision,
        reasons: [...record.reasons],
        ...(record.validationDurationMs !== undefined
          ? {
              validationDurationMs:
                record.validationDurationMs,
            }
          : {}),
      })),
    });

    const createResult = (
      status: AIRecoveryResult["status"],
      reason?: string
    ): AIRecoveryResult => ({
      status,
      provider: providerName,
      primarySelector,
      evaluatedCandidates,
      ...(reason ? { reason } : {}),
      explanation: buildExplanation(),
    });

    // -----------------------------------------------
    // 3. Feature and provider authorization
    // -----------------------------------------------

    if (!enabled || !this.provider) {
      return createResult("DISABLED");
    }

    const authorized =
      providerName === "mock" ||
      isAuthorizedProductionProvider(this.provider);

    if (!authorized) {
      return createResult(
        "DISABLED",
        "PROVIDER_NOT_ALLOWED"
      );
    }

    try {
      // ---------------------------------------------
      // 4. Extract controlled DOM context
      // ---------------------------------------------

      const context = await this.extractor.extract({
        maxElements: 100,
        maxTextLength: 120,
      });

      const request = this.requestBuilder.build(
        primarySelector,
        context
      );

      // ---------------------------------------------
      // 5. Provider timeout protection
      // ---------------------------------------------

      let providerTimer:
        | ReturnType<typeof setTimeout>
        | undefined;

      let candidates: AILocatorCandidate[];

      try {
        candidates = await Promise.race([
          this.provider.suggestLocators(request),

          new Promise<never>((_, reject) => {
            providerTimer = setTimeout(
              () =>
                reject(
                  new Error("PROVIDER_TIMEOUT")
                ),
              providerTimeoutMs
            );
          }),
        ]);
      } finally {
        if (providerTimer !== undefined) {
          clearTimeout(providerTimer);
        }
      }

      if (!Array.isArray(candidates)) {
        return createResult(
          "FAILED",
          "INVALID_PROVIDER_RESPONSE"
        );
      }

      if (candidates.length === 0) {
        return createResult(
          "NO_CANDIDATE",
          "NO_CANDIDATES_RETURNED"
        );
      }

      // ---------------------------------------------
      // 6. Sort candidates by confidence
      // ---------------------------------------------

      const sortedCandidates = candidates
        .slice(0, maxCandidates)
        .sort((a, b) => {
          const left =
            typeof a?.confidence === "number" &&
            Number.isFinite(a.confidence)
              ? a.confidence
              : -1;

          const right =
            typeof b?.confidence === "number" &&
            Number.isFinite(b.confidence)
              ? b.confidence
              : -1;

          return right - left;
        });

      const validatedInputs:
        AICandidateRankingInput[] = [];

      const validatedDecisionIndices: number[] = [];

      // ---------------------------------------------
      // 7. Shared recovery validation deadline
      // ---------------------------------------------

      validationStartedAt = performance.now();

      const deadline =
        validationStartedAt + validationTimeoutMs;

      const remainingBudget = (): number =>
        deadline - performance.now();

      const hasExpired = (): boolean =>
        remainingBudget() <= 0;

      /**
       * Record candidates that were not evaluated
       * because the overall budget expired.
       */
      const markNotEvaluated = (
        fromIndex: number
      ): void => {
        for (
          let index = fromIndex;
          index < sortedCandidates.length;
          index++
        ) {
          decisions.push({
            candidateIndex: index,
            decision: "NOT_EVALUATED",
            reasons: ["VALIDATION_TIMEOUT"],
          });
        }
      };

      /**
       * Produce a fail-closed recovery timeout result.
       */
      const recoveryTimedOut = (
        nextCandidateIndex: number
      ): AIRecoveryResult => {
        markNotEvaluated(nextCandidateIndex);

        return createResult(
          "FAILED",
          "VALIDATION_TIMEOUT"
        );
      };

      // ---------------------------------------------
      // 8. Candidate validation loop
      // ---------------------------------------------

      for (
        const [candidateIndex, candidate]
        of sortedCandidates.entries()
      ) {
        const remainingMs = remainingBudget();

        if (remainingMs <= 0) {
          return recoveryTimedOut(candidateIndex);
        }

        evaluatedCandidates++;

        const startedAt = performance.now();

        // -------------------------------------------
        // 8.1 Malformed candidate handling
        // -------------------------------------------

        if (
          !candidate ||
          typeof candidate.selector !== "string" ||
          typeof candidate.confidence !== "number"
        ) {
          decisions.push({
            candidateIndex,
            decision: "REJECTED",
            reasons: ["MALFORMED_CANDIDATE"],
            validationDurationMs:
              performance.now() - startedAt,
          });

          if (hasExpired()) {
            return recoveryTimedOut(
              candidateIndex + 1
            );
          }

          continue;
        }

        // -------------------------------------------
        // 8.2 Independent recovery timeout guard
        // -------------------------------------------

        let validationTimer:
          | ReturnType<typeof setTimeout>
          | undefined;

        const timeoutMarker = Symbol(
          "VALIDATION_TIMEOUT"
        );

        try {
          /**
           * The validator receives its own bounded
           * candidate-level timeout.
           *
           * The outer race protects the entire
           * remaining recovery validation budget.
           */
          const candidateTimeoutMs = Math.max(
            1,
            Math.min(
              1000,
              Math.floor(remainingMs)
            )
          );

          const validationPromise =
            this.validator.validate(candidate, {
              minConfidence: minimumConfidence,
              timeoutMs: candidateTimeoutMs,
            });

          const validation = await Promise.race([
            validationPromise,

            new Promise<typeof timeoutMarker>(
              (resolve) => {
                validationTimer = setTimeout(
                  () => resolve(timeoutMarker),
                  Math.max(
                    1,
                    Math.ceil(remainingMs)
                  )
                );
              }
            ),
          ]);

          const validationDurationMs =
            performance.now() - startedAt;

          // -----------------------------------------
          // 8.3 Overall recovery timeout
          // -----------------------------------------

          if (
            validation === timeoutMarker ||
            hasExpired()
          ) {
            decisions.push({
              candidateIndex,
              decision: "REJECTED",
              reasons: ["VALIDATION_TIMEOUT"],
              validationDurationMs,
            });

            return recoveryTimedOut(
              candidateIndex + 1
            );
          }

          // -----------------------------------------
          // 8.4 Candidate rejection
          // -----------------------------------------

          if (!validation.valid) {
            decisions.push({
              candidateIndex,
              decision: "REJECTED",
              reasons: [
                validation.reason ?? "INVALID_SELECTOR",
              ],
              validationDurationMs,
            });

            /**
             * A candidate-level timeout does not
             * automatically exhaust the overall
             * recovery budget.
             *
             * Continue only if time remains.
             */
            continue;
          }

          // -----------------------------------------
          // 8.5 Candidate acceptance
          // -----------------------------------------

          decisions.push({
            candidateIndex,
            decision: "ACCEPTED",
            reasons: [],
            validationDurationMs,
          });

          validatedDecisionIndices.push(
            decisions.length - 1
          );

          validatedInputs.push({
            selector: validation.selector,
            confidence: validation.confidence,
            uniqueMatch: true,
            visible: true,
          });
        } finally {
          if (validationTimer !== undefined) {
            clearTimeout(validationTimer);
          }
        }
      }

      // ---------------------------------------------
      // 9. Prevent ranking after deadline
      // ---------------------------------------------

      if (hasExpired()) {
        return createResult(
          "FAILED",
          "VALIDATION_TIMEOUT"
        );
      }

      // ---------------------------------------------
      // 10. Rank validated candidates
      // ---------------------------------------------

      const ranked = this.ranker.rank(
        validatedInputs,
        { includeInputIndex: true }
      );

      for (const candidate of ranked) {
        if (candidate.inputIndex === undefined) {
          continue;
        }

        const decisionIndex =
          validatedDecisionIndices[
            candidate.inputIndex
          ];

        const decision =
          decisions[decisionIndex];

        if (!decision) {
          continue;
        }

        if (!candidate.eligible) {
          decision.decision = "REJECTED";
          decision.reasons = [
            ...candidate.reasons,
          ];
        }
      }

      // ---------------------------------------------
      // 11. Final deadline verification
      // ---------------------------------------------

      if (hasExpired()) {
        return createResult(
          "FAILED",
          "VALIDATION_TIMEOUT"
        );
      }

      const best = ranked.find(
        (candidate) => candidate.eligible
      );

      if (!best) {
        return createResult(
          "NO_CANDIDATE",
          "NO_VALID_CANDIDATE"
        );
      }

      // ---------------------------------------------
      // 12. Advisory suggestion only
      // ---------------------------------------------

      if (hasExpired()) {
        return createResult(
          "FAILED",
          "VALIDATION_TIMEOUT"
        );
      }

      return {
        status: "SUGGESTED",
        provider: providerName,
        primarySelector,
        suggestedSelector: best.selector,
        confidence: best.confidence,
        evaluatedCandidates,
        explanation: buildExplanation(),
      };
    } catch {
      // Preserve existing generic pipeline failure
      // behavior without exposing provider errors.
      return createResult(
        "FAILED",
        "RECOVERY_PIPELINE_FAILED"
      );
    }
  }
}
