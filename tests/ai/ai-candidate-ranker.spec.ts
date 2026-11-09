
import { test, expect } from "@playwright/test";

import {
  AICandidateRanker,
} from "../../src/ai/AICandidateRanker";

import type {
  AICandidateRankingInput,
} from "../../src/ai/AICandidateRankingTypes";

test.describe("AI Candidate Ranker", () => {
  const ranker = new AICandidateRanker();

  test("RANK-001: ranks eligible candidates by confidence", () => {
    const results = ranker.rank([
      {
        selector: "#submit",
        confidence: 0.75,
        uniqueMatch: true,
        visible: true,
      },
      {
        selector: "[data-testid='submit']",
        confidence: 0.95,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].selector).toBe(
      "[data-testid='submit']"
    );
    expect(results[0].score).toBe(95);
    expect(results[0].eligible).toBe(true);
  });

  test("RANK-002: rejects ambiguous candidates", () => {
    const [result] = ranker.rank([
      {
        selector: ".button",
        confidence: 0.99,
        uniqueMatch: false,
        visible: true,
      },
    ]);

    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("NOT_UNIQUE");
  });

  test("RANK-003: rejects invisible candidates", () => {
    const [result] = ranker.rank([
      {
        selector: "#hidden",
        confidence: 0.95,
        uniqueMatch: true,
        visible: false,
      },
    ]);

    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("NOT_VISIBLE");
  });

  test("RANK-004: rejects invalid confidence", () => {
    const invalidValues = [
      -0.1,
      1.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const confidence of invalidValues) {
      const [result] = ranker.rank([
        {
          selector: "#submit",
          confidence,
          uniqueMatch: true,
          visible: true,
        },
      ]);

      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toContain(
        "INVALID_CONFIDENCE"
      );
    }
  });

  test("RANK-005: preserves input order for equal scores", () => {
    const results = ranker.rank([
      {
        selector: "#first",
        confidence: 0.9,
        uniqueMatch: true,
        visible: true,
      },
      {
        selector: "#second",
        confidence: 0.9,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(
      results.map((result) => result.selector)
    ).toEqual(["#first", "#second"]);
  });

  test("RANK-006: handles empty candidate lists", () => {
    expect(ranker.rank([])).toEqual([]);
  });

  test("RANK-007: prioritizes eligible candidates", () => {
    const results = ranker.rank([
      {
        selector: "#invalid",
        confidence: 0.99,
        uniqueMatch: false,
        visible: true,
      },
      {
        selector: "#valid",
        confidence: 0.85,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(results[0].selector).toBe("#valid");
    expect(results[0].eligible).toBe(true);

    expect(results[1].selector).toBe("#invalid");
    expect(results[1].eligible).toBe(false);
  });

  test("RANK-008: rejects duplicate selectors", () => {
    const results = ranker.rank([
      {
        selector: "#submit",
        confidence: 0.9,
        uniqueMatch: true,
        visible: true,
      },
      {
        selector: " #submit ",
        confidence: 0.99,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(results).toHaveLength(2);

    expect(results[0].eligible).toBe(true);
    expect(results[0].selector).toBe("#submit");

    expect(results[1].eligible).toBe(false);
    expect(results[1].score).toBe(0);
    expect(results[1].reasons).toContain(
      "DUPLICATE_SELECTOR"
    );
  });

  test("RANK-009: preserves confidence precision", () => {
    const results = ranker.rank([
      {
        selector: "#lower",
        confidence: 0.901,
        uniqueMatch: true,
        visible: true,
      },
      {
        selector: "#higher",
        confidence: 0.902,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(results[0].selector).toBe("#higher");
    expect(results[0].score).toBeCloseTo(90.2);

    expect(results[1].selector).toBe("#lower");
    expect(results[1].score).toBeCloseTo(90.1);
  });

  test("RANK-010: rejects empty selectors", () => {
    const [result] = ranker.rank([
      {
        selector: "   ",
        confidence: 0.99,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain(
      "INVALID_SELECTOR"
    );
  });

  test("RANK-011: handles malformed candidates safely", () => {
    const results = ranker.rank([
      null as unknown as AICandidateRankingInput,
      {
        selector: "#valid",
        confidence: 0.9,
        uniqueMatch: true,
        visible: true,
      },
    ]);

    expect(results).toHaveLength(2);

    expect(results[0].selector).toBe("#valid");
    expect(results[0].eligible).toBe(true);

    expect(results[1].eligible).toBe(false);
    expect(results[1].score).toBe(0);
    expect(results[1].reasons).toContain(
      "INVALID_SELECTOR"
    );
  });
});
