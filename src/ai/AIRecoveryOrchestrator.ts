
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
      const context = await this.extractor.extract({
        maxElements: 100,
        maxTextLength: 120,
      });

      const request = this.requestBuilder.build(
        primarySelector,
        context
      );

      let providerTimer:
        | ReturnType<typeof setTimeout>
        | undefined;

      let candidates: AILocatorCandidate[];

      try {
        candidates = await Promise.race([
          this.provider.suggestLocators(request),

          new Promise<never>((_, reject) => {
            providerTimer = setTimeout(
              () => reject(
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

      validationStartedAt = performance.now();

      const deadline =
        validationStartedAt + validationTimeoutMs;

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

      for (
        const [candidateIndex, candidate]
        of sortedCandidates.entries()
      ) {
        const remainingMs =
          deadline - performance.now();

        if (remainingMs <= 0) {
          markNotEvaluated(candidateIndex);

          return createResult(
            "FAILED",
            "VALIDATION_TIMEOUT"
          );
        }

        evaluatedCandidates++;

        const startedAt = performance.now();

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

          continue;
        }

        let validationTimer:
          | ReturnType<typeof setTimeout>
          | undefined;

        const timeoutMarker = Symbol(
          "VALIDATION_TIMEOUT"
        );

        try {
          const validationPromise =
            this.validator.validate(candidate, {
              minConfidence: minimumConfidence,

              timeoutMs: Math.max(
                1,
                Math.min(
                  1000,
                  Math.floor(remainingMs)
                )
              ),
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

          if (validation === timeoutMarker) {
            decisions.push({
              candidateIndex,
              decision: "REJECTED",
              reasons: ["VALIDATION_TIMEOUT"],
              validationDurationMs,
            });

            markNotEvaluated(candidateIndex + 1);

            return createResult(
              "FAILED",
              "VALIDATION_TIMEOUT"
            );
          }

          if (!validation.valid) {
            decisions.push({
              candidateIndex,
              decision: "REJECTED",
              reasons: [
                validation.reason ?? "INVALID_SELECTOR",
              ],
              validationDurationMs,
            });

            continue;
          }

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

      if (performance.now() >= deadline) {
        return createResult(
          "FAILED",
          "VALIDATION_TIMEOUT"
        );
      }

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

      const best = ranked.find(
        (candidate) => candidate.eligible
      );

      if (!best) {
        return createResult(
          "NO_CANDIDATE",
          "NO_VALID_CANDIDATE"
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
      return createResult(
        "FAILED",
        "RECOVERY_PIPELINE_FAILED"
      );
    }
  }
}
