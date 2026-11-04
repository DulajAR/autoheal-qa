
import { test, expect } from "@playwright/test";

import { DOMContextExtractor } from "../../src/ai/DOMContextExtractor";

test.describe("DOM Context Extraction", () => {
  test("DOM-001: extracts interactive elements", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="save-btn">Save</button>
      <input name="username" placeholder="Username" />
      <a href="/home">Home</a>
    `);

    const extractor = new DOMContextExtractor(page);
    const context = await extractor.extract();

    expect(context.elements).toHaveLength(3);

    expect(
      context.elements.find(
        (element) => element.id === "save-btn"
      )
    ).toBeDefined();

    expect(
      context.elements.some(
        (element) => element.name === "username"
      )
    ).toBe(true);

    expect(
      context.elements.some(
        (element) =>
          element.tagName === "a" &&
          element.text === "Home"
      )
    ).toBe(true);
  });

  test("DOM-002: excludes hidden elements", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="visible">Visible</button>

      <button
        id="hidden"
        style="display:none"
      >
        Hidden
      </button>

      <button
        id="aria-hidden"
        aria-hidden="true"
      >
        Hidden from accessibility
      </button>
    `);

    const extractor = new DOMContextExtractor(page);
    const context = await extractor.extract();

    const ids = context.elements.map(
      (element) => element.id
    );

    expect(ids).toContain("visible");
    expect(ids).not.toContain("hidden");
    expect(ids).not.toContain("aria-hidden");
  });

  test("DOM-003: excludes password inputs", async ({
    page,
  }) => {
    await page.setContent(`
      <input
        type="password"
        id="password"
        value="secret-password"
      />

      <input
        type="text"
        id="username"
        value="test-user"
      />
    `);

    const extractor = new DOMContextExtractor(page);
    const context = await extractor.extract();

    expect(
      context.elements.some(
        (element) => element.id === "password"
      )
    ).toBe(false);

    expect(
      context.elements.some(
        (element) => element.id === "username"
      )
    ).toBe(true);

    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("test-user");
  });

  test("DOM-004: respects element limits", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="one">One</button>
      <button id="two">Two</button>
      <button id="three">Three</button>
    `);

    const extractor = new DOMContextExtractor(page);

    const context = await extractor.extract({
      maxElements: 2,
    });

    expect(context.elements).toHaveLength(2);
    expect(context.truncated).toBe(true);
    expect(context.totalElements).toBe(3);
  });

  test("DOM-005: rejects invalid limits", async ({
    page,
  }) => {
    const extractor = new DOMContextExtractor(page);

    await expect(
      extractor.extract({
        maxElements: 0,
      })
    ).rejects.toThrow(
      "maxElements must be an integer between 1 and 500"
    );

    await expect(
      extractor.extract({
        maxElements: 501,
      })
    ).rejects.toThrow();

    await expect(
      extractor.extract({
        maxTextLength: 0,
      })
    ).rejects.toThrow();

    await expect(
      extractor.extract({
        maxTextLength: 501,
      })
    ).rejects.toThrow();
  });

  test("DOM-006: removes query parameters from URL", async ({
    page,
  }) => {
    const testUrl =
      "https://example.com/?token=secret";

    // Mock the webpage response locally.
    // No real external request is required.
    await page.route("https://example.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <title>DOM Context Test</title>
            </head>
            <body>
              <button id="test-button">
                Test Button
              </button>
            </body>
          </html>
        `,
      });
    });

    await page.goto(testUrl);

    const extractor = new DOMContextExtractor(page);
    const context = await extractor.extract();

    expect(context.url).toBe("https://example.com/");

    expect(context.url).not.toContain(
      "token=secret"
    );

    expect(context.url).not.toContain("?");

    expect(
      context.elements.some(
        (element) => element.id === "test-button"
      )
    ).toBe(true);
  });
});
