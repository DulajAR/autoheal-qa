
test.describe("OpenAI Provider hardening", () => {
  test("OAI-005: does not mutate the original request", async () => {
    const original = {
      ...request,
      domSnapshot: request.domSnapshot,
    };

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const transmitted = JSON.parse(
          body.messages[1].content
        );
        const snapshot = JSON.parse(
          transmitted.domSnapshot
        );

        expect(snapshot.url).toBeUndefined();
        expect(snapshot.elements[0].id).toBe(
          "new-submit"
        );

        return new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  candidates: [],
                }),
              },
            }],
          })
        );
      },
    });

    await provider.suggestLocators(original);

    expect(original.domSnapshot).toBe(
      request.domSnapshot
    );
  });

  test("OAI-006: rejects arbitrary DOM text", async () => {
    let calls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
    });

    const unsafe = {
      ...request,
      domSnapshot: JSON.stringify({
        url: "https://example.test",
        elements: [{
          tagName: "button",
          id: "new-submit",
          text: "Private customer information",
        }],
        totalElements: 1,
        truncated: false,
      }),
    };

    await expect(
      provider.suggestLocators(unsafe)
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(calls).toBe(0);
  });

  test("OAI-007: rejects sensitive identifiers", async () => {
    let calls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
    });

    const unsafe = {
      ...request,
      domSnapshot: JSON.stringify({
        url: "https://example.test",
        elements: [{
          tagName: "button",
          id: "sessionToken",
        }],
        totalElements: 1,
        truncated: false,
      }),
    };

    await expect(
      provider.suggestLocators(unsafe)
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(calls).toBe(0);
  });

  test("OAI-008: rejects invalid primary selectors", async () => {
    let calls = 0;

    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
    });

    await expect(
      provider.suggestLocators({
        ...request,
        primarySelector: "body script",
      })
    ).rejects.toThrow("INVALID_AI_REQUEST");

    expect(calls).toBe(0);
  });

  test("OAI-009: rejects oversized responses", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response("x".repeat(40_000)),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
  });

  test("OAI-010: enforces timeout", async () => {
    const provider = new OpenAIProvider(
      { ...config, timeoutMs: 30 },
      {
        allowExternalRequests: true,
        fetchImpl: async () =>
          new Promise<Response>(() => undefined),
      }
    );

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow("OPENAI_PROVIDER_FAILED");
  });

  test("OAI-011: hides upstream response details", async () => {
    const provider = new OpenAIProvider(config, {
      allowExternalRequests: true,
      fetchImpl: async () =>
        new Response(
          "Sensitive provider diagnostic",
          { status: 500 }
        ),
    });

    await expect(
      provider.suggestLocators({ ...request })
    ).rejects.toThrow(/^OPENAI_PROVIDER_FAILED$/);
  });
});
