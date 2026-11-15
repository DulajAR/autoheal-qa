
import { test, expect } from "@playwright/test";

import { OpenAIProvider } from "../../src/ai/OpenAIProvider";
import { GeminiProvider } from "../../src/ai/GeminiProvider";

import type { ProductionAIConfig } from "../../src/ai/ProductionAIConfig";

const config: ProductionAIConfig = {
  apiKey: "test-key-not-real",
  model: "test-model",
  timeoutMs: 1000,
  maxOutputTokens: 300,
};

const request = {
  primarySelector: "#old-submit",
  domSnapshot: JSON.stringify({
    url: "https://example.test",
    elements: [
      {
        tagName: "button",
        id: "new-submit",
      },
    ],
    totalElements: 1,
    truncated: false,
  }),
};

type ProviderName = "openai" | "gemini";

function createProvider(
  name: ProviderName,
  fetchImpl: typeof fetch
) {
  const options = {
    allowExternalRequests: true,
    fetchImpl,
  };

  return name === "openai"
    ? new OpenAIProvider(config, options)
    : new GeminiProvider(config, options);
}

function successResponse(name: ProviderName): Response {
  const candidates = [
    {
      selector: "#new-submit",
      confidence: 0.95,
    },
  ];

  const body =
    name === "openai"
      ? {
          choices: [
            {
              message: {
                content: JSON.stringify({ candidates }),
              },
            },
          ],
        }
      : {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({ candidates }),
                  },
                ],
              },
            },
          ],
        };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function abortableFetch(
  onStart?: (signal: AbortSignal) => void
): typeof fetch {
  return async (_input, init) => {
    const signal = init?.signal;

    if (!signal) {
      throw new Error("MISSING_FETCH_SIGNAL");
    }

    onStart?.(signal);

    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("FETCH_ABORTED"));
        return;
      }

      signal.addEventListener(
        "abort",
        () => reject(new Error("FETCH_ABORTED")),
        { once: true }
      );
    });
  };
}

function startedSignal() {
  let notify!: (signal: AbortSignal) => void;

  const started = new Promise<AbortSignal>(resolve => {
    notify = resolve;
  });

  return { started, notify };
}

test.describe("Phase 4.8 - Provider Cancellation Propagation", () => {
  test("PCP-001: OpenAI pre-aborted request", async () => {
    let calls = 0;

    const provider = createProvider("openai", async () => {
      calls++;
      return successResponse("openai");
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.suggestLocators(request, controller.signal)
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");

    expect(calls).toBe(0);
  });

  test("PCP-002: Gemini pre-aborted request", async () => {
    let calls = 0;

    const provider = createProvider("gemini", async () => {
      calls++;
      return successResponse("gemini");
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.suggestLocators(request, controller.signal)
    ).rejects.toThrow("GEMINI_PROVIDER_FAILED");

    expect(calls).toBe(0);
  });

  test("PCP-003: OpenAI active network cancellation", async () => {
    const tracker = startedSignal();

    const provider = createProvider(
      "openai",
      abortableFetch(tracker.notify)
    );

    const controller = new AbortController();

    const pending = provider.suggestLocators(
      request,
      controller.signal
    );

    const fetchSignal = await tracker.started;

    expect(fetchSignal.aborted).toBe(false);

    controller.abort();

    await expect(pending).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );

    expect(fetchSignal.aborted).toBe(true);
  });

  test("PCP-004: Gemini active network cancellation", async () => {
    const tracker = startedSignal();

    const provider = createProvider(
      "gemini",
      abortableFetch(tracker.notify)
    );

    const controller = new AbortController();

    const pending = provider.suggestLocators(
      request,
      controller.signal
    );

    const fetchSignal = await tracker.started;

    controller.abort();

    await expect(pending).rejects.toThrow(
      "GEMINI_PROVIDER_FAILED"
    );

    expect(fetchSignal.aborted).toBe(true);
  });

  test("PCP-005: cancellation prevents additional requests", async () => {
    let calls = 0;
    const tracker = startedSignal();

    const provider = createProvider(
      "openai",
      abortableFetch(signal => {
        calls++;
        tracker.notify(signal);
      })
    );

    const controller = new AbortController();

    const pending = provider.suggestLocators(
      request,
      controller.signal
    );

    await tracker.started;

    controller.abort();

    await expect(pending).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );

    expect(calls).toBe(1);
  });

  test("PCP-006: concurrent requests remain isolated", async () => {
    const tracker = startedSignal();

    const provider = createProvider(
      "openai",
      async (_input, init) => {
        const signal = init?.signal;

        if (!signal) {
          throw new Error("MISSING_FETCH_SIGNAL");
        }

        // First invocation remains pending.
        if (!firstStarted) {
          firstStarted = true;
          tracker.notify(signal);

          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("FETCH_ABORTED")),
              { once: true }
            );
          });
        }

        return successResponse("openai");
      }
    );

    let firstStarted = false;

    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = provider.suggestLocators(
      request,
      firstController.signal
    );

    await tracker.started;

    const second = provider.suggestLocators(
      request,
      secondController.signal
    );

    firstController.abort();

    await expect(first).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );

    const secondResult = await second;

    expect(secondController.signal.aborted).toBe(false);
    expect(secondResult).toHaveLength(1);
    expect(secondResult[0].selector).toBe("#new-submit");
  });

  test("PCP-007: late response cannot override cancellation", async () => {
    let resolveFetch!: (response: Response) => void;

    const tracker = startedSignal();

    const provider = createProvider(
      "openai",
      async (_input, init) => {
        const signal = init?.signal;

        if (!signal) {
          throw new Error("MISSING_FETCH_SIGNAL");
        }

        tracker.notify(signal);

        return new Promise<Response>(resolve => {
          resolveFetch = resolve;
        });
      }
    );

    const controller = new AbortController();

    const pending = provider.suggestLocators(
      request,
      controller.signal
    );

    await tracker.started;

    controller.abort();

    await expect(pending).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );

    resolveFetch(successResponse("openai"));

    // The settled provider promise must remain rejected.
    await expect(pending).rejects.toThrow(
      "OPENAI_PROVIDER_FAILED"
    );
  });

  test("PCP-008: successful request ignores later abort", async () => {
    const provider = createProvider(
      "openai",
      async () => successResponse("openai")
    );

    const controller = new AbortController();

    const result = await provider.suggestLocators(
      request,
      controller.signal
    );

    expect(result).toHaveLength(1);

    controller.abort();

    expect(result[0].selector).toBe("#new-submit");
    expect(result[0].confidence).toBe(0.95);
  });
});
