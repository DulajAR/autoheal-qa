
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  resolveProjectRoot,
  reporterInstalled,
} = require("../../bin/autoheal.cjs");

// -----------------------------------
// 1. CLI configuration
// -----------------------------------

const cliPath = path.resolve(
  __dirname,
  "../../bin/autoheal.cjs"
);

const frameworkRoot = path.resolve(__dirname, "../..");

function runCLI(args = [], options = {}) {
  return spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      encoding: "utf8",
      shell: false,
      timeout: 15000,
      windowsHide: true,
      ...options,
    }
  );
}

function createTemporaryProject() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-cli-project-")
  );
}

function removeTemporaryProject(directory) {
  fs.rmSync(directory, {
    recursive: true,
    force: true,
  });
}

function createConfiguredProject(directory) {
  const playwrightDirectory = path.join(
    directory,
    "node_modules",
    "@playwright",
    "test"
  );

  const reporterDirectory = path.join(
    directory,
    "src",
    "reporters"
  );

  fs.mkdirSync(playwrightDirectory, {
    recursive: true,
  });

  fs.mkdirSync(reporterDirectory, {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(playwrightDirectory, "package.json"),
    JSON.stringify({
      name: "@playwright/test",
      version: "1.0.0",
    })
  );

  fs.writeFileSync(
    path.join(directory, "playwright.config.ts"),
    "export default {};\n"
  );

  fs.writeFileSync(
    path.join(reporterDirectory, "AutoHealReporter.ts"),
    "export class AutoHealReporter {}\n"
  );
}

function createInstalledReporter(directory, reporterEntry = "./dist/src/reporter.js") {
  const packageDirectory = path.join(
    directory,
    "node_modules",
    "autoheal-qa"
  );

  fs.mkdirSync(packageDirectory, {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({
      name: "autoheal-qa",
      version: "1.0.0",
      exports: {
        "./reporter": {
          require: reporterEntry,
        },
      },
    })
  );

  return packageDirectory;
}

// -----------------------------------
// 2. Existing CLI regression tests
// -----------------------------------

test("CLI-001: displays help with no arguments", () => {
  const result = runCLI();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /AutoHeal QA v/);
  assert.match(result.stdout, /USAGE:/);
  assert.match(result.stdout, /doctor/);
});

test("CLI-002: supports --help", () => {
  const result = runCLI(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /COMMANDS:/);
});

test("CLI-003: supports -h", () => {
  const result = runCLI(["-h"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /USAGE:/);
});

test("CLI-004: supports help command", () => {
  const result = runCLI(["help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /OPTIONS:/);
});

test("CLI-005: displays framework version", () => {
  const result = runCLI(["--version"]);

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /^AutoHeal QA v\d+\.\d+\.\d+/
  );
});

test("CLI-006: supports short version flag", () => {
  const result = runCLI(["-v"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /AutoHeal QA v/);
});

test("CLI-007: rejects unknown commands", () => {
  const result = runCLI(["unknown-command"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
});

test("CLI-008: rejects extra doctor arguments", () => {
  const result = runCLI(["doctor", "unexpected"]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /does not accept additional arguments/
  );
});

test("CLI-009: rejects extra version arguments", () => {
  const result = runCLI(["--version", "unexpected"]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /does not accept additional arguments/
  );
});

test("CLI-010: rejects extra help arguments", () => {
  const result = runCLI(["--help", "unexpected"]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /does not accept additional arguments/
  );
});

test("CLI-011: doctor displays environment diagnostics", () => {
  const result = runCLI(["doctor"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Environment Diagnostics/);
  assert.match(result.stdout, /Node.js:/);
  assert.match(result.stdout, /npm:/);
  assert.match(result.stdout, /Playwright dependency/);
  assert.match(result.stdout, /Environment checks passed/);
});

test("CLI-012: doctor does not emit DEP0190 warning", () => {
  const result = runCLI(["doctor"]);

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /DEP0190/);
});

// -----------------------------------
// 3. Project directory resolution
// -----------------------------------

test("CLI-013: resolves the current working directory", () => {
  assert.equal(
    resolveProjectRoot(),
    path.resolve(process.cwd())
  );
});

test("CLI-014: resolves an external project directory", () => {
  const directory = createTemporaryProject();

  try {
    assert.equal(
      resolveProjectRoot(directory),
      path.resolve(directory)
    );
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-015: rejects missing project directories", () => {
  const directory = createTemporaryProject();

  removeTemporaryProject(directory);

  assert.throws(
    () => resolveProjectRoot(directory),
    /Project directory does not exist/
  );
});

test("CLI-016: rejects file paths", () => {
  assert.throws(
    () => resolveProjectRoot(__filename),
    /Project path is not a directory/
  );
});

test("CLI-017: rejects empty directory arguments", () => {
  assert.throws(
    () => resolveProjectRoot(""),
    /Project directory must be a non-empty string/
  );
});

// -----------------------------------
// 4. External project diagnostics
// -----------------------------------

test("CLI-018: help documents the --project option", () => {
  const result = runCLI(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--project/);
});

test("CLI-019: doctor accepts the framework directory", () => {
  const result = runCLI([
    "doctor",
    "--project",
    frameworkRoot,
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Environment checks passed/);
  assert.match(result.stdout, /PASS Playwright dependency/);
  assert.match(result.stdout, /PASS AutoHeal reporter/);
});

test("CLI-020: doctor detects an unconfigured external project", () => {
  const directory = createTemporaryProject();

  try {
    const result = runCLI([
      "doctor",
      "--project",
      directory,
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL Playwright dependency/);
    assert.match(result.stdout, /FAIL Playwright configuration/);
    assert.match(result.stdout, /FAIL AutoHeal reporter/);
    assert.match(result.stderr, /Environment checks failed/);
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-021: doctor accepts a configured external project", () => {
  const directory = createTemporaryProject();

  try {
    createConfiguredProject(directory);

    const result = runCLI([
      "doctor",
      "--project",
      directory,
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /PASS Playwright dependency/);
    assert.match(result.stdout, /PASS Playwright configuration/);
    assert.match(result.stdout, /PASS AutoHeal reporter/);
    assert.match(result.stdout, /Environment checks passed/);
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-022: doctor rejects a missing external project", () => {
  const directory = createTemporaryProject();

  removeTemporaryProject(directory);

  const result = runCLI([
    "doctor",
    "--project",
    directory,
  ]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Project directory does not exist/
  );
});

test("CLI-023: doctor rejects an incomplete --project option", () => {
  const result = runCLI([
    "doctor",
    "--project",
  ]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /does not accept additional arguments/
  );
});

// -----------------------------------
// 5. npm-installed reporter detection
// -----------------------------------

test("CLI-024: detects installed npm reporter", () => {
  const directory = createTemporaryProject();

  try {
    const packageDirectory = createInstalledReporter(directory);

    const reporterDirectory = path.join(
      packageDirectory,
      "dist",
      "src"
    );

    fs.mkdirSync(reporterDirectory, {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(reporterDirectory, "reporter.js"),
      "module.exports = class AutoHealReporter {};\n"
    );

    assert.equal(reporterInstalled(directory), true);
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-025: rejects missing npm reporter entry", () => {
  const directory = createTemporaryProject();

  try {
    createInstalledReporter(directory);

    assert.equal(reporterInstalled(directory), false);
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-026: rejects reporter paths outside package", () => {
  const directory = createTemporaryProject();

  try {
    createInstalledReporter(
      directory,
      "../../../outside.js"
    );

    assert.equal(reporterInstalled(directory), false);
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-027: preserves source reporter support", () => {
  const directory = createTemporaryProject();

  try {
    createConfiguredProject(directory);

    assert.equal(reporterInstalled(directory), true);
  } finally {
    removeTemporaryProject(directory);
  }
});

// -----------------------------------
// 6. Default project directory behavior
// -----------------------------------

test("CLI-028: doctor defaults to the current working directory", () => {
  const directory = createTemporaryProject();

  try {
    createConfiguredProject(directory);

    const result = runCLI(["doctor"], {
      cwd: directory,
    });

    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /Environment checks passed/
    );

    assert.ok(
      result.stdout.includes(`Project: ${directory}`)
    );
  } finally {
    removeTemporaryProject(directory);
  }
});

test("CLI-029: doctor rejects an unconfigured current directory", () => {
  const directory = createTemporaryProject();

  try {
    const result = runCLI(["doctor"], {
      cwd: directory,
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /FAIL Playwright dependency/
    );
    assert.match(
      result.stdout,
      /FAIL Playwright configuration/
    );
    assert.match(
      result.stdout,
      /FAIL AutoHeal reporter/
    );
  } finally {
    removeTemporaryProject(directory);
  }
});
