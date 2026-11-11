
import type { Page } from "@playwright/test";

import type { AILocatorCandidate } from "./AIProvider";

import type {
  AILocatorValidationOptions,
  AILocatorValidationResult,
  AILocatorRejectionReason,
} from "./AILocatorValidationTypes";

/**
 * AutoHeal QA - AI Locator Validator
 *
 * Validates AI-generated locator candidates before
 * they can be considered eligible suggestions.
 *
 * Security and reliability:
 * - Validates confidence scores.
 * - Accepts CSS selectors only.
 * - Requires exactly one matching element.
 * - Requires the matching element to be visible.
 * - Rejects sensitive or unsafe targets.
 * - Enforces a shared validation deadline.
 * - Distinguishes deadline expiration from invalid selectors.
 *
 * This class does not click, fill, or otherwise interact
 * with the candidate element.
 */
export class AILocatorValidator {
  constructor(private readonly page: Page) {}

  async validate(
    candidate: AILocatorCandidate,
    options: AILocatorValidationOptions = {}
  ): Promise<AILocatorValidationResult> {
    const minConfidence = options.minConfidence ?? 0.85;
    const timeoutMs = options.timeoutMs ?? 1000;

    // Validate configuration.
    if (
      !Number.isFinite(minConfidence) ||
      minConfidence < 0 ||
      minConfidence > 1
    ) {
      throw new Error(
        "minConfidence must be between 0 and 1"
      );
    }

    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 10000
    ) {
      throw new Error(
        "timeoutMs must be an integer between 1 and 10000"
      );
    }

    // Build a controlled rejection result.
    const reject = (
      reason: AILocatorRejectionReason
    ): AILocatorValidationResult => ({
      valid: false,
      selector:
        typeof candidate?.selector === "string"
          ? candidate.selector
          : "",
      confidence: candidate?.confidence,
      reason,
    });

    // Validate candidate selector.
    if (
      typeof candidate?.selector !== "string" ||
      !candidate.selector.trim() ||
      candidate.selector.length > 500
    ) {
      return reject("INVALID_SELECTOR");
    }

    // Validate confidence.
    if (
      typeof candidate.confidence !== "number" ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    ) {
      return reject("INVALID_CONFIDENCE");
    }

    if (candidate.confidence < minConfidence) {
      return reject("LOW_CONFIDENCE");
    }

    const selector = candidate.selector.trim();

    // Restrict AI suggestions to supported CSS selectors.
    if (
      /^(xpath|text|role|id|data-testid)=/i.test(selector) ||
      /:has-text\(|:text\(|:visible\b/i.test(selector) ||
      /[{};]/.test(selector)
    ) {
      return reject("INVALID_SELECTOR");
    }

    // Shared deadline for all browser validation operations.
    const deadline = performance.now() + timeoutMs;

    const remainingTimeout = (): number => {
      const remaining = deadline - performance.now();

      if (remaining <= 0) {
        throw new Error("VALIDATION_DEADLINE_EXCEEDED");
      }

      return Math.max(1, Math.ceil(remaining));
    };

    try {
      const locator = this.page.locator(`css=${selector}`);

      remainingTimeout();

      // Candidate must match exactly one element.
      const count = await locator.count();

      remainingTimeout();

      if (count === 0) {
        return reject("NO_MATCH");
      }

      if (count !== 1) {
        return reject("AMBIGUOUS_MATCH");
      }

      // Candidate must be visible.
      const visible = await locator.isVisible({
        timeout: remainingTimeout(),
      });

      remainingTimeout();

      if (!visible) {
        return reject("NOT_VISIBLE");
      }

      // Reject sensitive or unsafe elements.
      const unsafeTarget = await locator.evaluate(
        (element) => {
          const tag = element.tagName.toLowerCase();

          const inputType =
            element.getAttribute("type")?.toLowerCase();

          return (
            element.closest(
              '[hidden], [aria-hidden="true"], [inert]'
            ) !== null ||
            (
              tag === "input" &&
              ["password", "hidden", "file"].includes(
                inputType ?? ""
              )
            )
          );
        },
        undefined,
        {
          timeout: remainingTimeout(),
        }
      );

      remainingTimeout();

      if (unsafeTarget) {
        return reject("UNSAFE_TARGET");
      }

      // Candidate passed all validation checks.
      return {
        valid: true,
        selector,
        confidence: candidate.confidence,
      };
    } catch (error: unknown) {
      // Classify expiration of the validator's deadline.
      if (
        error instanceof Error &&
        error.message === "VALIDATION_DEADLINE_EXCEEDED"
      ) {
        return reject("VALIDATION_TIMEOUT");
      }

      // Fail closed without exposing browser errors.
      return reject("INVALID_SELECTOR");
    }
  }
}
