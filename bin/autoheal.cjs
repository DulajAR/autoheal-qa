#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// -----------------------------------
// 1. Framework configuration
// -----------------------------------

const frameworkRoot = path.resolve(__dirname, "..");
const packagePath = path.join(frameworkRoot, "package.json");

const packageInfo = JSON.parse(
  fs.readFileSync(packagePath, "utf8")
);

// -----------------------------------
// 2. Project directory resolution
// -----------------------------------

function resolveProjectRoot(projectDirectory = process.cwd()) {
  if (
    typeof projectDirectory !== "string" ||
    projectDirectory.trim().length === 0
  ) {
    throw new Error(
      "Project directory must be a non-empty string."
    );
  }

  const resolvedPath = path.resolve(projectDirectory);

  let stats;

  try {
    stats = fs.statSync(resolvedPath);
  } catch {
    throw new Error(
      `Project directory does not exist: ${resolvedPath}`
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `Project path is not a directory: ${resolvedPath}`
    );
  }

  return resolvedPath;
}

// -----------------------------------
// 3. CLI help
// -----------------------------------

function printHelp() {
  console.log(`
AutoHeal QA v${packageInfo.version}
AI-Powered Self-Healing Test Automation Framework

USAGE:
  autoheal <command> [options]

COMMANDS:
  doctor              Check development environment
  help                Display available commands

OPTIONS:
  --project <path>    Project directory for doctor
  -h, --help          Show help information
  -v, --version       Show framework version

EXAMPLES:
  autoheal --help
  autoheal --version
  autoheal doctor
  autoheal doctor --project ./client-project
`);
}

// -----------------------------------
// 4. CLI version
// -----------------------------------

function printVersion() {
  console.log(`AutoHeal QA v${packageInfo.version}`);
}

// -----------------------------------
// 5. Cross-platform command execution
// -----------------------------------

function checkCommand(command, args = []) {
  let executable = command;
  let commandArgs = args;

  if (process.platform === "win32" && command === "npm") {
    const npmCliPath = path.resolve(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    );

    if (!fs.existsSync(npmCliPath)) {
      return {
        ok: false,
        value: "npm CLI not found",
      };
    }

    executable = process.execPath;
    commandArgs = [npmCliPath, ...args];
  }

  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    shell: false,
    timeout: 10000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      value: "Unavailable",
    };
  }

  return {
    ok: true,
    value: (result.stdout || "").trim(),
  };
}

// -----------------------------------
// 6. Playwright dependency detection
// -----------------------------------

function dependencyInstalled(projectDirectory) {
  const dependencyPath = path.join(
    projectDirectory,
    "node_modules",
    "@playwright",
    "test",
    "package.json"
  );

  return fs.existsSync(dependencyPath);
}

// -----------------------------------
// 7. AutoHeal reporter detection
// -----------------------------------

function reporterInstalled(projectDirectory) {
  // Support the original framework source layout.
  const sourceReporterPath = path.join(
    projectDirectory,
    "src",
    "reporters",
    "AutoHealReporter.ts"
  );

  if (fs.existsSync(sourceReporterPath)) {
    return true;
  }

  // Support an npm-installed AutoHeal QA package.
  const packageDirectory = path.join(
    projectDirectory,
    "node_modules",
    "autoheal-qa"
  );

  const packageJsonPath = path.join(
    packageDirectory,
    "package.json"
  );

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const installedPackage = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8")
    );

    if (installedPackage.name !== "autoheal-qa") {
      return false;
    }

    const reporterExport =
      installedPackage.exports?.["./reporter"];

    if (!reporterExport) {
      return false;
    }

    const reporterEntry =
      typeof reporterExport === "string"
        ? reporterExport
        : reporterExport.require ??
          reporterExport.default;

    if (typeof reporterEntry !== "string") {
      return false;
    }

    const resolvedEntry = path.resolve(
      packageDirectory,
      reporterEntry
    );

    const relativeEntry = path.relative(
      packageDirectory,
      resolvedEntry
    );

    // Reject paths that escape the installed package.
    if (
      relativeEntry === ".." ||
      relativeEntry.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeEntry)
    ) {
      return false;
    }

    return (
      fs.existsSync(resolvedEntry) &&
      fs.statSync(resolvedEntry).isFile()
    );
  } catch {
    return false;
  }
}

