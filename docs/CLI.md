
# AutoHeal-QA Developer CLI

## Overview

AutoHeal-QA provides a portable command-line interface for framework diagnostics.

The CLI supports both the framework repository and external Playwright projects that install AutoHeal-QA as a dependency.

## Requirements

- Node.js 22 or later
- npm
- Playwright Test
- AutoHeal-QA installed or available locally

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

### Version

```bash
npx --no-install autoheal --version
```

### Environment Diagnostics

```bash
npx --no-install autoheal doctor
```

The `doctor` command checks the current working directory by default.

It validates:

1. Node.js version compatibility
2. npm availability
3. Playwright dependency installation
4. Playwright configuration availability
5. AutoHeal-QA reporter availability

The command exits with a non-zero status when required checks fail.

### Inspect Another Project

```bash
npx --no-install autoheal doctor --project ./client-project
```

The `--project` option accepts an existing project directory.

## Supported Playwright Configuration Files

- playwright.config.ts
- playwright.config.js
- playwright.config.mjs
- playwright.config.cjs
- playwright.config.mts
- playwright.config.cts

## Reporter Detection

The CLI supports:

- The original source-based AutoHeal-QA reporter
- The reporter exported by an npm-installed AutoHeal-QA package

## Local Package Installation

The package is currently private and is not published to npm.

From the framework repository:

```powershell
npm run build
npm pack
```

This generates a local package archive such as:

```text
autoheal-qa-1.0.0.tgz
```

Install that archive in a separate Playwright project:

```powershell
npm install "C:\path\to\autoheal-qa-1.0.0.tgz"
```

Then run:

```powershell
npx --no-install autoheal doctor
```

## Testing

Run the CLI regression suite:

```bash
npm run test:cli
```

## Cross-Platform Validation

GitHub Actions validates the CLI on Windows and Ubuntu.

Workflow:

```text
.github/workflows/cli-ci.yml
```

## Current Limitations

- The npm package is private and not publicly published.
- The CLI currently provides help, version information, and diagnostics.
- Project initialization and additional developer utilities are planned.

## Security

- Do not commit API keys or credentials.
- Do not expose sensitive project configuration in diagnostic output.
- Keep external AI provider authorization explicit.
