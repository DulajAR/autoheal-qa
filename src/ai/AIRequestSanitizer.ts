
import type {
  AILocatorRequest,
} from "./AIProvider";

// ============================================================
// AutoHeal QA - Shared AI Request Sanitizer
// Phase 4.0.6D
//
// Shared between OpenAI and Gemini providers.
// Prevents sensitive or unsupported DOM metadata
// from being sent to external AI services.
// ============================================================

const SAFE_SELECTOR =
  /^(#[A-Za-z][A-Za-z0-9_-]*|\.[A-Za-z][A-Za-z0-9_-]*|\[data-testid=["']?[A-Za-z][A-Za-z0-9_-]*["']?\])$/;

const SAFE_IDENTIFIER =
  /^[A-Za-z][A-Za-z0-9_-]*$/;

const SENSITIVE =
  /password|passwd|secret|token|api[-_]?key|auth|session|cookie|credential|private|payment|credit[-_]?card|cvv|ssn|national[-_]?id|otp|pin[-_]?code/i;

const ALLOWED_ELEMENT_KEYS = new Set([
  "tagName",
  "id",
  "testId",
  "name",
  "role",
  "type",
]);

const MAX_REQUEST_BYTES = 16_384;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeIdentifier(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 120 &&
    SAFE_IDENTIFIER.test(value) &&
    !SENSITIVE.test(value)
  );
}

export function isSafeAISelector(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    SAFE_SELECTOR.test(value) &&
    !SENSITIVE.test(value)
  );
}

export function prepareAIRequest(
  request: AILocatorRequest
): AILocatorRequest {
  if (
    !request ||
    !isSafeAISelector(request.primarySelector) ||
    typeof request.domSnapshot !== "string"
  ) {
    throw new Error("INVALID_AI_REQUEST");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(request.domSnapshot);
  } catch {
    throw new Error("INVALID_DOM_SNAPSHOT");
  }

  if (
    !isRecord(parsed) ||
    Object.keys(parsed).some(
      key =>
        ![
          "url",
          "elements",
          "totalElements",
          "truncated",
        ].includes(key)
    ) ||
    typeof parsed.url !== "string" ||
    !Array.isArray(parsed.elements) ||
    parsed.elements.length > 100 ||
    !Number.isInteger(parsed.totalElements) ||
    parsed.totalElements !== parsed.elements.length ||
    typeof parsed.truncated !== "boolean"
  ) {
    throw new Error("INVALID_DOM_SNAPSHOT");
  }

  let url: URL;

  try {
    url = new URL(parsed.url);
  } catch {
    throw new Error("INVALID_DOM_SNAPSHOT");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== parsed.url
  ) {
    throw new Error("INVALID_DOM_SNAPSHOT");
  }

  const elements = parsed.elements.map(element => {
    if (
      !isRecord(element) ||
      Object.keys(element).some(
        key => !ALLOWED_ELEMENT_KEYS.has(key)
      ) ||
      !safeIdentifier(element.tagName)
    ) {
      throw new Error("INVALID_DOM_ELEMENT");
    }

    const tagName =
      element.tagName.toLowerCase();

    const result: Record<string, string> = {
      tagName,
    };

    for (const key of [
      "id",
      "testId",
      "name",
      "role",
      "type",
    ]) {
      if (element[key] !== undefined) {
        if (!safeIdentifier(element[key])) {
          throw new Error("INVALID_DOM_ELEMENT");
        }

        result[key] = element[key];
      }
    }

    if (
      !result.id &&
      !result.testId &&
      !result.name &&
      !result.role
    ) {
      throw new Error("INVALID_DOM_ELEMENT");
    }

    if (
      ![
        "button",
        "input",
        "select",
        "textarea",
        "a",
      ].includes(tagName) &&
      !result.role &&
      !result.testId
    ) {
      throw new Error("INVALID_DOM_ELEMENT");
    }

    if (
      tagName === "input" &&
      (
        !result.type ||
        [
          "password",
          "hidden",
          "file",
        ].includes(result.type.toLowerCase())
      )
    ) {
      throw new Error("INVALID_DOM_ELEMENT");
    }

    return result;
  });

  // The original website URL is deliberately excluded.
  const prepared: AILocatorRequest = {
    primarySelector: request.primarySelector,

    domSnapshot: JSON.stringify({
      elements,
      totalElements: elements.length,
      truncated: parsed.truncated,
    }),
  };

  if (
    Buffer.byteLength(
      JSON.stringify(prepared),
      "utf8"
    ) > MAX_REQUEST_BYTES
  ) {
    throw new Error("AI_REQUEST_TOO_LARGE");
  }

  return prepared;
}