// -----------------------------------
// 8. Environment diagnostics
// -----------------------------------

function runDoctor(projectDirectory = process.cwd()) {
  let targetRoot;

  try {
    targetRoot = resolveProjectRoot(projectDirectory);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
    return false;
  }

  console.log(
    "\nAutoHeal QA - Environment Diagnostics\n"
  );

  console.log(`Project: ${targetRoot}\n`);

  let hasErrors = false;

  function report(label, passed, detail = "") {
    console.log(
      `${passed ? "PASS" : "FAIL"} ${label}${
        detail ? `: ${detail}` : ""
      }`
    );

    if (!passed) {
      hasErrors = true;
    }
  }

  // Node.js version check.
  const nodeMajor = Number(
    process.versions.node.split(".")[0]
  );

  report(
    "Node.js",
    nodeMajor >= 22,
    process.version
  );

  // npm availability check.
  const npm = checkCommand("npm", ["--version"]);

  report(
    "npm",
    npm.ok,
    npm.value
  );

  // Playwright dependency check.
  report(
    "Playwright dependency",
    dependencyInstalled(targetRoot)
  );

  // Playwright configuration check.
  const configCandidates = [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.cjs",
    "playwright.config.mts",
    "playwright.config.cts",
  ];

  const configExists = configCandidates.some(
    (name) =>
      fs.existsSync(
        path.join(targetRoot, name)
      )
  );

  report(
    "Playwright configuration",
    configExists
  );

  // Support source-based and npm-installed reporters.
  report(
    "AutoHeal reporter",
    reporterInstalled(targetRoot)
  );

  console.log("");

  if (hasErrors) {
    console.error(
      "AutoHeal QA: Environment checks failed."
    );

    process.exitCode = 1;
    return false;
  }

  console.log(
    "AutoHeal QA: Environment checks passed."
  );

  return true;
}

// -----------------------------------
// 9. CLI command routing
// -----------------------------------

function main(args = process.argv.slice(2)) {
  const command = args[0];

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    if (args.length > 1) {
      console.error(
        "Error: help does not accept additional arguments."
      );

      process.exitCode = 1;
      return;
    }

    printHelp();
    return;
  }

  if (
    command === "--version" ||
    command === "-v"
  ) {
    if (args.length > 1) {
      console.error(
        "Error: version does not accept additional arguments."
      );

      process.exitCode = 1;
      return;
    }

    printVersion();
    return;
  }

  if (command === "doctor") {
    if (args.length === 1) {
      runDoctor();
      return;
    }

    if (
      args.length === 3 &&
      args[1] === "--project" &&
      typeof args[2] === "string" &&
      args[2].trim().length > 0 &&
      !args[2].startsWith("--")
    ) {
      runDoctor(args[2]);
      return;
    }

    console.error(
      "Error: doctor does not accept additional arguments except --project <path>."
    );

    process.exitCode = 1;
    return;
  }

  console.error(`Unknown command: ${command}`);

  console.error(
    "Run 'autoheal --help' for available commands."
  );

  process.exitCode = 1;
}

// -----------------------------------
// 10. CLI execution
// -----------------------------------

if (require.main === module) {
  main();
}

// -----------------------------------
// 11. Public CLI module exports
// -----------------------------------

module.exports = {
  main,
  printHelp,
  printVersion,
  checkCommand,
  runDoctor,
  resolveProjectRoot,
  dependencyInstalled,
  reporterInstalled,
};
