
import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const generator = path.resolve(
  __dirname,
  "../../scripts/generate-analytics.cjs"
);

interface AIAnalytics {
  acceptedCandidates: number;
  rejectedCandidates: number;
  notEvaluatedCandidates: number;
  validationDurationMs: number;
  rejectionReasons: Record<string, number>;
  internalTrace?: string;
}

interface AIEvent {
  event: string;
  timestamp: string;
  status: string;
  provider: string;
  evaluatedCandidates: number;
  confidence: number;
  analytics?: AIAnalytics;
  internalTrace?: string;
}

interface ReportTest {
  title: string;
  project: string;
  status: string;
  durationMs: number;
  retry: number;
  healingEvents: unknown[];
  aiRecoveryEvents: AIEvent[];
}

interface DashboardReport {
  overallStatus: string;
  startedAt: string;
  finishedAt: string;
  totalAttempts: number;
  passedAttempts: number;
  tests: ReportTest[];
  healing: {
    totalEvents: number;
    healedAttempts: number;
    averageConfidence: number | null;
  };
  aiRecovery: {
    totalEvaluations: number;
    suggested: number;
    noCandidate: number;
    disabled: number;
    failed: number;
    evaluatedCandidates: number;
    averageConfidence: number | null;
  };
}

interface GeneratedDashboard {
  url: string;
  file: string;
  cleanup: () => void;
}

/**
 * Generate a standalone analytics dashboard
 * using an isolated temporary report.
 *
 * No live AI provider, network service,
 * or existing report files are required.
 */
function createDashboard(
  report: DashboardReport
): GeneratedDashboard {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-dashboard-")
  );

  const summary = path.join(directory, "summary.json");
  const html = path.join(directory, "analytics.html");
  const reliability = path.join(
    directory,
    "missing-history.json"
  );

  try {
    fs.writeFileSync(
      summary,
      JSON.stringify(report, null, 2),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [generator, summary, html, reliability],
      {
        encoding: "utf8",
        timeout: 15000,
      }
    );

    if (result.error || result.status !== 0) {
      throw new Error(
        result.error?.message ||
        result.stderr ||
        result.stdout ||
        "Analytics dashboard generation failed"
      );
    }

    if (!fs.existsSync(html)) {
      throw new Error(
        "Analytics dashboard HTML was not generated."
      );
    }

    return {
      url: pathToFileURL(html).href,
      file: html,
      cleanup: () => {
        fs.rmSync(directory, {
          recursive: true,
          force: true,
        });
      },
    };
  } catch (error) {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });

    throw error;
  }
}

/**
 * Build a controlled report fixture.
 *
 * withAI=true:
 *   One passing test with an AI suggestion.
 *
 * withAI=false:
 *   Empty report without AI events.
 */
function fixture(withAI = true): DashboardReport {
  const event: AIEvent = {
    event: "AI_RECOVERY_EVALUATED",
    timestamp: "2026-11-11T05:00:00Z",
    status: "SUGGESTED",
    provider: "mock",
    evaluatedCandidates: 3,
    confidence: 0.95,
    analytics: {
      acceptedCandidates: 1,
      rejectedCandidates: 1,
      notEvaluatedCandidates: 1,
      validationDurationMs: 120,
      rejectionReasons: {
        LOW_CONFIDENCE: 1,
      },
    },
  };

  const tests: ReportTest[] = withAI
    ? [
        {
          title: "Dashboard AI regression",
          project: "chromium",
          status: "passed",
          durationMs: 250,
          retry: 0,
          healingEvents: [],
          aiRecoveryEvents: [event],
        },
      ]
    : [];

  return {
    overallStatus: "passed",
    startedAt: "2026-11-11T05:00:00Z",
    finishedAt: "2026-11-11T05:01:00Z",

    totalAttempts: tests.length,
    passedAttempts: tests.length,

    tests,

    healing: {
      totalEvents: 0,
      healedAttempts: 0,
      averageConfidence: null,
    },

    aiRecovery: {
      totalEvaluations: withAI ? 1 : 0,
      suggested: withAI ? 1 : 0,
      noCandidate: 0,
      disabled: 0,
      failed: 0,
      evaluatedCandidates: withAI ? 3 : 0,
      averageConfidence: withAI ? 0.95 : null,
    },
  };
}

/**
 * DASH-001
 *
 * Verify actual browser-rendered decision KPIs.
 */
