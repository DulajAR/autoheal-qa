
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// --------------------------------------------
// 1. Integration test configuration
// --------------------------------------------

const cliPath = path.resolve(
  __dirname,
  "../../bin/autoheal.cjs"
);

const CONFIG_FILENAME = "playwright.config.cjs";

const STARTER_TEST_PATH = path.join(
  "tests",
  "autoheal.example.spec.cjs"
);

const DEFAULT_PACKAGE = {
  name: "autoheal-integration-consumer",
  version: "1.0.0",
  private: true,
  devDependencies: {
    "@playwright/test": "^1.64.1",
    "autoheal-qa": "1.0.0",
  },
};

// --------------------------------------------
// 2. Test utilities
// --------------------------------------------

function createTemporaryProject(
  t,
  packageInfo = DEFAULT_PACKAGE
) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autoheal-init-cli-")
  );

  t.after(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  if (packageInfo !== null) {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(packageInfo, null, 2),
      "utf8"
    );
  }

  return root;
}

function runCLI(args, cwd) {
  const result = spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd,
      encoding: "utf8",
      shell: false,
      timeout: 15000,
      windowsHide: true,
    }
  );

  assert.ifError(result.error);

  assert.equal(
    result.signal,
    null,
    "CLI process terminated unexpectedly"
  );

  return result;
}

function assertSuccessfulExecution(result) {
  assert.equal(
    result.status,
    0,
    `CLI execution failed:\n${result.stderr}`
  );
}

function assertFailedExecution(result, message) {
  assert.equal(
    result.status,
    1,
    `Expected CLI failure:\n${result.stdout}`
  );

  if (message) {
    assert.match(result.stderr, message);
  }
}

function assertGeneratedFiles(root) {
  const configPath = path.join(
    root,
    CONFIG_FILENAME
  );

  const starterPath = path.join(
    root,
    STARTER_TEST_PATH
  );

  assert.ok(
    fs.existsSync(configPath),
    "Playwright configuration was not created"
  );

  assert.ok(
    fs.existsSync(starterPath),
    "Starter test was not created"
  );

  assert.match(
    fs.readFileSync(configPath, "utf8"),
    /autoheal-qa\/reporter/
  );

  assert.match(
    fs.readFileSync(starterPath, "utf8"),
    /AutoHeal-QA starter test/
  );
}

function assertNoGeneratedFiles(root) {
  assert.equal(
    fs.existsSync(
      path.join(root, CONFIG_FILENAME)
    ),
    false
  );

  assert.equal(
    fs.existsSync(
      path.join(root, STARTER_TEST_PATH)
    ),
    false
  );
}

// --------------------------------------------
// 3. Successful initialization scenarios
// --------------------------------------------

test(
  "INIT-006: CLI initializes the current working directory",
  (t) => {
    const root = createTemporaryProject(t);

    const packagePath = path.join(
      root,
      "package.json"
    );

    const originalPackage = fs.readFileSync(
      packagePath
    );

    const result = runCLI(["init"], root);

    assertSuccessfulExecution(result);

    assert.match(
      result.stdout,
      /Initialization complete/
    );

    assertGeneratedFiles(root);

    assert.deepEqual(
      fs.readFileSync(packagePath),
      originalPackage,
      "Initialization modified package.json"
    );

    assert.equal(
      fs.existsSync(path.join(root, "node_modules")),
      false,
      "Initialization unexpectedly installed dependencies"
    );
  }
);

test(
  "INIT-007: CLI initializes an external project",
  (t) => {
    const callerRoot = createTemporaryProject(t);
    const targetRoot = createTemporaryProject(t);

    const result = runCLI(
      ["init", "--project", targetRoot],
      callerRoot
    );

    assertSuccessfulExecution(result);

    assert.match(
      result.stdout,
      /Initialization complete/
    );

    assertGeneratedFiles(targetRoot);

    assertNoGeneratedFiles(callerRoot);
  }
);

// --------------------------------------------
// 4. Non-destructive initialization
// --------------------------------------------

