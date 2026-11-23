
# AutoHeal-QA Developer CLI

## Overview

AutoHeal-QA provides a portable command-line interface (CLI)
for framework diagnostics and safe Playwright project initialization.

The CLI supports both the AutoHeal-QA framework repository and
external Playwright projects that install AutoHeal-QA as a dependency.

The CLI is designed to:

- Validate development environments.
- Initialize existing Playwright projects.
- Generate starter configuration and test files.
- Preserve existing project configurations.
- Support Windows, Linux, and macOS.
- Provide clear diagnostic and initialization feedback.

## Requirements

- Node.js 22 or later
- npm
- Playwright Test (`@playwright/test`)
- AutoHeal-QA installed or available locally
- An existing project directory
- A valid `package.json` for project initialization

For external consumer projects, both `@playwright/test`
and `autoheal-qa` must be declared as dependencies.

## Commands

### Help

From the framework repository:

```bash
node bin/autoheal.cjs --help
```

From an installed consumer project:

```bash
npx --no-install autoheal --help
```

The help command displays supported commands,
available options, and usage examples.

### Version

```bash
npx --no-install autoheal --version
```

Short version:

```bash
npx --no-install autoheal -v
```

Displays the installed AutoHeal-QA package version.

### Environment Diagnostics

```bash
npx --no-install autoheal doctor
```

The `doctor` command checks the current working
directory by default.

It validates:

1. Node.js version compatibility
2. npm availability
3. Playwright dependency installation
4. Playwright configuration availability
5. AutoHeal-QA reporter availability

The command exits with a non-zero status when
required checks fail.

Successful diagnostics display:

```text
AutoHeal QA - Environment Diagnostics

PASS Node.js
PASS npm
PASS Playwright dependency
PASS Playwright configuration
PASS AutoHeal reporter

AutoHeal QA: Environment checks passed.
```

### Inspect Another Project

```bash
npx --no-install autoheal doctor --project ./client-project
```

The `--project` option accepts an existing
project directory.

The CLI resolves the supplied path and validates
the target project.

Invalid, missing, or non-directory paths
produce an error.

## Project Initialization

### Overview

The `init` command initializes an existing
Playwright project with AutoHeal-QA starter files.

It is designed to be safe and non-destructive.

Initialization does not:

- Overwrite existing Playwright configurations.
- Replace existing starter tests.
- Install or upgrade dependencies.
- Modify the project's package.json.
- Automatically configure external AI providers.

### Initialize the Current Project

From an existing project containing the
required dependencies:

```bash
npx --no-install autoheal init
```

The CLI uses the current working directory
as the target project.

### Initialize Another Project

```bash
npx --no-install autoheal init --project ./client-project
```

The `--project` option allows initialization
of another existing project directory.

The target project must meet the initialization
requirements.

### Generated Files

When no supported Playwright configuration exists,
the command creates:

```text
playwright.config.cjs
```

When the AutoHeal-QA starter test does not exist,
the command creates:

```text
tests/autoheal.example.spec.cjs
```

Example project structure:

```text
client-project/
├── node_modules/
├── package.json
├── playwright.config.cjs
└── tests/
    └── autoheal.example.spec.cjs
```

The generated Playwright configuration provides
a basic Chromium test setup and integrates the
AutoHeal-QA reporter.

The starter test provides a simple example
for verifying the installation.

### Successful Initialization

Example output:

```text
AutoHeal QA - Project Initialization

Project: C:\projects\client-project

CREATED playwright.config.cjs
CREATED tests/autoheal.example.spec.cjs

Initialization complete.

Next steps:
  npx playwright test
  npx --no-install autoheal doctor
```

### Non-Destructive Initialization

AutoHeal-QA preserves existing project files.

Before generating a Playwright configuration,
the initializer checks for supported existing
configuration files.

If an existing configuration is detected,
the CLI skips configuration generation.

If the starter test already exists,
the CLI skips creating that test.

Example repeated initialization:

```bash
npx --no-install autoheal init
```

Expected output:

```text
AutoHeal QA - Project Initialization

SKIPPED Playwright configuration already exists: playwright.config.cjs
SKIPPED tests/autoheal.example.spec.cjs

No new files created. Existing files were preserved.
```

This allows repeated initialization without
overwriting previously generated files.

### Initialization Requirements

The target project must contain:

- An existing project directory
- A valid `package.json`
- A declared `@playwright/test` dependency
- A declared `autoheal-qa` dependency

Initialization fails when required project
information or dependencies are missing.

The CLI reports the failure and exits
with a non-zero status.

### Run the Starter Test

Install Chromium if necessary:

```bash
npx playwright install chromium
```

Run the generated test:

```bash
npx playwright test
```

The generated starter test verifies that
Playwright can execute using the
AutoHeal-QA starter configuration.

