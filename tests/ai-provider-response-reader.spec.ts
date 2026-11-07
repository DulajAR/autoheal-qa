
import { test, expect } from "@playwright/test";

import {
  readAIProviderResponse,
} from "../src/ai/AIProviderResponseReader";

/**
 * AutoHeal QA
 * Phase 4.0.9 - AI Provider Response Reader Tests
 *
 * Coverage:
 * - Valid response reading
 * - Response byte-size limits
 * - Empty response handling
 * - Pre-aborted signals
 * - Cancellation during stalled reads
 * - Invalid byte limits
 * - Exact byte-limit boundaries
 * - UTF-8 multibyte validation
 * - Stream failures
 * - Stream cancellation failures
 */

function responseFromText(text: string): Response {
  return new Response(text, {
    status: 200,
  });
}

test.describe(
  "Phase 4.0.9 - AI Response Reader",
  () => {
    test(
      "STR-001: reads valid response",
      async () => {
        const controller = new AbortController();

        const result = await readAIProviderResponse(
          responseFromText('{"ok":true}'),
          {
            signal: controller.signal,
          }
        );

        expect(result).toBe('{"ok":true}');
      }
    );

    test(
      "STR-002: rejects oversized response",
      async () => {
        const controller = new AbortController();

        await expect(
          readAIProviderResponse(
            responseFromText("x".repeat(33_000)),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow("RESPONSE_TOO_LARGE");
      }
    );

    test(
      "STR-003: rejects empty response body",
      async () => {
        const controller = new AbortController();

        await expect(
          readAIProviderResponse(
            new Response(null),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow("EMPTY_RESPONSE");
      }
    );

    test(
      "STR-004: rejects pre-aborted signal",
      async () => {
        const controller = new AbortController();

        controller.abort();

        await expect(
          readAIProviderResponse(
            responseFromText("test"),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow("AI_RETRY_ABORTED");
      }
    );

    test(
      "STR-005: cancels stalled response read",
      async () => {
        const controller = new AbortController();

        let readStarted!: () => void;

        const started = new Promise<void>(resolve => {
          readStarted = resolve;
        });

        const stream = new ReadableStream<Uint8Array>({
          pull() {
            readStarted();

            return new Promise<void>(
              () => undefined
            );
          },
        });

        const response = new Response(stream);

        const reading = readAIProviderResponse(
          response,
          {
            signal: controller.signal,
          }
        );

        await started;

        controller.abort();

        await expect(reading).rejects.toThrow(
          "AI_RETRY_ABORTED"
        );
      }
    );

    test(
      "STR-006: rejects invalid byte limit",
      async () => {
        const controller = new AbortController();

        await expect(
          readAIProviderResponse(
            responseFromText("test"),
            {
              signal: controller.signal,
              maxBytes: 0,
            }
          )
        ).rejects.toThrow(
          "INVALID_RESPONSE_LIMIT"
        );
      }
    );

    test(
      "STR-007: accepts response exactly at byte limit",
      async () => {
        const controller = new AbortController();

        const content = "x".repeat(32_768);

        const result = await readAIProviderResponse(
          responseFromText(content),
          {
            signal: controller.signal,
          }
        );

        expect(result).toBe(content);

        expect(
          Buffer.byteLength(result, "utf8")
        ).toBe(32_768);
      }
    );

    test(
      "STR-008: measures UTF-8 bytes correctly",
      async () => {
        const controller = new AbortController();

        // Sinhala character occupies 3 UTF-8 bytes.
        const content = "අ".repeat(11_000);

        expect(
          Buffer.byteLength(content, "utf8")
        ).toBe(33_000);

        await expect(
          readAIProviderResponse(
            responseFromText(content),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow(
          "RESPONSE_TOO_LARGE"
        );
      }
    );

    test(
      "STR-009: rejects a failing response stream",
      async () => {
        const controller = new AbortController();

        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.error(
              new Error(
                "SIMULATED_STREAM_FAILURE"
              )
            );
          },
        });

        await expect(
          readAIProviderResponse(
            new Response(stream),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow(
          "SIMULATED_STREAM_FAILURE"
        );
      }
    );

    test(
      "STR-010: handles rejected stream cancellation",
      async () => {
        const controller = new AbortController();

        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(
              new TextEncoder().encode(
                "x".repeat(33_000)
              )
            );
          },

          cancel() {
            return Promise.reject(
              new Error(
                "SIMULATED_CANCEL_FAILURE"
              )
            );
          },
        });

        await expect(
          readAIProviderResponse(
            new Response(stream),
            {
              signal: controller.signal,
            }
          )
        ).rejects.toThrow(
          "RESPONSE_TOO_LARGE"
        );
      }
    );
  }
);
