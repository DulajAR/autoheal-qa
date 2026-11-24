"use strict";

const { test, expect } = require("@playwright/test");

const {
  SelfHealingLocator,
  PolicyEnforcedSelfHealingLocator,
  createSelfHealingRuntime,
  loadAIRuntimeConfig,
} = require("autoheal-qa");

const PRIMARY = "#missing-button";
const TARGET = "#submit-button";

const OPTIONS = {
  enabled: true,
  timeoutMs: 500,
  minimumConfidence: 0.85,
};

function fallback(
  selector = TARGET,
  confidence = 0.95
) {
  return {
    name: "trusted-submit-fallback",
    selector,
    confidence,
  };
}

function readEvents(testInfo, name) {
  return testInfo.attachments
    .filter((item) => item.name === name)
    .map((item) =>
      JSON.parse(item.body.toString("utf8"))
    );
}

function healingEvents(testInfo) {
  return readEvents(
    testInfo,
    "autoheal-healing-event"
  );
}

function aiEvents(testInfo) {
  return readEvents(
    testInfo,
    "autoheal-ai-recovery-event"
  );
}

function createMockProvider() {
  let calls = 0;

  return {
    name: "mock",

    get calls() {
      return calls;
    },

    async suggestLocators() {
      calls += 1;

      return [
        {
          selector: TARGET,
          confidence: 0.95,
        },
      ];
    },
  };
}

// --------------------------------------------
// 1. Controlled local HTML fixture
// --------------------------------------------

