
# AutoHeal-QA Developer CLI

## Overview

AutoHeal-QA provides a command-line interface for
framework diagnostics and developer utilities.

The CLI is implemented using Node.js and is currently
intended for use within the AutoHeal-QA repository.

## Requirements

- Node.js 22 or later
- npm
- Project dependencies installed with `npm ci`

## Available Commands

### Help

```bash
node bin/autoheal.cjs --help
```

Displays available commands and usage examples.

### Version

```bash
node bin/autoheal.cjs --version
```

Displays the framework version from package.json.

### Environment Diagnostics

```bash
node bin/autoheal.cjs doctor
```

Checks:

- Node.js version compatibility
- npm availability
- Playwright dependency installation
- Playwright configuration
- AutoHeal-QA reporter availability

The command exits with a non-zero status if required
environment checks fail.

## Running CLI Tests

```bash
npm run test:cli
```

Executes the automated CLI regression suite.

## Cross-Platform Validation

GitHub Actions validates the CLI on:

- Ubuntu
- Windows

The workflow is defined in:

`.github/workflows/cli-ci.yml`

It performs syntax checks, regression tests, version
verification, environment diagnostics, and npm package
inspection.

## Current Limitations

- The CLI is currently designed around the framework
  repository structure.
- Diagnostics for independently installed client
  projects are not yet supported.
- The npm package is private and is not published.
- Additional CLI commands are planned for future phases.

## Future Improvements

- Portable installation and execution
- Client-project diagnostics
- Additional framework management commands
- Controlled npm distribution
```
