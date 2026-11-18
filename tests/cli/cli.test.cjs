
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliPath = path.resolve(
  __dirname,
  "../../bin/autoheal.cjs"
);

function runCLI(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    shell: false,
    timeout: 15000,
    windowsHide: true,
  });
}

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
  assert.match(result.stdout, /^AutoHeal QA v\d+\.\d+\.\d+/);
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
  assert.match(result.stderr, /does not accept additional arguments/);
});

test("CLI-009: rejects extra version arguments", () => {
  const result = runCLI(["--version", "unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not accept additional arguments/);
});

test("CLI-010: rejects extra help arguments", () => {
  const result = runCLI(["--help", "unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not accept additional arguments/);
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
