
# AutoHeal-QA - Getting Started

## Overview

This guide explains how to install and use AutoHeal-QA in an independent Playwright project.

AutoHeal-QA provides:

- Playwright integration
- A reusable framework API
- Self-healing locator functionality
- A custom Playwright reporter
- Environment diagnostics
- Optional AI-assisted recovery

AI-generated recovery suggestions remain advisory-only.

## Prerequisites

- Node.js 22+
- npm
- Playwright Test
- Access to a local AutoHeal-QA package archive

## 1. Prepare the Package

In the AutoHeal-QA repository:

```powershell
npm install
npm run build
npm pack
```

The resulting archive will have a name similar to:

```text
autoheal-qa-1.0.0.tgz
```

The package is currently private and is not published to the npm registry.

## 2. Create a Consumer Project

```powershell
mkdir autoheal-consumer
cd autoheal-consumer

npm init -y

npm install -D @playwright/test
npx playwright install chromium
```

Install the AutoHeal-QA archive using its actual absolute path:

```powershell
npm install "C:\path\to\autoheal-qa-1.0.0.tgz"
```

## 3. Configure Playwright

Create `playwright.config.cjs`:

```javascript
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",

  use: {
    browserName: "chromium",
    headless: true,
  },

  reporter: [
    ["list"],
    ["autoheal-qa/reporter"],
  ],
});
```

## 4. Create a Basic Test

Create the `tests` directory:

```powershell
New-Item -ItemType Directory -Force tests
```

Create `tests/example.spec.cjs`:

```javascript
const { test, expect } = require("@playwright/test");

test("AutoHeal-QA consumer integration", async ({ page }) => {
  await page.setContent(`
    <main>
      <h1>AutoHeal QA</h1>
      <button data-testid="submit">Submit</button>
    </main>
  `);

  await expect(
    page.getByRole("heading", { name: "AutoHeal QA" })
  ).toBeVisible();

  await expect(
    page.getByTestId("submit")
  ).toBeVisible();
});
```

## 5. Validate the Environment

```powershell
npx --no-install autoheal doctor
```

Expected checks:

- Node.js
- npm
- Playwright dependency
- Playwright configuration
- AutoHeal reporter

All five checks should pass when the consumer is configured correctly.

## 6. Execute the Test

```powershell
npx playwright test --config=playwright.config.cjs
```

Expected result:

```text
1 passed
```

The AutoHeal-QA reporter should initialize and generate:

```text
reports/autoheal/summary.json
```

## 7. Verify Public API Availability

From the consumer project:

```powershell
node -e "console.log(Object.keys(require('autoheal-qa')))"
```

The package should expose its public framework API.

## 8. AI Recovery Safety

AI recovery is disabled by default unless explicitly configured and authorized.

AI-generated locator suggestions are advisory and are not automatically executed.

For initial integration testing, no external AI provider credentials are required.

## Troubleshooting

### Playwright dependency not detected

Install Playwright Test:

```powershell
npm install -D @playwright/test
```

### Playwright configuration not detected

Ensure that a supported `playwright.config.*` file exists in the project root.

### AutoHeal reporter not detected

Confirm that the AutoHeal-QA package is installed:

```powershell
npm ls autoheal-qa
```

### Browser executable missing

Install Chromium:

```powershell
npx playwright install chromium
```

## Next Steps

After verifying the basic integration:

1. Explore the public framework API.
2. Configure deterministic locator recovery.
3. Add controlled AI-assisted recovery where appropriate.
4. Review the generated AutoHeal-QA reports.
