
import { test, expect } from "@playwright/test";

import {
  classifyHTTPStatus,
  classifyProviderFailure,
} from "../src/ai/AIProviderErrorClassifier";

test.describe(
  "Phase 4.0.7 - AI Provider Error Classification",
  () => {
    test("classifies authentication failures", () => {
      expect(classifyHTTPStatus(401)).toBe(
        "AUTHENTICATION_ERROR"
      );

      expect(classifyHTTPStatus(403)).toBe(
        "AUTHENTICATION_ERROR"
      );
    });

    test("classifies rate limiting", () => {
      expect(classifyHTTPStatus(429)).toBe(
        "RATE_LIMITED"
      );
    });

    test("classifies other HTTP failures", () => {
      expect(classifyHTTPStatus(500)).toBe(
        "HTTP_ERROR"
      );
    });

    test("classifies provider timeouts", () => {
      expect(
        classifyProviderFailure("PROVIDER_TIMEOUT")
      ).toBe("TIMEOUT");

      expect(
        classifyProviderFailure("GEMINI_TIMEOUT")
      ).toBe("TIMEOUT");
    });

    test("classifies oversized responses", () => {
      expect(
        classifyProviderFailure("RESPONSE_TOO_LARGE")
      ).toBe("RESPONSE_TOO_LARGE");

      expect(
        classifyProviderFailure(
          "GEMINI_RESPONSE_TOO_LARGE"
        )
      ).toBe("RESPONSE_TOO_LARGE");
    });

    test("classifies malformed responses", () => {
      expect(
        classifyProviderFailure("INVALID_ENVELOPE")
      ).toBe("INVALID_RESPONSE");

      expect(
        classifyProviderFailure(
          "INVALID_GEMINI_CANDIDATE"
        )
      ).toBe("INVALID_RESPONSE");
    });

    test("does not expose unknown error messages", () => {
      const sensitiveMessage =
        "PRIVATE_API_KEY_SECRET";

      const result = classifyProviderFailure(
        sensitiveMessage
      );

      expect(result).toBe("UNKNOWN_ERROR");
      expect(result).not.toContain(
        sensitiveMessage
      );
    });
  }
);
