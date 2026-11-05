
import type {
  Locator,
  Page,
} from "@playwright/test";

import type {
  AIProvider,
} from "../ai/AIProvider";

import type {
  AIRuntimeConfig,
} from "../ai/AIRuntimeConfig";

import {
  SelfHealingLocator,
} from "./SelfHealingLocator";

import type {
  HealingOptions,
  LocatorStrategy,
} from "./SelfHealingLocator";

/**
 * Applies runtime AI policy to every locator resolution.
 *
 * A caller may opt out of AI recovery, but cannot
 * override a runtime configuration that disables it.
 */
export class PolicyEnforcedSelfHealingLocator
  extends SelfHealingLocator {
  constructor(
    page: Page,
    provider: AIProvider | null,
    private readonly runtimeConfig: AIRuntimeConfig
  ) {
    super(page, provider);
  }

  override async resolve(
    primarySelector: string,
    alternatives: LocatorStrategy[] = [],
    options: HealingOptions = {}
  ): Promise<Locator> {
    const runtimeAllowsAI =
      this.runtimeConfig.recoveryEnabled &&
      this.runtimeConfig.provider !== "disabled";

    // Both runtime policy and caller must enable AI.
    const aiEnabled =
      runtimeAllowsAI &&
      options.aiRecovery?.enabled === true;

    const enforcedOptions: HealingOptions = {
      ...options,

      // Preserve the caller's deterministic
      // self-healing preference.
      enabled: options.enabled,

      aiRecovery: {
        ...options.aiRecovery,
        enabled: aiEnabled,
      },
    };

    return super.resolve(
      primarySelector,
      alternatives,
      enforcedOptions
    );
  }
}
