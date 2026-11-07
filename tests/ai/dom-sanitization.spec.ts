
import { test, expect } from "@playwright/test";

import { DOMContextSanitizer } from "../../src/ai/DOMContextSanitizer";
import { AIRequestBuilder } from "../../src/ai/AIRequestBuilder";

import type { DOMContext } from "../../src/ai/DOMContextTypes";

const sanitizer = new DOMContextSanitizer();
const builder = new AIRequestBuilder();

function makeContext(): DOMContext {
  return {
    url: "https://example.com/account/123?token=secret",
    totalElements: 2,
    truncated: false,
    elements: [
      {
        tagName: "button",
        id: "submit",
        testId: "submit-button",
        text: "Submit private information",
        ariaLabel: "user@example.com",
      },
      {
        tagName: "input",
        id: "username",
        name: "username",
        type: "text",
        placeholder: "user@example.com",
      },
    ],
  };
}

test.describe("DOM Sanitization Security", () => {
  test("SEC-001: removes sensitive free-form text", () => {
    const result = sanitizer.sanitize(makeContext());

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("private information");
    expect(serialized).not.toContain("user@example.com");
    expect(result.elements[0].testId).toBe("submit-button");
  });

  test("SEC-002: removes URL paths and query strings", () => {
    const result = sanitizer.sanitize(makeContext());

    expect(result.url).toBe("https://example.com");
    expect(JSON.stringify(result)).not.toContain("token=secret");
    expect(JSON.stringify(result)).not.toContain("/account/123");
  });

  test("SEC-003: excludes sensitive identifiers", () => {
    const context = makeContext();

    context.elements.push({
      tagName: "button",
      id: "secret-token",
      testId: "api-key",
      name: "password",
      role: "button",
    });

    const result = sanitizer.sanitize(context);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("api-key");
    expect(serialized).not.toContain('"name":"password"');
  });

  test("SEC-004: excludes password inputs", () => {
    const context = makeContext();

    context.elements.push({
      tagName: "input",
      id: "login-password",
      type: "password",
    });

    const result = sanitizer.sanitize(context);

    expect(
      result.elements.some(
        (element) => element.type === "password"
      )
    ).toBe(false);
  });

  test("SEC-005: rejects invalid context", () => {
    expect(() =>
      sanitizer.sanitize({
        url: "file:///private/data",
        elements: [],
        totalElements: 0,
        truncated: false,
      })
    ).toThrow();
  });

  test("SEC-006: builds a sanitized AI request", () => {
    const request = builder.build(
      "#submit",
      makeContext()
    );

    expect(request.primarySelector).toBe("#submit");
    expect(request.domSnapshot).toContain("submit-button");
    expect(request.domSnapshot).not.toContain("user@example.com");
    expect(request.domSnapshot).not.toContain("token=secret");
  });

  test("SEC-007: rejects unsafe primary selectors", () => {
    expect(() =>
      builder.build(
        '[data-token="private-secret"]',
        makeContext()
      )
    ).toThrow("Unsafe or unsupported primary selector");
  });

  test("SEC-008: enforces payload size limit", () => {
    const context = makeContext();

    context.elements = Array.from(
      { length: 100 },
      (_, index) => ({
        tagName: "button",
        id: `button${index}${"a".repeat(80)}`,
        testId: `test${index}${"b".repeat(80)}`,
        name: `name${index}${"c".repeat(80)}`,
        role: "button",
      })
    );

    expect(() =>
      builder.build("#submit", context)
    ).toThrow("AI request exceeds maximum payload size");
  });

  test("SEC-009: does not mutate original context", () => {
    const context = makeContext();
    const before = JSON.stringify(context);

    sanitizer.sanitize(context);

    expect(JSON.stringify(context)).toBe(before);
  });

  test("SEC-010: limits the exported element count", () => {
    const context = makeContext();

    context.elements = Array.from(
      { length: 150 },
      (_, index) => ({
        tagName: "button",
        id: `button-${index}`,
      })
    );

    const result = sanitizer.sanitize(context);

    expect(result.elements).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });
});