A successful test run should initialize
the AutoHeal-QA reporter.

### Verify Environment Configuration

After initialization, run:

```bash
npx --no-install autoheal doctor
```

The diagnostics should confirm:

- Compatible Node.js version
- Available npm installation
- Installed Playwright dependency
- Existing Playwright configuration
- Available AutoHeal-QA reporter

### AutoHeal-QA Reports

The AutoHeal-QA reporter generates a
JSON summary at:

```text
reports/autoheal/summary.json
```

The report includes test execution statistics
and available self-healing analytics.

A successful starter test does not necessarily
trigger a healing event.

Actual self-healing behavior requires tests
that use the framework's healing functionality.

## Supported Playwright Configuration Files

AutoHeal-QA recognizes the following
Playwright configuration filenames:

- `playwright.config.ts`
- `playwright.config.js`
- `playwright.config.mjs`
- `playwright.config.cjs`
- `playwright.config.mts`
- `playwright.config.cts`

The `doctor` command checks for these files.

The `init` command also checks for these files
before creating a new configuration.

If a supported configuration already exists,
the initializer preserves it.

## Reporter Detection

The CLI supports:

- The original source-based AutoHeal-QA reporter
- The reporter exported by an npm-installed AutoHeal-QA package

For npm-installed packages, the CLI validates
the reporter entry declared in the package exports.

Reporter paths that escape the installed
package directory are rejected.

## Local Package Installation

The package is currently private and
is not published to npm.

### Build the Framework

From the framework repository:

```powershell
cd E:\gitHubRepos\autoheal-qa

npm run build
npm pack
```

This generates a local package archive:

```text
autoheal-qa-1.0.0.tgz
```

### Create a Consumer Project

```powershell
cd E:\gitHubRepos

New-Item -ItemType Directory -Path autoheal-init-test

cd autoheal-init-test

npm init -y
```

Install Playwright:

```powershell
npm install -D @playwright/test
```

Install the local AutoHeal-QA package:

```powershell
npm install "E:\gitHubRepos\autoheal-qa\autoheal-qa-1.0.0.tgz"
```

### Initialize the Consumer Project

```powershell
npx --no-install autoheal init
```

### Execute the Starter Test

```powershell
npx playwright install chromium

npx playwright test
```

### Verify Repeated Initialization

```powershell
npx --no-install autoheal init
```

Existing generated files should be preserved.

### Run Diagnostics

```powershell
npx --no-install autoheal doctor
```

All required environment checks should pass
when the consumer project is configured correctly.

## Testing

### CLI Regression Tests

Run the CLI regression suite:

```bash
npm run test:cli
```

The suite includes tests for:

- CLI help
- Version information
- Unknown command handling
- Command argument validation
- Project directory resolution
- Environment diagnostics
- Reporter detection
- Initialization file generation
- Non-destructive initialization
- Missing package.json handling
- Missing Playwright dependency handling
- Missing AutoHeal-QA dependency handling

### TypeScript Validation

```bash
npm run typecheck
```

### Production Build

```bash
npm run build
```

### Package Validation

```bash
npm pack --dry-run
```

Verify that the generated package includes:

- `bin/autoheal.cjs`
- `bin/init-project.cjs`
- Compiled framework files
- Reporter exports
- Required documentation

### Git Validation

```bash
git diff --check
```

## Cross-Platform Validation

GitHub Actions validates the CLI on
Windows and Ubuntu.

Workflow:

```text
.github/workflows/cli-ci.yml
```

The CLI uses Node.js APIs for file system
operations, project path resolution,
and command execution.

The initialization command does not depend
on platform-specific shell commands.

## Current Limitations

- The npm package is private and not publicly published.
- The CLI supports help, version information,
  diagnostics, and project initialization.
- Initialization requires an existing Node.js project.
- Initialization does not install dependencies.
- Existing Playwright configurations are preserved,
  but are not automatically modified to add the reporter.
- The generated starter test provides basic
  integration verification rather than a
  complete self-healing demonstration.
- External AI provider configuration remains explicit.
- Additional developer utilities may be introduced
  in future releases.

## Security

- Do not commit API keys or credentials.
- Do not expose sensitive project configuration
  in diagnostic output.
- Keep external AI provider authorization explicit.
- Do not overwrite existing user configuration files.
- Preserve existing project files during initialization.
- Validate project paths before accessing files.
- Avoid modifying files outside the selected project.
- Review generated configuration before using it
  in production environments.

## Development Status

Phase 5.5.2 introduces the safe,
non-destructive `autoheal init` command.

The feature has been validated through:

- CLI regression tests
- Initialization module tests
- TypeScript compilation
- npm package generation
- Installation in an external consumer project
- Starter test execution
- AutoHeal-QA report generation
- Repeated initialization
- Environment diagnostics

The feature is ready for final review
and continuous integration validation.
