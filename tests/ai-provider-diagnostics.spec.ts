
import { test, expect } from "@playwright/test";

import {
  AIProviderDiagnostics,
} from "../src/ai/AIProviderDiagnostics";

test.describe(
  "Phase 4.0.7 - AI Provider Diagnostics",
  () => {
    test(
      "records successful provider requests",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
          durationMs: 125,
          candidateCount: 2,
        });

        expect(diagnostics.getMetrics("gemini")).toEqual({
          provider: "gemini",
          totalRequests: 1,
          successfulRequests: 1,
          failedRequests: 0,
          averageDurationMs: 125,
        });
      }
    );

    test(
      "aggregates failures independently",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "openai",
          outcome: "failure",
          errorCode: "TIMEOUT",
          durationMs: 500,
          candidateCount: 0,
        });

        expect(
          diagnostics.getMetrics("openai").failedRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("gemini").totalRequests
        ).toBe(0);
      }
    );

    test(
      "returns defensive event copies",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
          durationMs: 10,
          candidateCount: 1,
        });

        const events = diagnostics.getEvents();

        events[0] = {
          provider: "openai",
          outcome: "failure",
          errorCode: "UNKNOWN_ERROR",
          durationMs: 0,
          candidateCount: 0,
        };

        expect(
          diagnostics.getEvents()[0].provider
        ).toBe("gemini");
      }
    );

    test(
      "clears stored diagnostics",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
          durationMs: 50,
          candidateCount: 1,
        });

        diagnostics.clear();

        expect(diagnostics.getEvents()).toHaveLength(0);

        expect(
          diagnostics.getMetrics("openai").totalRequests
        ).toBe(0);
      }
    );

    test(
      "rejects unexpected error messages",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        const sensitiveMessage = "API_KEY_SECRET_12345";

        diagnostics.record({
          provider: "gemini",
          outcome: "failure",
          errorCode: sensitiveMessage as never,
          durationMs: 10,
          candidateCount: 0,
        });

        const events = diagnostics.getEvents();

        expect(events[0].errorCode).toBe(
          "UNKNOWN_ERROR"
        );

        expect(
          JSON.stringify(events)
        ).not.toContain(sensitiveMessage);
      }
    );

    test(
      "normalizes invalid numeric values",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
          durationMs: Number.NaN,
          candidateCount: -10,
        });

        const event = diagnostics.getEvents()[0];

        expect(event.durationMs).toBe(0);
        expect(event.candidateCount).toBe(0);
      }
    );

    test(
      "limits excessive duration and candidates",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "gemini",
          outcome: "success",
          errorCode: "NONE",
          durationMs: 999999999,
          candidateCount: 999,
        });

        const event = diagnostics.getEvents()[0];

        expect(event.durationMs).toBe(3_600_000);
        expect(event.candidateCount).toBe(5);
      }
    );

    test(
      "normalizes inconsistent outcomes",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "gemini",
          outcome: "failure",
          errorCode: "NONE",
          durationMs: 100,
          candidateCount: 3,
        });

        const event = diagnostics.getEvents()[0];

        expect(event.outcome).toBe("failure");
        expect(event.errorCode).toBe(
          "UNKNOWN_ERROR"
        );
        expect(event.candidateCount).toBe(0);
      }
    );

    test(
      "maintains separate metrics for providers",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "openai",
          outcome: "success",
          errorCode: "NONE",
          durationMs: 100,
          candidateCount: 2,
        });

        diagnostics.record({
          provider: "gemini",
          outcome: "failure",
          errorCode: "TIMEOUT",
          durationMs: 300,
          candidateCount: 0,
        });

        expect(
          diagnostics.getMetrics("openai").successfulRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("gemini").failedRequests
        ).toBe(1);

        expect(
          diagnostics.getMetrics("openai").averageDurationMs
        ).toBe(100);

        expect(
          diagnostics.getMetrics("gemini").averageDurationMs
        ).toBe(300);
      }
    );

    test(
      "retains only the latest 1000 events",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        for (let i = 0; i < 1005; i++) {
          diagnostics.record({
            provider: "gemini",
            outcome: "success",
            errorCode: "NONE",
            durationMs: i,
            candidateCount: 1,
          });
        }

        const events = diagnostics.getEvents();

        expect(events).toHaveLength(1000);
        expect(events[0].durationMs).toBe(5);
        expect(events[999].durationMs).toBe(1004);
      }
    );

    test(
      "does not retain unexpected sensitive fields",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        const sensitiveValue = "PRIVATE_API_KEY_VALUE";

        diagnostics.record({
          provider: "openai",
          outcome: "failure",
          errorCode: "HTTP_ERROR",
          durationMs: 120,
          candidateCount: 0,
          apiKey: sensitiveValue,
          rawResponse: sensitiveValue,
          domSnapshot: sensitiveValue,
        } as Parameters<
          AIProviderDiagnostics["record"]
        >[0]);

        const events = diagnostics.getEvents();

        expect(
          JSON.stringify(events)
        ).not.toContain(sensitiveValue);

        expect(Object.keys(events[0]).sort()).toEqual([
          "candidateCount",
          "durationMs",
          "errorCode",
          "outcome",
          "provider",
        ]);
      }
    );

    test(
      "rejects unknown provider identities",
      () => {
        const diagnostics = new AIProviderDiagnostics();

        diagnostics.record({
          provider: "unknown-provider" as never,
          outcome: "success",
          errorCode: "NONE",
          durationMs: 100,
          candidateCount: 2,
        });

        expect(diagnostics.getEvents()).toHaveLength(0);

        expect(
          diagnostics.getMetrics("openai").totalRequests
        ).toBe(0);

        expect(
          diagnostics.getMetrics("gemini").totalRequests
        ).toBe(0);
      }
    );
  }
);
