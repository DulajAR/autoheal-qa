
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
 * Phase 4.6 - Self-Healing Decision Engine Hardening
 *
 * Responsibilities:
 * - Validate candidate confidence.
 * - Restrict candidates to supported CSS selectors.
 * - Require exactly one matching element.
 * - Require the matching element to be visible.
 * - Reject sensitive or unsafe targets.
 * - Enforce a shared validation deadline.
 * - Fail closed when browser operations exceed the deadline.
 *
 * AI-generated locators are advisory only.
 * This validator never performs clicks or input actions.
 */
export class AILocatorValidator {
  constructor(private readonly page: Page) {}

  async validate(
    candidate: AILocatorCandidate,
    options: AILocatorValidationOptions = {}
  ): Promise<AILocatorValidationResult> {
    const minConfidence = options.minConfidence ?? 0.85;
    const timeoutMs = options.timeoutMs ?? 1000;

    // --------------------------------------------------
    // 1. Validate configuration
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 2. Controlled rejection response
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 3. Validate candidate selector
    // --------------------------------------------------

    if (
      typeof candidate?.selector !== "string" ||
      !candidate.selector.trim() ||
      candidate.selector.length > 500
    ) {
      return reject("INVALID_SELECTOR");
    }

    // --------------------------------------------------
    // 4. Validate confidence
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 5. Restrict unsupported selector syntax
    // --------------------------------------------------

    const selector = candidate.selector.trim();

    if (
      /^(xpath|text|role|id|data-testid)=/i.test(selector) ||
      /:has-text\(|:text\(|:visible\b/i.test(selector) ||
      /[{};]/.test(selector)
    ) {
      return reject("INVALID_SELECTOR");
    }

    // --------------------------------------------------
    // 6. Shared validation deadline
    // --------------------------------------------------

    const deadline = performance.now() + timeoutMs;

    /**
     * Returns the remaining validation budget.
     *
     * Throws when the deadline has expired.
     */
    const remainingTimeout = (): number => {
      const remaining = deadline - performance.now();

      if (remaining <= 0) {
        throw new Error("VALIDATION_DEADLINE_EXCEEDED");
      }

      return Math.max(1, Math.ceil(remaining));
    };

    // --------------------------------------------------
    // 7. Bounded browser operation helper
    // --------------------------------------------------

    /**
     * Runs an asynchronous browser operation within
     * the remaining validation budget.
     *
     * Important:
     * Promise.race limits how long the validator waits.
     * It does not cancel the underlying browser operation.
     *
     * Late results cannot be used to accept a candidate.
     */
    const runWithinDeadline = async <T>(
      operation: () => Promise<T>
    ): Promise<T> => {
      const remainingMs = remainingTimeout();

      let timer:
        | ReturnType<typeof setTimeout>
        | undefined;

      try {
        const result = await Promise.race([
          operation(),

          new Promise<never>((_, rejectTimeout) => {
            timer = setTimeout(() => {
              rejectTimeout(
                new Error("VALIDATION_DEADLINE_EXCEEDED")
              );
            }, remainingMs);
          }),
        ]);

        // Reject a result that completed after the deadline.
        remainingTimeout();

        return result;
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    };

    // --------------------------------------------------
    // 8. Browser validation
    // --------------------------------------------------

    try {
      const locator = this.page.locator(
        `css=${selector}`
      );

      remainingTimeout();

      // -----------------------------------------------
      // 8.1 Unique element validation
      // -----------------------------------------------

      const count = await runWithinDeadline(
        () => locator.count()
      );

      if (count === 0) {
        return reject("NO_MATCH");
      }

      if (count !== 1) {
        return reject("AMBIGUOUS_MATCH");
      }

      // -----------------------------------------------
      // 8.2 Visibility validation
      // -----------------------------------------------

      const visible = await runWithinDeadline(
        () =>
          locator.isVisible({
            timeout: remainingTimeout(),
          })
      );

      if (!visible) {
        return reject("NOT_VISIBLE");
      }

      // -----------------------------------------------
      // 8.3 Sensitive target validation
      // -----------------------------------------------

      const unsafeTarget = await runWithinDeadline(
        () =>
          locator.evaluate(
            (element) => {
              const tag =
                element.tagName.toLowerCase();

              const inputType =
                element
                  .getAttribute("type")
                  ?.toLowerCase();

              const insideHiddenContainer =
                element.closest(
                  '[hidden], [aria-hidden="true"], [inert]'
                ) !== null;

              const sensitiveInput =
                tag === "input" &&
                [
                  "password",
                  "hidden",
                  "file",
                ].includes(inputType ?? "");

              return (
                insideHiddenContainer ||
                sensitiveInput
              );
            },
            undefined,
            {
              timeout: remainingTimeout(),
            }
          )
      );

      if (unsafeTarget) {
        return reject("UNSAFE_TARGET");
      }

      // -----------------------------------------------
      // 8.4 Final deadline verification
      // -----------------------------------------------

      remainingTimeout();

      // Candidate passed all validation checks.
      return {
        valid: true,
        selector,
        confidence: candidate.confidence,
      };
    } catch (error: unknown) {
      // -----------------------------------------------
      // 9. Timeout classification
      // -----------------------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "VALIDATION_DEADLINE_EXCEEDED"
      ) {
        return reject("VALIDATION_TIMEOUT");
      }

      // Fail closed without exposing browser errors.
      return reject("INVALID_SELECTOR");
    }
  }
}
