
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  initializeProject,
} = require("../../bin/init-project.cjs");

function createProject() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-init-")
  );

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "test-consumer",
      version: "1.0.0",
      devDependencies: {
        "@playwright/test": "^1.64.1",
        "autoheal-qa": "1.0.0",
      },
    })
  );

  return root;
}

test("INIT-001: creates starter files", (t) => {
  const root = createProject();

  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true })
  );

  const result = initializeProject(root);

  assert.equal(result.created.length, 2);

  assert.ok(
    fs.existsSync(
      path.join(root, "playwright.config.cjs")
    )
  );

  assert.ok(
    fs.existsSync(
      path.join(root, "tests", "autoheal.example.spec.cjs")
    )
  );
});

test("INIT-002: does not overwrite existing files", (t) => {
  const root = createProject();

  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true })
  );

  initializeProject(root);

  const config = path.join(
    root,
    "playwright.config.cjs"
  );

  fs.writeFileSync(config, "// custom config");

  const result = initializeProject(root);

  assert.equal(
    fs.readFileSync(config, "utf8"),
    "// custom config"
  );

  assert.equal(result.created.length, 0);
});

test("INIT-003: requires package.json", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-empty-")
  );

  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true })
  );

  assert.throws(
    () => initializeProject(root),
    /No package.json found/
  );
});

test("INIT-004: requires Playwright", (t) => {
  const root = createProject();

  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true })
  );

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        "autoheal-qa": "1.0.0",
      },
    })
  );

  assert.throws(
    () => initializeProject(root),
    /Missing @playwright\/test/
  );
});

test("INIT-005: requires AutoHeal-QA", (t) => {
  const root = createProject();

  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true })
  );

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      devDependencies: {
        "@playwright/test": "^1.64.1",
      },
    })
  );

  assert.throws(
    () => initializeProject(root),
    /Missing autoheal-qa dependency/
  );
});
