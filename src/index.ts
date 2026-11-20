
/**
 * AutoHeal QA
 * Public framework API
 */

export {
  createSelfHealingRuntime,
} from "./core/SelfHealingLocatorFactory";

export type {
  SelfHealingRuntime,
} from "./core/SelfHealingLocatorFactory";

export {
  loadAIRuntimeConfig,
} from "./ai/AIRuntimeConfig";

export type {
  AIRuntimeConfig,
  AIRuntimeEnvironment,
} from "./ai/AIRuntimeConfig";

export type {
  AIRuntimeFactoryOptions,
} from "./ai/AIRuntimeFactory";

export {
  PolicyEnforcedSelfHealingLocator,
} from "./core/PolicyEnforcedSelfHealingLocator";

export {
  SelfHealingLocator,
} from "./core/SelfHealingLocator";

export type {
  HealingOptions,
  LocatorStrategy,
} from "./core/SelfHealingLocator";
