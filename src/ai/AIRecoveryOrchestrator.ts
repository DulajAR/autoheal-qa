
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
  private readonly ranker = new AICandidateRanker();

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

    const createResult = (
      status: AIRecoveryResult["status"],
      reason?: string,
      evaluatedCandidates = 0
    ): AIRecoveryResult => ({
      status,
      provider: providerName,
      primarySelector,
      evaluatedCandidates,
      ...(reason ? { reason } : {}),
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

    let evaluatedCandidates = 0;

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
              () => reject(new Error("PROVIDER_TIMEOUT")),
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

      const deadline =
        performance.now() + validationTimeoutMs;

      for (const candidate of sortedCandidates) {
        const remainingMs =
          deadline - performance.now();

        if (remainingMs <= 0) {
          return createResult(
            "FAILED",
            "VALIDATION_TIMEOUT",
            evaluatedCandidates
          );
        }

        evaluatedCandidates++;

        if (
          !candidate ||
          typeof candidate.selector !== "string" ||
          typeof candidate.confidence !== "number"
        ) {
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
                Math.min(1000, Math.floor(remainingMs))
              ),
            });

          const validation = await Promise.race([
            validationPromise,
            new Promise<typeof timeoutMarker>(
              (resolve) => {
                validationTimer = setTimeout(
                  () => resolve(timeoutMarker),
                  Math.max(1, Math.ceil(remainingMs))
                );
              }
            ),
          ]);

          if (validation === timeoutMarker) {
            return createResult(
              "FAILED",
              "VALIDATION_TIMEOUT",
              evaluatedCandidates
            );
          }

          if (!validation.valid) {
            continue;
          }

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
          "VALIDATION_TIMEOUT",
          evaluatedCandidates
        );
      }

      const ranked = this.ranker.rank(
        validatedInputs
      );

      const best = ranked.find(
        (candidate) => candidate.eligible
      );

      if (!best) {
        return createResult(
          "NO_CANDIDATE",
          "NO_VALID_CANDIDATE",
          evaluatedCandidates
        );
      }

      return {
        status: "SUGGESTED",
        provider: providerName,
        primarySelector,
        suggestedSelector: best.selector,
        confidence: best.confidence,
        evaluatedCandidates,
      };
    } catch {
      return createResult(
        "FAILED",
        "RECOVERY_PIPELINE_FAILED",
        evaluatedCandidates
      );
    }
  }
}