test.beforeEach(async ({ page }) => {
  const html = `
    <main>
      <h1>AutoHeal Package Integration</h1>

      <button
        id="submit-button"
        onclick="
          document.getElementById('status')
            .textContent = 'Submitted'
        "
      >
        Submit
      </button>

      <button class="ambiguous">
        First
      </button>

      <button class="ambiguous">
        Second
      </button>

      <p id="status">Ready</p>
    </main>
  `;

  await page.route("https://autoheal.test/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });

  await page.goto("https://autoheal.test/");
  await expect(page).toHaveURL("https://autoheal.test/");
});

// --------------------------------------------
// 2. Primary locator execution
// --------------------------------------------

test(
  "PKG-012: primary locator resolves without healing",
  async ({ page }, testInfo) => {
    const healing = new SelfHealingLocator(page);

    const locator = await healing.resolve(
      TARGET,
      [fallback()],
      OPTIONS
    );

    await expect(locator).toBeVisible();

    await locator.click();

    await expect(
      page.locator("#status")
    ).toHaveText("Submitted");

    expect(healingEvents(testInfo)).toHaveLength(0);
    expect(aiEvents(testInfo)).toHaveLength(0);
  }
);

// --------------------------------------------
// 3. Trusted deterministic recovery
// --------------------------------------------

test(
  "PKG-013: trusted fallback recovers a broken locator",
  async ({ page }, testInfo) => {
    const healing = new SelfHealingLocator(page);

    const locator = await healing.resolve(
      PRIMARY,
      [fallback()],
      OPTIONS
    );

    await expect(locator).toHaveAttribute(
      "id",
      "submit-button"
    );

    await locator.click();

    await expect(
      page.locator("#status")
    ).toHaveText("Submitted");

    const events = healingEvents(testInfo);

    expect(events).toHaveLength(1);

    expect(events[0]).toMatchObject({
      event: "LOCATOR_HEALED",
      primarySelector: PRIMARY,
      recoveredSelector: TARGET,
      strategy: "trusted-submit-fallback",
      confidence: 0.95,
    });

    expect(
      Number.isFinite(Date.parse(events[0].timestamp))
    ).toBe(true);

    expect(aiEvents(testInfo)).toHaveLength(0);
  }
);

// --------------------------------------------
// 4. Low-confidence fallback rejection
// --------------------------------------------

test(
  "PKG-014: low-confidence fallback is rejected",
  async ({ page }, testInfo) => {
    const healing = new SelfHealingLocator(page);

    await expect(
      healing.resolve(
        PRIMARY,
        [fallback(TARGET, 0.40)],
        OPTIONS
      )
    ).rejects.toThrow("Self-healing failed");

    await expect(
      page.locator("#status")
    ).toHaveText("Ready");

    expect(healingEvents(testInfo)).toHaveLength(0);
    expect(aiEvents(testInfo)).toHaveLength(0);
  }
);

// --------------------------------------------
// 5. Ambiguous fallback rejection
// --------------------------------------------

test(
  "PKG-015: ambiguous fallback is rejected",
  async ({ page }, testInfo) => {
    const healing = new SelfHealingLocator(page);

    await expect(
      page.locator(".ambiguous")
    ).toHaveCount(2);

    await expect(
      healing.resolve(
        PRIMARY,
        [fallback(".ambiguous")],
        OPTIONS
      )
    ).rejects.toThrow("Self-healing failed");

    await expect(
      page.locator("#status")
    ).toHaveText("Ready");

    expect(healingEvents(testInfo)).toHaveLength(0);
    expect(aiEvents(testInfo)).toHaveLength(0);
  }
);

// --------------------------------------------
// 6. Fail-closed recovery
// --------------------------------------------

test(
  "PKG-016: unavailable recovery fails closed",
  async ({ page }, testInfo) => {
    const healing = new SelfHealingLocator(page);

    await expect(
      healing.resolve(
        PRIMARY,
        [fallback("#unavailable-fallback")],
        OPTIONS
      )
    ).rejects.toThrow("Self-healing failed");

    await expect(
      healing.resolve(
        PRIMARY,
        [fallback()],
        {
          ...OPTIONS,
          enabled: false,
        }
      )
    ).rejects.toThrow("self-healing disabled");

    await expect(
      page.locator("#status")
    ).toHaveText("Ready");

    expect(healingEvents(testInfo)).toHaveLength(0);
    expect(aiEvents(testInfo)).toHaveLength(0);
  }
);

// --------------------------------------------
// 7. Advisory-only AI recovery
// --------------------------------------------

test(
  "PKG-017: AI suggestions remain advisory-only",
  async ({ page }, testInfo) => {
    const provider = createMockProvider();

    const healing = new SelfHealingLocator(
      page,
      provider
    );

    await expect(
      healing.resolve(
        PRIMARY,
        [],
        {
          ...OPTIONS,
          aiRecovery: {
            enabled: true,
            minimumConfidence: 0.85,
            providerTimeoutMs: 3000,
            validationTimeoutMs: 3000,
          },
        }
      )
    ).rejects.toThrow("Self-healing failed");

    expect(provider.calls).toBe(1);

    const events = aiEvents(testInfo);

    expect(events).toHaveLength(1);

    expect(events[0]).toMatchObject({
      event: "AI_RECOVERY_EVALUATED",
      status: "SUGGESTED",
      provider: "mock",
    });

    expect(healingEvents(testInfo)).toHaveLength(0);

    await expect(
      page.locator("#status")
    ).toHaveText("Ready");
  }
);

// --------------------------------------------
// 8. Runtime policy enforcement
// --------------------------------------------

test(
  "PKG-018: runtime policy prevents unauthorized AI recovery",
  async ({ page }, testInfo) => {
    const provider = createMockProvider();

    const config = loadAIRuntimeConfig({
      AI_PROVIDER: "mock",
      AI_RECOVERY_ENABLED: "false",
      AI_ALLOW_EXTERNAL_REQUESTS: "false",
      TEST_ENV: "demo",
    });

    const healing =
      new PolicyEnforcedSelfHealingLocator(
        page,
        provider,
        config
      );

    await expect(
      healing.resolve(
        PRIMARY,
        [],
        {
          ...OPTIONS,
          aiRecovery: {
            enabled: true,
          },
        }
      )
    ).rejects.toThrow("Self-healing failed");

    expect(provider.calls).toBe(0);

    expect(aiEvents(testInfo)).toHaveLength(0);
    expect(healingEvents(testInfo)).toHaveLength(0);

    const runtime = createSelfHealingRuntime(
      page,
      {}
    );

    expect(runtime.config.provider).toBe("disabled");

    expect(
      runtime.config.recoveryEnabled
    ).toBe(false);

    const locator = await runtime.locator.resolve(
      TARGET,
      [],
      OPTIONS
    );

    await expect(locator).toBeVisible();

    await expect(
      page.locator("#status")
    ).toHaveText("Ready");
  }
);
