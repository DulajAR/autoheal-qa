
import type {
  AILocatorRequest,
} from "./AIProvider";

import type {
  DOMContext,
} from "./DOMContextTypes";

import {
  DOMContextSanitizer,
} from "./DOMContextSanitizer";

const MAX_PAYLOAD_BYTES = 16_384;

const SAFE_PRIMARY_SELECTOR =
  /^(#[A-Za-z][A-Za-z0-9_-]*|\.[A-Za-z][A-Za-z0-9_-]*|\[data-testid=["']?[A-Za-z][A-Za-z0-9_-]*["']?\])$/;

export class AIRequestBuilder {
  private readonly sanitizer =
    new DOMContextSanitizer();

  build(
    primarySelector: string,
    context: DOMContext
  ): AILocatorRequest {
    if (
      typeof primarySelector !== "string" ||
      primarySelector.length > 200 ||
      !SAFE_PRIMARY_SELECTOR.test(primarySelector)
    ) {
      throw new Error(
        "Unsafe or unsupported primary selector"
      );
    }

    const sanitized = this.sanitizer.sanitize(context);

    const request: AILocatorRequest = {
      primarySelector,
      domSnapshot: JSON.stringify(sanitized),
    };

    const bytes = Buffer.byteLength(
      JSON.stringify(request),
      "utf8"
    );

    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(
        "AI request exceeds maximum payload size"
      );
    }

    return request;
  }
}
