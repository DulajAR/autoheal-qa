
import type { Locator, Page } from "@playwright/test";
import { environment } from "../../config/environment";
import { Logger } from "./Logger";
import { HealingAudit } from "./HealingAudit";

export type LocatorStrategy = {
  name: string;
  selector: string;
  confidence: number;
};

export type HealingOptions = {
  timeoutMs?: number;
  minimumConfidence?: number;
  enabled?: boolean;
};

export class SelfHealingLocator {
  constructor(private readonly page: Page) {}

  /**
   * Finds a locator that matches exactly one visible element.
   *
   * Returns null when:
   * - The element does not exist.
   * - The element is not visible.
   * - Multiple elements match the selector.
   * - The timeout expires.
   */
  private async findUniqueVisible(
    selector: string,
    timeoutMs: number
  ): Promise<Locator | null> {
    const locator = this.page.locator(selector);

    try {
      await locator.first().waitFor({
        state: "visible",
        timeout: timeoutMs,
      });

      const count = await locator.count();

      if (count !== 1) {
        return null;
      }

      if (!(await locator.isVisible())) {
        return null;
      }

      return locator;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the primary locator or attempts deterministic
   * self-healing using trusted fallback strategies.
   */
  async resolve(
    primarySelector: string,
    alternatives: LocatorStrategy[] = [],
    options: HealingOptions = {}
  ): Promise<Locator> {
    const timeoutMs = options.timeoutMs ?? 2000;

    const minimumConfidence =
      options.minimumConfidence ?? 0.85;

    const enabled =
      options.enabled ?? environment.selfHealingEnabled;

    // Validate configuration.
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        "timeoutMs must be a positive number"
      );
    }

    if (
      !Number.isFinite(minimumConfidence) ||
      minimumConfidence < 0 ||
      minimumConfidence > 1
    ) {
      throw new Error(
        "minimumConfidence must be between 0 and 1"
      );
    }

    // Step 1: Always attempt the primary locator first.
    const primary = await this.findUniqueVisible(
      primarySelector,
      timeoutMs
    );

    if (primary) {
      return primary;
    }

    Logger.warn(
      `Primary locator unavailable: ${primarySelector}`
    );

    // Step 2: Check whether self-healing is enabled.
    if (!enabled) {
      const message =
        `Primary locator unavailable and self-healing disabled: ${primarySelector}`;

      Logger.error(message);

      throw new Error(message);
    }

    // Step 3: Filter and prioritize trusted fallbacks.
    const candidates = [...alternatives]
      .filter(
        (strategy) =>
          Number.isFinite(strategy.confidence) &&
          strategy.confidence >= minimumConfidence &&
          strategy.confidence <= 1
      )
      .sort(
        (a, b) => b.confidence - a.confidence
      );

    // Step 4: Attempt recovery using fallback strategies.
    for (const candidate of candidates) {
      const recovered = await this.findUniqueVisible(
        candidate.selector,
        timeoutMs
      );

      if (!recovered) {
        continue;
      }

      // Step 5: Record the successful recovery.
      // HealingAudit handles the structured event,
      // logging, and Playwright test attachment.
      HealingAudit.record({
        primarySelector,
        recoveredSelector: candidate.selector,
        strategy: candidate.name,
        confidence: candidate.confidence,
      });

      return recovered;
    }

    // Step 6: Fail safely when recovery is unsuccessful.
    const message =
      `Self-healing failed for locator: ${primarySelector}`;

    Logger.error(message);

    throw new Error(message);
  }
}
