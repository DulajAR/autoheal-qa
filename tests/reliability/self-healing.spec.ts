
import { test, expect } from "@playwright/test";
import {
  SelfHealingLocator,
  type LocatorStrategy,
} from "../../src/core/SelfHealingLocator";

const OPTIONS = {
  enabled: true,
  timeoutMs: 100,
  minimumConfidence: 0.85,
};

function fallback(
  selector: string,
  confidence = 0.95,
  name = "trusted-fallback"
): LocatorStrategy {
  return { name, selector, confidence };
}

test.describe("SelfHealingLocator Reliability", () => {
  test("REL-001: uses the primary selector when available", async ({
    page,
  }, testInfo) => {
    await page.setContent(`
      <button id="primary">Submit</button>
      <button id="fallback">Fallback</button>
    `);

    const healer = new SelfHealingLocator(page);
    const initialAttachments = testInfo.attachments.length;

    const locator = await healer.resolve(
      "#primary",
      [fallback("#fallback")],
      OPTIONS
    );

    await expect(locator).toHaveText("Submit");

    expect(testInfo.attachments.length).toBe(
      initialAttachments
    );
  });

  test("REL-002: recovers when primary is missing", async ({
    page,
  }, testInfo) => {
    await page.setContent(`
      <button id="new-submit">Submit</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#old-submit",
      [fallback("#new-submit")],
      OPTIONS
    );

    await expect(locator).toHaveText("Submit");

    const attachments = testInfo.attachments.filter(
      (attachment) =>
        attachment.name === "autoheal-healing-event"
    );

    expect(attachments).toHaveLength(1);

    const attachment = attachments[0];

    expect(attachment.body).toBeDefined();

    const event = JSON.parse(
      attachment.body!.toString("utf8")
    );

    expect(event).toMatchObject({
      event: "LOCATOR_HEALED",
      primarySelector: "#old-submit",
      recoveredSelector: "#new-submit",
      strategy: "trusted-fallback",
      confidence: 0.95,
    });

    expect(
      Number.isNaN(Date.parse(event.timestamp))
    ).toBe(false);
  });

  test("REL-003: rejects ambiguous primary selector", async ({
    page,
  }) => {
    await page.setContent(`
      <button class="duplicate">One</button>
      <button class="duplicate">Two</button>
      <button id="unique">Unique</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      ".duplicate",
      [fallback("#unique")],
      OPTIONS
    );

    await expect(locator).toHaveText("Unique");
  });

  test("REL-004: rejects hidden primary element", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="hidden" style="display:none">
        Hidden
      </button>
      <button id="visible">Visible</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#hidden",
      [fallback("#visible")],
      OPTIONS
    );

    await expect(locator).toHaveText("Visible");
  });

  test("REL-005: prioritizes higher-confidence fallback", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="low">Low confidence</button>
      <button id="high">High confidence</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#missing",
      [
        fallback("#low", 0.86, "lower"),
        fallback("#high", 0.98, "higher"),
      ],
      OPTIONS
    );

    await expect(locator).toHaveText("High confidence");
  });

  test("REL-006: ignores low-confidence fallback", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="low">Low confidence</button>
      <button id="trusted">Trusted</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#missing",
      [
        fallback("#low", 0.5, "untrusted"),
        fallback("#trusted", 0.95, "trusted"),
      ],
      OPTIONS
    );

    await expect(locator).toHaveText("Trusted");
  });

  test("REL-007: rejects ambiguous fallback selector", async ({
    page,
  }) => {
    await page.setContent(`
      <button class="duplicate">One</button>
      <button class="duplicate">Two</button>
      <button id="unique">Unique</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#missing",
      [
        fallback(".duplicate", 0.99, "ambiguous"),
        fallback("#unique", 0.9, "unique"),
      ],
      OPTIONS
    );

    await expect(locator).toHaveText("Unique");
  });

  test("REL-008: fails when healing is disabled", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="fallback">Fallback</button>
    `);

    const healer = new SelfHealingLocator(page);

    await expect(
      healer.resolve(
        "#missing",
        [fallback("#fallback")],
        { ...OPTIONS, enabled: false }
      )
    ).rejects.toThrow(
      "Primary locator unavailable and self-healing disabled"
    );
  });

  test("REL-009: fails safely without valid fallback", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="unrelated">Unrelated</button>
    `);

    const healer = new SelfHealingLocator(page);

    await expect(
      healer.resolve(
        "#missing",
        [fallback("#also-missing")],
        OPTIONS
      )
    ).rejects.toThrow(
      "Self-healing failed for locator: #missing"
    );
  });

  test("REL-010: rejects invalid timeout", async ({
    page,
  }) => {
    const healer = new SelfHealingLocator(page);

    for (const timeoutMs of [0, -1, NaN, Infinity]) {
      await expect(
        healer.resolve("#primary", [], {
          ...OPTIONS,
          timeoutMs,
        })
      ).rejects.toThrow(
        "timeoutMs must be a positive number"
      );
    }
  });

  test("REL-011: rejects invalid confidence threshold", async ({
    page,
  }) => {
    const healer = new SelfHealingLocator(page);

    for (const minimumConfidence of [
      -0.1,
      1.1,
      NaN,
      Infinity,
    ]) {
      await expect(
        healer.resolve("#primary", [], {
          ...OPTIONS,
          minimumConfidence,
        })
      ).rejects.toThrow(
        "minimumConfidence must be between 0 and 1"
      );
    }
  });

  test("REL-012: rejects invalid fallback confidence", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="invalid">Invalid</button>
      <button id="valid">Valid</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#missing",
      [
        fallback("#invalid", NaN, "nan"),
        fallback("#invalid", Infinity, "infinite"),
        fallback("#invalid", 1.5, "too-high"),
        fallback("#valid", 0.95, "valid"),
      ],
      OPTIONS
    );

    await expect(locator).toHaveText("Valid");
  });

  test("REL-013: fails when all fallbacks are ambiguous", async ({
    page,
  }) => {
    await page.setContent(`
      <button class="duplicate">One</button>
      <button class="duplicate">Two</button>
    `);

    const healer = new SelfHealingLocator(page);

    await expect(
      healer.resolve(
        "#missing",
        [fallback(".duplicate")],
        OPTIONS
      )
    ).rejects.toThrow("Self-healing failed");
  });

  test("REL-014: accepts fallback at minimum confidence", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="boundary">Boundary</button>
    `);

    const healer = new SelfHealingLocator(page);

    const locator = await healer.resolve(
      "#missing",
      [fallback("#boundary", 0.85)],
      OPTIONS
    );

    await expect(locator).toHaveText("Boundary");
  });
});
