import { test, expect } from "@playwright/test";

import { MockAIProvider } from "../../src/ai/MockAIProvider";
import { createAIProvider } from "../../src/ai/AIProviderFactory";

test.describe("AI Provider Core", () => {
  test("AI-001: disabled provider returns null", () => {
    expect(createAIProvider("disabled")).toBeNull();
  });

  test("AI-002: mock provider can be created", () => {
    const provider = createAIProvider("mock");

    expect(provider).toBeInstanceOf(MockAIProvider);
    expect(provider?.name).toBe("mock");
  });

  test("AI-003: mock provider returns suggestions", async () => {
    const provider = new MockAIProvider([
      {
        selector: '[data-testid="submit"]',
        confidence: 0.95,
        reasoning: "Configured mock candidate",
      },
    ]);

    const results = await provider.suggestLocators({
      primarySelector: "#old-submit",
      domSnapshot: '<button data-testid="submit">Submit</button>',
    });

    expect(results).toHaveLength(1);
    expect(results[0].selector).toBe(
      '[data-testid="submit"]'
    );
    expect(results[0].confidence).toBe(0.95);
  });

  test("AI-004: mock provider returns empty results", async () => {
    const provider = new MockAIProvider();

    const results = await provider.suggestLocators({
      primarySelector: "#missing",
      domSnapshot: "<main></main>",
    });

    expect(results).toEqual([]);
  });

  test("AI-005: mock results are independent copies", async () => {
    const provider = new MockAIProvider([
      {
        selector: "#original",
        confidence: 0.9,
      },
    ]);

    const request = {
      primarySelector: "#missing",
      domSnapshot: "<main></main>",
    };

    const first = await provider.suggestLocators(request);
    first[0].selector = "#modified";

    const second = await provider.suggestLocators(request);

    expect(second[0].selector).toBe("#original");
  });
});