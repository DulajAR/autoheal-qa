
import type { Page } from "@playwright/test";

import type {
  DOMContext,
  DOMExtractionOptions,
} from "./DOMContextTypes";

export class DOMContextExtractor {
  constructor(private readonly page: Page) {}

  async extract(
    options: DOMExtractionOptions = {}
  ): Promise<DOMContext> {
    const maxElements = options.maxElements ?? 100;
    const maxTextLength = options.maxTextLength ?? 120;

    if (
      !Number.isSafeInteger(maxElements) ||
      maxElements <= 0 ||
      maxElements > 500
    ) {
      throw new Error(
        "maxElements must be an integer between 1 and 500"
      );
    }

    if (
      !Number.isSafeInteger(maxTextLength) ||
      maxTextLength <= 0 ||
      maxTextLength > 500
    ) {
      throw new Error(
        "maxTextLength must be an integer between 1 and 500"
      );
    }

    return this.page.evaluate(
      ({ maxElements, maxTextLength }) => {
        const selector = [
          "button",
          "input",
          "select",
          "textarea",
          "a",
          "[role]",
          "[data-testid]",
        ].join(",");

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(selector)
        );

        const elements = [];

        let totalElements = 0;

        const sanitize = (value: string | null) =>
          value
            ?.replace(/\s+/g, " ")
            .trim()
            .slice(0, maxTextLength) || undefined;

        for (const element of candidates) {
          const style = window.getComputedStyle(element);

          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            element.getClientRects().length === 0
          ) {
            continue;
          }

          if (
            element.closest(
              '[hidden], [aria-hidden="true"], [inert]'
            )
          ) {
            continue;
          }

          totalElements++;

          if (elements.length >= maxElements) {
            continue;
          }

          const tagName = element.tagName.toLowerCase();

          const inputType =
            element.getAttribute("type")?.toLowerCase();

          const sensitiveInput =
            tagName === "input" &&
            (
              inputType === "password" ||
              inputType === "hidden" ||
              inputType === "file"
            );

          if (sensitiveInput) {
            continue;
          }

          const text =
            tagName === "input" ||
            tagName === "textarea" ||
            tagName === "select"
              ? undefined
              : sanitize(element.textContent);

          elements.push({
            tagName,
            id: sanitize(element.getAttribute("id")),
            testId: sanitize(
              element.getAttribute("data-testid")
            ),
            name: sanitize(element.getAttribute("name")),
            role: sanitize(element.getAttribute("role")),
            type: sanitize(element.getAttribute("type")),
            ariaLabel: sanitize(
              element.getAttribute("aria-label")
            ),
            placeholder: sanitize(
              element.getAttribute("placeholder")
            ),
            text,
          });
        }

        return {
          url: window.location.origin + window.location.pathname,
          elements,
          totalElements,
          truncated: totalElements > maxElements,
        };
      },
      { maxElements, maxTextLength }
    );
  }
}