test(
  "DASH-001: renders AI decision metrics",
  async ({ page }) => {
    const dashboard = createDashboard(fixture());

    try {
      const errors: string[] = [];

      page.on("pageerror", error => {
        errors.push(error.message);
      });

      await page.goto(dashboard.url);

      await expect(
        page.locator("#total")
      ).toHaveText("1");

      await expect(
        page.locator("#passed")
      ).toHaveText("1");

      await expect(
        page.locator("#aiTotal")
      ).toHaveText("1");

      await expect(
        page.locator("#decisionAccepted")
      ).toHaveText("1");

      await expect(
        page.locator("#decisionRejected")
      ).toHaveText("1");

      await expect(
        page.locator("#decisionSkipped")
      ).toHaveText("1");

      await expect(
        page.locator("#decisionDuration")
      ).toHaveText("120.000 ms");

      await expect(
        page.locator("#decisionCoverage")
      ).toContainText("1 events with analytics");

      expect(errors).toEqual([]);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-002
 *
 * Verify browser-rendered charts.
 */
test(
  "DASH-002: renders candidate and rejection charts",
  async ({ page }) => {
    const dashboard = createDashboard(fixture());

    try {
      await page.goto(dashboard.url);

      await expect(
        page.locator("#decisionBars .barrow")
      ).toHaveCount(3);

      await expect(
        page.locator("#decisionBars")
      ).toContainText("Accepted");

      await expect(
        page.locator("#decisionBars")
      ).toContainText("Rejected");

      await expect(
        page.locator("#decisionBars")
      ).toContainText("Not evaluated");

      await expect(
        page.locator("#rejectionBars")
      ).toContainText("LOW_CONFIDENCE");

      await expect(
        page.locator("#rejectionBars .barrow")
      ).toHaveCount(1);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-003
 *
 * Verify graceful handling of empty reports.
 */
test(
  "DASH-003: handles an empty report",
  async ({ page }) => {
    const dashboard = createDashboard(fixture(false));

    try {
      const errors: string[] = [];

      page.on("pageerror", error => {
        errors.push(error.message);
      });

      await page.goto(dashboard.url);

      await expect(
        page.locator("#total")
      ).toHaveText("0");

      await expect(
        page.locator("#aiTotal")
      ).toHaveText("0");

      await expect(
        page.locator("#decisionCoverage")
      ).toHaveText(
        "No events with decision analytics"
      );

      await expect(
        page.locator("#decisionBars")
      ).toContainText(
        "No candidate decision data."
      );

      await expect(
        page.locator("#rejectionBars")
      ).toContainText(
        "No rejection reasons recorded."
      );

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(0);

      expect(errors).toEqual([]);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-004
 *
 * Verify interactive AI event filters.
 */
test(
  "DASH-004: filters AI recovery events",
  async ({ page }) => {
    const dashboard = createDashboard(fixture());

    try {
      await page.goto(dashboard.url);

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);

      await page
        .locator("#aiStatusFilter")
        .selectOption("FAILED");

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(0);

      await expect(
        page.locator("#aiEventEmpty")
      ).toBeVisible();

      await page
        .locator("#aiStatusFilter")
        .selectOption("SUGGESTED");

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);

      await page
        .locator("#aiSearch")
        .fill("not-existing-test");

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(0);

      await page
        .locator("#aiSearch")
        .clear();

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-005
 *
 * Verify untrusted text is rendered safely.
 */
test(
  "DASH-005: safely renders untrusted test names",
  async ({ page }) => {
    const report = fixture();

    const malicious =
      "<img src=x onerror=alert(1)>";

    report.tests[0].title = malicious;

    const dashboard = createDashboard(report);

    try {
      const dialogs: string[] = [];

      page.on("dialog", async dialog => {
        dialogs.push(dialog.message());
        await dialog.dismiss();
      });

      await page.goto(dashboard.url);

      await expect(
        page.locator("#aiEventsBody")
      ).toContainText(malicious);

      await expect(
        page.locator("#aiEventsBody img")
      ).toHaveCount(0);

      await expect(
        page.locator("#testsBody img")
      ).toHaveCount(0);

      expect(dialogs).toEqual([]);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-006
 *
 * Verify no runtime JavaScript exceptions
 * during dashboard interactions.
 */
test(
  "DASH-006: no JavaScript errors during interactions",
  async ({ page }) => {
    const dashboard = createDashboard(fixture());

    try {
      const errors: string[] = [];

      page.on("pageerror", error => {
        errors.push(error.message);
      });

      await page.goto(dashboard.url);

      await expect(
        page.locator("#decisionAccepted")
      ).toHaveText("1");

      await page
        .locator("#aiSearch")
        .fill("nonexistent-test");

      await expect(
        page.locator("#aiEventEmpty")
      ).toBeVisible();

      await page
        .locator("#aiSearch")
        .clear();

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);

      await page
        .locator("#aiBrowserFilter")
        .selectOption("chromium");

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);

      await page
        .locator("#testSearch")
        .fill("Dashboard");

      await expect(
        page.locator("#testsBody tr")
      ).toHaveCount(1);

      expect(errors).toEqual([]);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-007
 *
 * Verify sensitive internal fields are not
 * embedded into the generated HTML.
 */
test(
  "DASH-007: excludes private analytics fields",
  async ({ page }) => {
    const report = fixture();

    const secret =
      "PRIVATE_INTERNAL_TRACE_12345";

    const event =
      report.tests[0].aiRecoveryEvents[0];

    event.internalTrace = secret;

    if (!event.analytics) {
      throw new Error(
        "Expected AI analytics fixture."
      );
    }

    event.analytics.internalTrace = secret;

    const dashboard = createDashboard(report);

    try {
      const html = fs.readFileSync(
        dashboard.file,
        "utf8"
      );

      expect(html).not.toContain(secret);

      await page.goto(dashboard.url);

      await expect(
        page.locator("#decisionAccepted")
      ).toHaveText("1");

      expect(
        await page.content()
      ).not.toContain(secret);
    } finally {
      dashboard.cleanup();
    }
  }
);

/**
 * DASH-008
 *
 * Verify older AI events without decision
 * analytics remain compatible.
 */
test(
  "DASH-008: supports legacy AI events",
  async ({ page }) => {
    const report = fixture();

    const event =
      report.tests[0].aiRecoveryEvents[0];

    delete event.analytics;

    const dashboard = createDashboard(report);

    try {
      const errors: string[] = [];

      page.on("pageerror", error => {
        errors.push(error.message);
      });

      await page.goto(dashboard.url);

      await expect(
        page.locator("#aiTotal")
      ).toHaveText("1");

      await expect(
        page.locator("#decisionCoverage")
      ).toHaveText(
        "No events with decision analytics"
      );

      await expect(
        page.locator("#decisionBars")
      ).toContainText(
        "No candidate decision data."
      );

      await expect(
        page.locator("#aiEventsBody tr")
      ).toHaveCount(1);

      expect(errors).toEqual([]);
    } finally {
      dashboard.cleanup();
    }
  }
);