test(
  "INIT-008: repeated CLI initialization preserves existing files",
  (t) => {
    const root = createTemporaryProject(t);

    const firstResult = runCLI(
      ["init"],
      root
    );

    assertSuccessfulExecution(firstResult);

    assertGeneratedFiles(root);

    const configPath = path.join(
      root,
      CONFIG_FILENAME
    );

    const starterPath = path.join(
      root,
      STARTER_TEST_PATH
    );

    fs.writeFileSync(
      configPath,
      "// Custom Playwright configuration\n",
      "utf8"
    );

    fs.writeFileSync(
      starterPath,
      "// Custom starter test\n",
      "utf8"
    );

    const originalConfig = fs.readFileSync(
      configPath
    );

    const originalStarter = fs.readFileSync(
      starterPath
    );

    const secondResult = runCLI(
      ["init"],
      root
    );

    assertSuccessfulExecution(secondResult);

    assert.match(
      secondResult.stdout,
      /No new files created/
    );

    assert.deepEqual(
      fs.readFileSync(configPath),
      originalConfig,
      "Existing configuration was modified"
    );

    assert.deepEqual(
      fs.readFileSync(starterPath),
      originalStarter,
      "Existing starter test was modified"
    );
  }
);

// --------------------------------------------
// 5. CLI argument validation
// --------------------------------------------

test(
  "INIT-009: CLI rejects a missing project directory",
  (t) => {
    const root = createTemporaryProject(t);

    const missingDirectory = path.join(
      root,
      "non-existent-project"
    );

    const result = runCLI(
      ["init", "--project", missingDirectory],
      root
    );

    assertFailedExecution(
      result,
      /Project directory does not exist/
    );

    assert.equal(
      fs.existsSync(missingDirectory),
      false
    );

    assertNoGeneratedFiles(root);
  }
);

test(
  "INIT-010: CLI rejects an incomplete --project option",
  (t) => {
    const root = createTemporaryProject(t);

    const result = runCLI(
      ["init", "--project"],
      root
    );

    assertFailedExecution(result);

    assert.ok(
      result.stderr.trim().length > 0,
      "Expected an argument validation error"
    );

    assertNoGeneratedFiles(root);
  }
);

test(
  "INIT-011: CLI rejects unexpected arguments",
  (t) => {
    const root = createTemporaryProject(t);

    const result = runCLI(
      ["init", "unexpected-argument"],
      root
    );

    assertFailedExecution(result);

    assert.ok(
      result.stderr.trim().length > 0,
      "Expected an argument validation error"
    );

    assertNoGeneratedFiles(root);
  }
);

// --------------------------------------------
// 6. Project prerequisite validation
// --------------------------------------------

test(
  "INIT-012: CLI rejects a project without package.json",
  (t) => {
    const root = createTemporaryProject(
      t,
      null
    );

    const result = runCLI(
      ["init"],
      root
    );

    assertFailedExecution(
      result,
      /No package.json found/
    );

    assertNoGeneratedFiles(root);
  }
);

test(
  "INIT-013: CLI rejects missing Playwright dependency",
  (t) => {
    const root = createTemporaryProject(t, {
      name: "missing-playwright",
      version: "1.0.0",
      devDependencies: {
        "autoheal-qa": "1.0.0",
      },
    });

    const result = runCLI(
      ["init"],
      root
    );

    assertFailedExecution(
      result,
      /Missing @playwright\/test/
    );

    assertNoGeneratedFiles(root);
  }
);

test(
  "INIT-014: CLI rejects missing AutoHeal-QA dependency",
  (t) => {
    const root = createTemporaryProject(t, {
      name: "missing-autoheal",
      version: "1.0.0",
      devDependencies: {
        "@playwright/test": "^1.64.1",
      },
    });

    const result = runCLI(
      ["init"],
      root
    );

    assertFailedExecution(
      result,
      /Missing autoheal-qa dependency/
    );

    assertNoGeneratedFiles(root);
  }
);

// --------------------------------------------
// 7. Existing configuration compatibility
// --------------------------------------------

test(
  "INIT-015: CLI preserves existing TypeScript configuration",
  (t) => {
    const root = createTemporaryProject(t);

    const existingConfig = path.join(
      root,
      "playwright.config.ts"
    );

    const originalContent =
      "export default { testDir: './tests' };\n";

    fs.writeFileSync(
      existingConfig,
      originalContent,
      "utf8"
    );

    const result = runCLI(
      ["init"],
      root
    );

    assertSuccessfulExecution(result);

    assert.equal(
      fs.readFileSync(existingConfig, "utf8"),
      originalContent
    );

    assert.equal(
      fs.existsSync(
        path.join(root, CONFIG_FILENAME)
      ),
      false,
      "CLI created a conflicting configuration"
    );

    assert.ok(
      fs.existsSync(
        path.join(root, STARTER_TEST_PATH)
      ),
      "Starter test was not created"
    );
  }
);
