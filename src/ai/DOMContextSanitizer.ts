
import type {
  DOMContext,
  DOMElementContext,
} from "./DOMContextTypes";

const MAX_ELEMENTS = 100;
const MAX_ATTRIBUTE_LENGTH = 120;

// Sensitive values and identifiers must not be exported.
const SENSITIVE_KEYWORDS =
  /password|passwd|secret|token|api[-_]?key|auth|session|cookie|credential|private|payment|credit[-_]?card|cvv|ssn|national[-_]?id|otp|pin[-_]?code/i;

const EMAIL_PATTERN =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const JWT_PATTERN =
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

function sanitizeAttribute(
  value: unknown
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_ATTRIBUTE_LENGTH ||
    !SAFE_IDENTIFIER.test(normalized) ||
    SENSITIVE_KEYWORDS.test(normalized) ||
    EMAIL_PATTERN.test(normalized) ||
    JWT_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeElement(
  element: DOMElementContext
): DOMElementContext | null {
  const tagName = sanitizeAttribute(element.tagName);

  if (!tagName) {
    return null;
  }

  const tag = tagName.toLowerCase();

  if (
    ![
      "button",
      "input",
      "select",
      "textarea",
      "a",
    ].includes(tag) &&
    !element.role &&
    !element.testId
  ) {
    return null;
  }

  const inputType = sanitizeAttribute(element.type);

  if (
    tag === "input" &&
    (
      !inputType ||
      ["password", "hidden", "file"].includes(
        inputType.toLowerCase()
      )
    )
  ) {
    return null;
  }

  const result: DOMElementContext = {
    tagName: tag,
  };

  const id = sanitizeAttribute(element.id);
  const testId = sanitizeAttribute(element.testId);
  const name = sanitizeAttribute(element.name);
  const role = sanitizeAttribute(element.role);

  if (id) result.id = id;
  if (testId) result.testId = testId;
  if (name) result.name = name;
  if (role) result.role = role;
  if (inputType) result.type = inputType;

  // Deliberately omit:
  // - text
  // - ariaLabel
  // - placeholder
  //
  // These can contain arbitrary user or application data.

  // Only include elements with usable locator metadata.
  if (
    !result.id &&
    !result.testId &&
    !result.name &&
    !result.role
  ) {
    return null;
  }

  return result;
}

export class DOMContextSanitizer {
  sanitize(context: DOMContext): DOMContext {
    if (
      !context ||
      !Array.isArray(context.elements) ||
      typeof context.url !== "string"
    ) {
      throw new Error("Invalid DOM context");
    }

    const url = new URL(context.url);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported DOM context URL");
    }

    const elements: DOMElementContext[] = [];

    for (const element of context.elements) {
      if (
        !element ||
        typeof element !== "object"
      ) {
        continue;
      }

      const sanitized = sanitizeElement(element);

      if (!sanitized) {
        continue;
      }

      if (elements.length >= MAX_ELEMENTS) {
        break;
      }

      elements.push(sanitized);
    }

    // Retain only the origin. Paths, queries, and
    // fragments can contain sensitive information.
    return {
      url: url.origin,
      elements,
      totalElements: elements.length,
      truncated:
        context.truncated ||
        context.elements.length > MAX_ELEMENTS,
    };
  }
}
