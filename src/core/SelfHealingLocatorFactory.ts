
import type { Page } from "@playwright/test";

import {
  SelfHealingLocator,
} from "./SelfHealingLocator";

import {
  loadAIRuntimeConfig,
} from "../ai/AIRuntimeConfig";

import type {
  AIRuntimeConfig,
} from "../ai/AIRuntimeConfig";

import {
  createRuntimeAIProvider,
} from "../ai/AIRuntimeFactory";

import type {
  AIRuntimeFactoryOptions,
} from "../ai/AIRuntimeFactory";

export type SelfHealingRuntime = {
  locator: SelfHealingLocator;
  config: AIRuntimeConfig;
};

export function createSelfHealingRuntime(
  page: Page,
  env: NodeJS.ProcessEnv = process.env,
  options: AIRuntimeFactoryOptions = {}
): SelfHealingRuntime {
  const config = loadAIRuntimeConfig(env);

  const provider = createRuntimeAIProvider(
    config,
    options
  );

  return {
    locator: new SelfHealingLocator(page, provider),
    config,
  };
}
