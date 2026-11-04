
import type { Page } from "@playwright/test";

import type {
  AIProvider,
  AILocatorCandidate,
} from "./AIProvider";

import { DOMContextExtractor } from "./DOMContextExtractor";
import { AIRequestBuilder } from "./AIRequestBuilder";
import { AILocatorValidator } from "./AILocatorValidator";

import type {
  AIRecoveryOptions,
  AIRecoveryResult,
} from "./AIRecoveryTypes";

/**
 * Coordinates mock AI-assisted locator recovery.
 *
 * Phase 3.5:
 * - Advisory suggestions only
 * - No automatic element interactions
 * - No external AI providers
 * - Disabled by default
 * - Fail-closed error handling
 */
export class AIRecoveryOrchestrator {
  private readonly extractor: DOMContextExtractor;
  private readonly requestBuilder = new AIRequestBuilder();
  private readonly validator: AILocatorValidator;

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

    // Validate configuration.
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

    // AI recovery is explicitly opt-in.
    if (!enabled || !this.provider) {
      return createResult("DISABLED");
    }

    // Phase 3.5 allows only trusted local mock providers.
    // Provider name is not a security authentication mechanism.
    if (providerName !== "mock") {
      return createResult(
        "DISABLED",
        "PROVIDER_NOT_ALLOWED"
      );
    }

    let evaluatedCandidates = 0;

    try {
      // Step 1: Extract a bounded DOM context.
      const context = await this.extractor.extract({
        maxElements: 100,
        maxTextLength: 120,
      });

      // Step 2: Sanitize the context and build
      // a size-limited request.
      const request = this.requestBuilder.build(
        primarySelector,
        context
      );

      // Step 3: Obtain suggestions from the mock provider.
      let timeoutHandle:
        | ReturnType<typeof setTimeout>
        | undefined;

      let candidates: AILocatorCandidate[];

      try {
        candidates = await Promise.race([
          this.provider.suggestLocators(request),

          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(
                new Error("PROVIDER_TIMEOUT")
              );
            }, providerTimeoutMs);
          }),
        ]);
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
      }

      // Step 4: Validate the provider response.
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

      // Limit the number of candidates evaluated.
      const boundedCandidates =
        candidates.slice(0, maxCandidates);

      // Evaluate higher-confidence candidates first.
      const sortedCandidates = [
        ...boundedCandidates,
      ].sort((a, b) => {
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

      // Step 5: Validate each suggested selector.
      for (const candidate of sortedCandidates) {
        evaluatedCandidates++;

        if (
          !candidate ||
          typeof candidate.selector !== "string" ||
          typeof candidate.confidence !== "number"
        ) {
          continue;
        }

        const validation =
          await this.validator.validate(
            candidate,
            {
              minConfidence: minimumConfidence,
              timeoutMs: 1000,
            }
          );

        if (!validation.valid) {
          continue;
        }

        // Advisory result only.
        // Do not click, fill, or automatically use
        // this selector.
        return {
          status: "SUGGESTED",
          provider: providerName,
          primarySelector,
          suggestedSelector: validation.selector,
          confidence: validation.confidence,
          evaluatedCandidates,
        };
      }

      return createResult(
        "NO_CANDIDATE",
        "NO_VALID_CANDIDATE",
        evaluatedCandidates
      );
    } catch {
      // Never expose raw DOM snapshots,
      // provider errors, or request payloads.
      return createResult(
        "FAILED",
        "RECOVERY_PIPELINE_FAILED",
        evaluatedCandidates
      );
    }
  }
}
