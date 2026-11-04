import type { AIProvider } from "./AIProvider";
import { MockAIProvider } from "./MockAIProvider";

export type AIProviderType = "disabled" | "mock";

export function createAIProvider(
  providerType: AIProviderType
): AIProvider | null {
  switch (providerType) {
    case "disabled":
      return null;

    case "mock":
      return new MockAIProvider();

    default: {
      const unsupported: never = providerType;
      throw new Error(
        `Unsupported AI provider: ${unsupported}`
      );
    }
  }
}