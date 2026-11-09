
import type { Page } from "@playwright/test";

import type { AILocatorCandidate } from "./AIProvider";

import type {
  AILocatorValidationOptions,
  AILocatorValidationResult,
  AILocatorRejectionReason,
} from "./AILocatorValidationTypes";

export class AILocatorValidator {
  constructor(private readonly page: Page) {}

  async validate(
    candidate: AILocatorCandidate,
    options: AILocatorValidationOptions = {}
  ): Promise<AILocatorValidationResult> {
    const minConfidence = options.minConfidence ?? 0.85;
    const timeoutMs = options.timeoutMs ?? 1000;

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

    if (
      typeof candidate?.selector !== "string" ||
      !candidate.selector.trim() ||
      candidate.selector.length > 500
    ) {
      return reject("INVALID_SELECTOR");
    }

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

      const count = await locator.count();

      remainingTimeout();

      if (count === 0) {
        return reject("NO_MATCH");
      }

      if (count !== 1) {
        return reject("AMBIGUOUS_MATCH");
      }

      const visible = await locator.isVisible({
        timeout: remainingTimeout(),
      });

      remainingTimeout();

      if (!visible) {
        return reject("NOT_VISIBLE");
      }

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

      return {
        valid: true,
        selector,
        confidence: candidate.confidence,
      };
    } catch {
      // Fail closed without exposing browser errors.
      return reject("INVALID_SELECTOR");
    }
  }
}
