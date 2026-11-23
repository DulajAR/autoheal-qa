
"use strict";

const fs = require("node:fs");
const path = require("node:path");

// --------------------------------------------
// 1. Supported Playwright configuration files
// --------------------------------------------

const CONFIG_FILES = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
  "playwright.config.mts",
  "playwright.config.cts",
];

// --------------------------------------------
// 2. Playwright configuration template
// --------------------------------------------

const CONFIG_TEMPLATE = `"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",

  fullyParallel: true,

  use: {
    browserName: "chromium",
    headless: true,
    trace: "on-first-retry",
  },

  reporter: [
    ["list"],
    ["autoheal-qa/reporter"],
  ],
});
`;

// --------------------------------------------
// 3. Starter Playwright test template
// --------------------------------------------

const TEST_TEMPLATE = `"use strict";

const { test, expect } = require("@playwright/test");

test("AutoHeal-QA starter test", async ({ page }) => {
  await page.setContent(
    "<main><h1>AutoHeal-QA is ready</h1></main>"
  );

  await expect(
    page.getByRole("heading", {
      name: "AutoHeal-QA is ready",
    })
  ).toBeVisible();
});
`;

// --------------------------------------------
// 4. Validate project directory
// --------------------------------------------

function validateProjectDirectory(projectRoot) {
  if (
    typeof projectRoot !== "string" ||
    projectRoot.trim().length === 0
  ) {
    throw new Error(
      "Project directory must be a non-empty string."
    );
  }

  const root = path.resolve(projectRoot);

  let stats;

  try {
    stats = fs.statSync(root);
  } catch {
    throw new Error(
      `Project directory does not exist: ${root}`
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `Project path is not a directory: ${root}`
    );
  }

  return root;
}

// --------------------------------------------
// 5. Read and validate package.json
// --------------------------------------------

function readProjectPackage(root) {
  const packagePath = path.join(root, "package.json");

  if (!fs.existsSync(packagePath)) {
    throw new Error(
      "No package.json found. Run npm init -y first."
    );
  }

  let packageInfo;

  try {
    packageInfo = JSON.parse(
      fs.readFileSync(packagePath, "utf8")
    );
  } catch {
    throw new Error(
      "Unable to read package.json. Ensure it contains valid JSON."
    );
  }

  if (
    !packageInfo ||
    typeof packageInfo !== "object" ||
    Array.isArray(packageInfo)
  ) {
    throw new Error(
      "package.json must contain a JSON object."
    );
  }

  return packageInfo;
}

// --------------------------------------------
// 6. Validate project dependencies
// --------------------------------------------

function validateDependencies(packageInfo) {
  const dependencies = {
    ...packageInfo.dependencies,
    ...packageInfo.devDependencies,
  };

  if (!dependencies["@playwright/test"]) {
    throw new Error(
      "Missing @playwright/test. Install it with: npm install -D @playwright/test"
    );
  }

  if (!dependencies["autoheal-qa"]) {
    throw new Error(
      "Missing autoheal-qa dependency. Install AutoHeal-QA before initialization."
    );
  }

  return true;
}

// --------------------------------------------
// 7. Detect existing Playwright configuration
// --------------------------------------------

function findExistingConfig(root) {
  return CONFIG_FILES.find((filename) =>
    fs.existsSync(path.join(root, filename))
  );
}

// --------------------------------------------
// 8. Safely create a file
// --------------------------------------------

function createFileSafely(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, {
      encoding: "utf8",
      flag: "wx",
    });

    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

// --------------------------------------------
// 9. Initialize AutoHeal-QA project
// --------------------------------------------

function initializeProject(projectRoot = process.cwd()) {
  const root = validateProjectDirectory(projectRoot);

  const packageInfo = readProjectPackage(root);

  validateDependencies(packageInfo);

  const created = [];
  const skipped = [];

  // ------------------------------------------
  // 9.1 Create Playwright configuration
  // ------------------------------------------

  const existingConfig = findExistingConfig(root);

  if (existingConfig) {
    skipped.push(
      `Playwright configuration already exists: ${existingConfig}`
    );
  } else {
    const configPath = path.join(
      root,
      "playwright.config.cjs"
    );

    const configCreated = createFileSafely(
      configPath,
      CONFIG_TEMPLATE
    );

    if (configCreated) {
      created.push("playwright.config.cjs");
    } else {
      skipped.push("playwright.config.cjs");
    }
  }

  // ------------------------------------------
  // 9.2 Prepare tests directory
  // ------------------------------------------

  const testsDirectory = path.join(root, "tests");

  if (!fs.existsSync(testsDirectory)) {
    fs.mkdirSync(testsDirectory, {
      recursive: true,
    });
  } else if (!fs.statSync(testsDirectory).isDirectory()) {
    throw new Error(
      "Cannot initialize tests: 'tests' exists but is not a directory."
    );
  }

  // ------------------------------------------
  // 9.3 Create starter test
  // ------------------------------------------

  const testPath = path.join(
    testsDirectory,
    "autoheal.example.spec.cjs"
  );

  const testCreated = createFileSafely(
    testPath,
    TEST_TEMPLATE
  );

  if (testCreated) {
    created.push(
      "tests/autoheal.example.spec.cjs"
    );
  } else {
    skipped.push(
      "tests/autoheal.example.spec.cjs"
    );
  }

  // ------------------------------------------
  // 9.4 Return initialization result
  // ------------------------------------------

  return {
    projectRoot: root,
    created,
    skipped,
    success: true,
  };
}

// --------------------------------------------
// 10. Module exports
// --------------------------------------------

module.exports = {
  CONFIG_FILES,
  CONFIG_TEMPLATE,
  TEST_TEMPLATE,
  validateProjectDirectory,
  readProjectPackage,
  validateDependencies,
  findExistingConfig,
  createFileSafely,
  initializeProject,
};
