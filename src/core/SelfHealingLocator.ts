
import type { Locator, Page } from "@playwright/test";
import { Logger } from "./Logger";

export type LocatorStrategy = {
  name: string;
  selector: string;
  confidence: number;
};

export type HealingOptions = {
  timeoutMs?: number;
  minimumConfidence?: number;
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

  async resolve(
    primarySelector: string,
    alternatives: LocatorStrategy[],
    options: HealingOptions = {}
  ): Promise<Locator> {
    const timeoutMs = options.timeoutMs ?? 2000;
    const minimumConfidence =
      options.minimumConfidence ?? 0.85;

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

    const candidates = [...alternatives]
      .filter(
        (strategy) =>
          strategy.confidence >= minimumConfidence
      )
      .sort(
        (a, b) => b.confidence - a.confidence
      );

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
