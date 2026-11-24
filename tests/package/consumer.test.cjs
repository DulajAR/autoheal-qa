"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
// --------------------------------------------
// 1. Package integration configuration
// --------------------------------------------
const frameworkRoot = path.resolve(
  __dirname,
  "../.."
);
const frameworkPackage = JSON.parse(
  fs.readFileSync(
    path.join(frameworkRoot, "package.json"),
    "utf8"
  )
);
const playwrightVersion = JSON.parse(
  fs.readFileSync(
    path.join(
      frameworkRoot,
      "node_modules",
      "@playwright",
      "test",
      "package.json"
    ),
    "utf8"
  )
).version;
const COMMAND_TIMEOUT = 300000;
// --------------------------------------------
// 2. Process execution utilities
// --------------------------------------------
function runNode(args, cwd) {
  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: COMMAND_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  assert.ifError(result.error);
  assert.equal(
    result.signal,
    null,
    "Process terminated unexpectedly"
  );
  return result;
}
function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  assert.ok(
    npmCli && fs.existsSync(npmCli),
    "Run this suite using npm run test:package"
  );
  return runNode(
    [npmCli, ...args],
    cwd
  );
}
function assertSuccess(result, description) {
  assert.equal(
    result.status,
    0,
    [
      description,
      `Exit code: ${result.status}`,
      `STDOUT:\n${result.stdout}`,
      `STDERR:\n${result.stderr}`,
    ].join("\n")
  );
}
// --------------------------------------------
// 3. Temporary workspace management
// --------------------------------------------
function createWorkspace(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-package-")
  );
  t.after(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  });
  const archiveDirectory = path.join(
    root,
    "archives"
  );
  const consumerDirectory = path.join(
    root,
    "consumer"
  );
  fs.mkdirSync(archiveDirectory);
  fs.mkdirSync(consumerDirectory);
  return {
    root,
    archiveDirectory,
    consumerDirectory,
  };
}
// --------------------------------------------
// 4. Build and package the framework
// --------------------------------------------
function createPackageArchive(archiveDirectory) {
  const result = runNpm(
    [
      "pack",
      "--pack-destination",
      archiveDirectory,
    ],
    frameworkRoot
  );
  assertSuccess(
    result,
    "Unable to create npm package archive"
  );
  const archives = fs
    .readdirSync(archiveDirectory)
    .filter((filename) =>
      filename.endsWith(".tgz")
    );
  assert.equal(
    archives.length,
    1,
    "Expected exactly one npm archive"
  );
  const archivePath = path.join(
    archiveDirectory,
    archives[0]
  );
  assert.ok(
    fs.statSync(archivePath).size > 0,
    "Generated package archive is empty"
  );
  return archivePath;
}
// --------------------------------------------
// 5. Independent consumer installation
// --------------------------------------------
function installConsumer(
  consumerDirectory,
  archivePath
) {
  const packagePath = path.join(
    consumerDirectory,
    "package.json"
  );
  fs.writeFileSync(
    packagePath,
    JSON.stringify(
      {
        name: "autoheal-package-consumer",
        version: "1.0.0",
        private: true,
      },
      null,
      2
    ),
    "utf8"
  );
  const result = runNpm(
    [
      "install",
      "--save-dev",
      "--save-exact",
      "--no-audit",
      "--no-fund",
      `@playwright/test@${playwrightVersion}`,
      archivePath,
    ],
    consumerDirectory
  );
  assertSuccess(
    result,
    "Consumer dependency installation failed"
  );
  const installedPackageRoot = path.join(
    consumerDirectory,
    "node_modules",
    "autoheal-qa"
  );
  assert.ok(
    fs.existsSync(installedPackageRoot),
    "AutoHeal-QA was not installed"
  );
  const installedPackage = JSON.parse(
    fs.readFileSync(
      path.join(
        installedPackageRoot,
        "package.json"
      ),
      "utf8"
    )
  );
  assert.equal(
    installedPackage.name,
    frameworkPackage.name
  );
  assert.equal(
    installedPackage.version,
    frameworkPackage.version
  );
  return installedPackageRoot;
}
// --------------------------------------------
// 6. Installed package CLI execution
// --------------------------------------------
function runInstalledCLI(
  installedPackageRoot,
  consumerDirectory,
  args
) {
  const cliPath = path.join(
    installedPackageRoot,
    "bin",
    "autoheal.cjs"
  );
  assert.ok(
    fs.existsSync(cliPath),
    "Installed CLI entry point is missing"
  );
  return runNode(
    [cliPath, ...args],
    consumerDirectory
  );
}
// --------------------------------------------
// 7. End-to-end package integration
// --------------------------------------------
test(
  "PKG-001: installed npm package supports the complete consumer lifecycle",
  { timeout: 900000 },
  async (t) => {
    const workspace = createWorkspace(t);
    const consumer = workspace.consumerDirectory;
    let archivePath;
    let installedPackageRoot;
    // ----------------------------------------
    // 7.1 Generate npm package archive
    // ----------------------------------------
    await t.test(
      "PKG-002: builds a distributable npm archive",
      () => {
        archivePath = createPackageArchive(
          workspace.archiveDirectory
        );
        assert.ok(
          fs.existsSync(archivePath)
        );
      }
    );
    if (!archivePath) {
      return;
    }
    // ----------------------------------------
    // 7.2 Install into independent project
    // ----------------------------------------
    await t.test(
      "PKG-003: installs into an isolated consumer project",
      () => {
        installedPackageRoot = installConsumer(
          consumer,
          archivePath
        );
      }
    );
    if (!installedPackageRoot) {
      return;
    }
    // ----------------------------------------
    // 7.3 Verify public API exports
    // ----------------------------------------
    await t.test(
      "PKG-004: exposes the public framework API",
      () => {
        const result = runNode(
          [
            "-e",
            `
              const assert = require("node:assert/strict");
              const api = require("autoheal-qa");
              for (const name of [
                "createSelfHealingRuntime",
                "loadAIRuntimeConfig",
                "PolicyEnforcedSelfHealingLocator",
                "SelfHealingLocator"
              ]) {
                assert.equal(
                  typeof api[name],
                  "function",
                  "Missing public API: " + name
                );
              }
              assert.ok(
                require.resolve("autoheal-qa/reporter")
              );
              console.log("Public API verified");
            `,
          ],
          consumer
        );
        assertSuccess(
          result,
          "Public API verification failed"
        );
      }
    );
    // ----------------------------------------
    // 7.4 Verify installed CLI version
    // ----------------------------------------
    await t.test(
      "PKG-005: installed CLI reports the correct version",
      () => {
        const result = runInstalledCLI(
          installedPackageRoot,
          consumer,
          ["--version"]
        );
        assertSuccess(
          result,
          "Installed CLI version check failed"
        );
        assert.ok(
          result.stdout.includes(
            frameworkPackage.version
          )
        );
      }
    );
    // ----------------------------------------
    // 7.5 Initialize consumer project
    // ----------------------------------------
    const configPath = path.join(
      consumer,
      "playwright.config.cjs"
    );
    const starterPath = path.join(
      consumer,
      "tests",
      "autoheal.example.spec.cjs"
    );
    await t.test(
      "PKG-006: installed CLI initializes Playwright",
      () => {
        const result = runInstalledCLI(
          installedPackageRoot,
          consumer,
          ["init"]
        );
        assertSuccess(
          result,
          "Consumer initialization failed"
        );
        assert.match(
          result.stdout,
          /Initialization complete/
        );
        assert.ok(fs.existsSync(configPath));
        assert.ok(fs.existsSync(starterPath));
        assert.match(
          fs.readFileSync(configPath, "utf8"),
          /autoheal-qa\/reporter/
        );
      }
    );
    // ----------------------------------------
    // 7.6 Validate environment
    // ----------------------------------------
    await t.test(
      "PKG-007: initialized consumer passes diagnostics",
      () => {
        const result = runInstalledCLI(
          installedPackageRoot,
          consumer,
          ["doctor"]
        );
        assertSuccess(
          result,
          "Consumer diagnostics failed"
        );
        assert.match(
          result.stdout,
          /Environment checks passed/
        );
        assert.match(
          result.stdout,
          /PASS AutoHeal reporter/
        );
      }
    );
    // ----------------------------------------
    // 7.7 Execute generated starter test
    // ----------------------------------------
    await t.test(
      "PKG-008: generated starter test passes in Chromium",
      () => {
        const playwrightCli = path.join(
          consumer,
          "node_modules",
          "@playwright",
          "test",
          "cli.js"
        );
        const result = runNode(
          [
            playwrightCli,
            "test",
            "--config=playwright.config.cjs",
            "--workers=1",
          ],
          consumer
        );
        assertSuccess(
          result,
          "Consumer Playwright execution failed"
        );
        assert.match(
          result.stdout,
          /1 passed/
        );
      }
    );
    // ----------------------------------------
    // 7.8 Validate generated report
    // ----------------------------------------
    await t.test(
      "PKG-009: installed reporter generates valid execution metrics",
      () => {
        const reportPath = path.join(
          consumer,
          "reports",
          "autoheal",
          "summary.json"
        );
        assert.ok(
          fs.existsSync(reportPath),
          "AutoHeal report was not generated"
        );
        const report = JSON.parse(
          fs.readFileSync(reportPath, "utf8")
        );
        assert.equal(report.totalAttempts, 1);
        assert.equal(report.passedAttempts, 1);
        assert.equal(report.failedAttempts, 0);
        assert.equal(
          report.healing?.totalEvents,
          0
        );
        assert.equal(
          report.aiRecovery?.totalEvaluations,
          0
        );
      }
    );
    // ----------------------------------------
    // 7.9 Verify non-destructive initialization
    // ----------------------------------------
    await t.test(
      "PKG-010: repeated initialization preserves generated files",
      () => {
        const originalConfig = fs.readFileSync(
          configPath
        );
        const originalStarter = fs.readFileSync(
          starterPath
        );
        const originalPackage = fs.readFileSync(
          path.join(consumer, "package.json")
        );
        const result = runInstalledCLI(
          installedPackageRoot,
          consumer,
          ["init"]
        );
        assertSuccess(
          result,
          "Repeated initialization failed"
        );
        assert.match(
          result.stdout,
          /No new files created/
        );
        assert.deepEqual(
          fs.readFileSync(configPath),
          originalConfig
        );
        assert.deepEqual(
          fs.readFileSync(starterPath),
          originalStarter
        );
        assert.deepEqual(
          fs.readFileSync(
            path.join(consumer, "package.json")
          ),
          originalPackage
        );
      }
    );

    // 7.10 Verify npm executable integration
    await t.test("PKG-011: npm executes the installed CLI", () => {
      const shimName = process.platform === "win32" ? "autoheal.cmd" : "autoheal";
      assert.ok(fs.existsSync(path.join(consumer, "node_modules", ".bin", shimName)));
      const result = runNpm(["exec", "--offline", "--", "autoheal", "--version"], consumer);
      assertSuccess(result, "Installed npm executable failed");
      assert.ok(result.stdout.includes(frameworkPackage.version));
    });

    // 7.11 Installed-package recovery scenarios
    const reportPath = path.join(consumer, "reports", "autoheal", "summary.json");
    await t.test("PKG-019: installed package passes recovery scenarios", () => {
      const fixtureName = "consumer-healing.spec.cjs";
      fs.copyFileSync(path.join(__dirname, "fixtures", fixtureName), path.join(consumer, "tests", fixtureName));
      // Remove the starter report so stale output cannot satisfy validation.
      fs.rmSync(reportPath, { force: true });
      const playwrightCli = path.join(consumer, "node_modules", "@playwright", "test", "cli.js");
      const result = runNode([playwrightCli, "test", fixtureName, "--config=playwright.config.cjs", "--workers=1", "--retries=0"], consumer);
      assertSuccess(result, "Installed-package recovery tests failed");
      assert.match(result.stdout, /\b7 passed\b/);
      console.log(result.stdout);
    });

    // 7.12 Validate recovery report
    await t.test("PKG-020: installed reporter records recovery accurately", () => {
      assert.ok(fs.existsSync(reportPath), "Recovery report is missing");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const { validateReport } = require("../../scripts/validate-healing-report.cjs");
      validateReport(report);
      assert.equal(report.framework, "AutoHeal QA");
      assert.equal(report.totalAttempts, 7);
      assert.equal(report.passedAttempts, 7);
      for (const key of ["failedAttempts", "skippedAttempts", "timedOutAttempts", "interruptedAttempts"]) {
        assert.equal(report[key], 0, key);
      }
      assert.equal(report.tests.length, 7);
      assert.equal(report.healing.totalEvents, 1);
      assert.equal(report.healing.healedAttempts, 1);
      assert.equal(report.aiRecovery.totalEvaluations, 1);
      assert.equal(report.aiRecovery.suggested, 1);
      assert.equal(report.aiRecovery.failed, 0);
      const expectedIds = Array.from({ length: 7 }, (_, index) => `PKG-${String(index + 12).padStart(3, "0")}`);
      const testById = new Map();
      for (const entry of report.tests) {
        const matches = entry.title.match(/\bPKG-\d{3}\b/g);
        assert.ok(matches && matches.length === 1, `Invalid package test title: ${entry.title}`);
        const id = matches[0];
        assert.ok(!testById.has(id), `Duplicate package test ID: ${id}`);
        assert.equal(entry.status, "passed");
        assert.equal(entry.retry, 0);
        testById.set(id, entry);
      }
      assert.deepEqual([...testById.keys()].sort(), expectedIds);
      for (const [id, entry] of testById) {
        assert.equal(entry.healingEvents.length, id === "PKG-013" ? 1 : 0, `Unexpected healing events: ${id}`);
        assert.equal(entry.aiRecoveryEvents.length, id === "PKG-017" ? 1 : 0, `Unexpected AI recovery events: ${id}`);
      }
      const event = testById.get("PKG-013").healingEvents[0];
      assert.equal(event.event, "LOCATOR_HEALED");
      assert.equal(event.primarySelector, "#missing-button");
      assert.equal(event.recoveredSelector, "#submit-button");
      assert.equal(event.strategy, "trusted-submit-fallback");
      assert.equal(event.confidence, 0.95);
      assert.equal(testById.get("PKG-017").aiRecoveryEvents[0].status, "SUGGESTED");
      console.log("[AutoHeal QA] Installed-package recovery report validated");
      console.log("Recovery scenarios: 7/7");
      console.log("Healing events: 1");
      console.log("AI evaluations: 1");
      console.log("AI suggestions: 1");
      console.log("Automatic AI healing: 0");
    });
  }
);
