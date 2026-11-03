
import type { Locator, Page } from "@playwright/test";
import { environment } from "../../config/environment";
import { Logger } from "./Logger";

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

      if ((await locator.count()) !== 1) {
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

  async resolve(
    primarySelector: string,
    alternatives: LocatorStrategy[],
    options: HealingOptions = {}
  ): Promise<Locator> {
    const timeoutMs = options.timeoutMs ?? 2000;
    const minimumConfidence =
      options.minimumConfidence ?? 0.85;

    const enabled =
      options.enabled ?? environment.selfHealingEnabled;

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

    if (!enabled) {
      const message =
        `Primary locator unavailable and self-healing disabled: ${primarySelector}`;

      Logger.error(message);
      throw new Error(message);
    }

    const candidates = [...alternatives]
      .filter(
        (strategy) =>
          Number.isFinite(strategy.confidence) &&
          strategy.confidence >= minimumConfidence &&
          strategy.confidence <= 1
      )
      .sort((a, b) => b.confidence - a.confidence);

    for (const candidate of candidates) {
      const recovered = await this.findUniqueVisible(
        candidate.selector,
        timeoutMs
      );

      if (recovered) {
        Logger.warn(
          JSON.stringify({
            event: "LOCATOR_HEALED",
            primarySelector,
            recoveredSelector: candidate.selector,
            strategy: candidate.name,
            confidence: candidate.confidence,
          })
        );

        return recovered;
      }
    }

    const message =
      `Self-healing failed for locator: ${primarySelector}`;

    Logger.error(message);
    throw new Error(message);
  }
}
