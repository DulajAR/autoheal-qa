#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// -----------------------------------
// 1. Project configuration
// -----------------------------------

const projectRoot = path.resolve(__dirname, "..");
const packagePath = path.join(projectRoot, "package.json");

const packageInfo = JSON.parse(
  fs.readFileSync(packagePath, "utf8")
);

// -----------------------------------
// 2. CLI help
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
  -h, --help          Show help information
  -v, --version       Show framework version

EXAMPLES:
  autoheal --help
  autoheal --version
  autoheal doctor
`);
}

// -----------------------------------
// 3. Framework version
// -----------------------------------

function printVersion() {
  console.log(`AutoHeal QA v${packageInfo.version}`);
}

// -----------------------------------
// 4. External command execution
// -----------------------------------

function checkCommand(command, args = []) {
  let executable = command;
  let commandArgs = args;

  if (process.platform === "win32" && command === "npm") {
    // Locate npm's JavaScript CLI next to Node.js.
    // This avoids shell: true and the DEP0190 warning.
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
// 5. Environment diagnostics
// -----------------------------------

function runDoctor() {
  console.log("\nAutoHeal QA - Environment Diagnostics\n");

  let hasErrors = false;

  // Check Node.js version
  const nodeMajor = Number(
    process.versions.node.split(".")[0]
  );

  const nodeOk = nodeMajor >= 22;

  console.log(
    `${nodeOk ? "PASS" : "FAIL"} Node.js: ${process.version}`
  );

  if (!nodeOk) {
    hasErrors = true;
  }

  // Check npm installation
  const npm = checkCommand("npm", ["--version"]);

  console.log(
    `${npm.ok ? "PASS" : "FAIL"} npm: ${npm.value}`
  );

  if (!npm.ok) {
    hasErrors = true;
  }

  // Check Playwright dependency
  const playwrightPath = path.join(
    projectRoot,
    "node_modules",
    "@playwright",
    "test"
  );

  const playwrightInstalled = fs.existsSync(
    playwrightPath
  );

  console.log(
    `${playwrightInstalled ? "PASS" : "FAIL"} Playwright dependency`
  );

  if (!playwrightInstalled) {
    hasErrors = true;
  }

  // Check Playwright configuration
  const configPath = path.join(
    projectRoot,
    "playwright.config.ts"
  );

  const configExists = fs.existsSync(configPath);

  console.log(
    `${configExists ? "PASS" : "FAIL"} Playwright configuration`
  );

  if (!configExists) {
    hasErrors = true;
  }

  // Check AutoHeal reporter
  const reporterPath = path.join(
    projectRoot,
    "src",
    "reporters",
    "AutoHealReporter.ts"
  );

  const reporterExists = fs.existsSync(
    reporterPath
  );

  console.log(
    `${reporterExists ? "PASS" : "FAIL"} AutoHeal reporter`
  );

  if (!reporterExists) {
    hasErrors = true;
  }

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
// 6. CLI command handler
// -----------------------------------

function main(args = process.argv.slice(2)) {
  const command = args[0];

  // Help command
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

  // Version command
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

  // Doctor command
  if (command === "doctor") {
    if (args.length > 1) {
      console.error(
        "Error: doctor does not accept additional arguments."
      );

      process.exitCode = 1;
      return;
    }

    runDoctor();
    return;
  }

  // Unknown command
  console.error(
    `Unknown command: ${command}`
  );

  console.error(
    "Run 'autoheal --help' for available commands."
  );

  process.exitCode = 1;
}

// -----------------------------------
// 7. CLI entry point
// -----------------------------------

if (require.main === module) {
  main();
}

// -----------------------------------
// 8. Exports for automated tests
// -----------------------------------

module.exports = {
  main,
  printHelp,
  printVersion,
  checkCommand,
  runDoctor,
};
