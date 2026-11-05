
import type { Locator, Page } from "@playwright/test";

import { environment } from "../../config/environment";
import { Logger } from "./Logger";
import { HealingAudit } from "./HealingAudit";

import type { AIProvider } from "../ai/AIProvider";
import { AIRecoveryOrchestrator } from "../ai/AIRecoveryOrchestrator";
import { AIRecoveryAudit } from "../ai/AIRecoveryAudit";
import type { AIRecoveryOptions } from "../ai/AIRecoveryTypes";

export type LocatorStrategy = {
  name: string;
  selector: string;
  confidence: number;
};

export type HealingOptions = {
  timeoutMs?: number;
  minimumConfidence?: number;
  enabled?: boolean;
  aiRecovery?: AIRecoveryOptions;
};

export class SelfHealingLocator {
  private readonly aiRecovery: AIRecoveryOrchestrator;

  constructor(
    private readonly page: Page,
    aiProvider: AIProvider | null = null
  ) {
    this.aiRecovery = new AIRecoveryOrchestrator(
      page,
      aiProvider
    );
  }

  /**
   * Finds exactly one visible element.
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
   * Resolve a locator using:
   * 1. Primary selector
   * 2. Trusted deterministic fallbacks
   * 3. Optional advisory AI recovery
   *
   * AI suggestions are never executed automatically.
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
      options.enabled ??
      environment.selfHealingEnabled;

    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0
    ) {
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

    // STEP 1: Primary selector.
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

    // STEP 2: Respect self-healing configuration.
    if (!enabled) {
      const message =
        `Primary locator unavailable and self-healing disabled: ${primarySelector}`;

      Logger.error(message);
      throw new Error(message);
    }

    // STEP 3: Trusted fallback strategies.
    const candidates = [...alternatives]
      .filter(
        (strategy) =>
          Number.isFinite(strategy.confidence) &&
          strategy.confidence >= minimumConfidence &&
          strategy.confidence <= 1
      )
      .sort(
        (a, b) =>
          b.confidence - a.confidence
      );

    for (const candidate of candidates) {
      const recovered = await this.findUniqueVisible(
        candidate.selector,
        timeoutMs
      );

      if (!recovered) {
        continue;
      }

      HealingAudit.record({
        primarySelector,
        recoveredSelector: candidate.selector,
        strategy: candidate.name,
        confidence: candidate.confidence,
      });

      return recovered;
    }

    // STEP 4: Advisory AI recovery.
    if (options.aiRecovery?.enabled === true) {
      try {
        const result = await this.aiRecovery.suggest(
          primarySelector,
          options.aiRecovery
        );

        AIRecoveryAudit.record(result);
      } catch {
        Logger.warn("AI_RECOVERY_PIPELINE_ERROR");
      }
    }

    // STEP 5: Controlled failure.
    const message =
      `Self-healing failed for locator: ${primarySelector}`;

    Logger.error(message);

    throw new Error(message);
  }
}
