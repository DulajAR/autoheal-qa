# AutoHeal QA

**AI-Powered Self-Healing Test Automation Framework**

A TypeScript-based test automation framework built with **Playwright, Node.js, and Hybrid AI**, designed to improve automated testing reliability through controlled locator recovery, secure AI integration, and structured test reporting.

[![Playwright](https://img.shields.io/badge/Playwright-Test%20Automation-2EAD33)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
![Status](https://img.shields.io/badge/Status-Active%20Development-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)

## Overview

AutoHeal QA is a modular test automation framework combining traditional Playwright automation with deterministic self-healing and optional AI-assisted locator recovery.

When an application's user interface changes, the framework can evaluate trusted fallback locators and request AI-generated alternatives.

Candidate selectors are validated, ranked, and evaluated against defined recovery policies.

**AI-generated suggestions are advisory-only and are not automatically executed.**

The framework emphasizes:

- Reliable test execution
- Deterministic locator recovery
- Secure AI integration
- Explainable recovery decisions
- Structured diagnostics and reporting
- Portable npm package integration
- Developer-friendly tooling
- Extensible architecture

## Key Features

### 1. Playwright Automation Core

- TypeScript-based automation
- Chromium, Firefox, and WebKit configurations
- Page Object Model architecture
- Reusable fixtures and utilities
- Environment-based configuration
- Smoke and regression tests
- Screenshots, videos, and traces
- Configurable timeouts and retries

### 2. Deterministic Self-Healing

- Primary locator validation
- Trusted fallback locator evaluation
- Confidence-based acceptance
- Unique-match validation
- Visibility validation
- Controlled recovery failures
- Structured healing events
- Policy-enforced locator recovery

### 3. Hybrid AI Recovery

Supported AI provider integrations:

- OpenAI
- Google Gemini
- Mock AI provider for deterministic testing

Recovery capabilities include:

- Sanitized DOM context extraction
- Structured AI recovery requests
- Explicit provider authorization
- Confidence thresholds
- Candidate validation
- Timeout enforcement
- Error classification
- Advisory-only suggestions

External AI requests are governed by runtime configuration and authorization controls.

### 4. Intelligent Candidate Ranking

AI-generated candidates are evaluated using:

- Selector validity
- Confidence scores
- Element uniqueness
- Element visibility
- Duplicate detection
- Deterministic ranking

Invalid or unsafe candidates are rejected according to validation policies.

### 5. Explainable AI Recovery

The explainability system supports:

- Accepted candidate records
- Rejected candidate records
- Not-evaluated candidate records
- Validation rejection reasons
- Ranking rejection reasons
- Duplicate-selector diagnostics
- Validation timeout explanations
- Candidate identity preservation
- Evaluation counts
- Validation duration metrics

Diagnostic records are designed to minimize exposure of sensitive selectors and DOM content.

### 6. AI Provider Reliability

- Provider request timeouts
- Retry policies
- Bounded backoff
- Request cancellation
- AbortSignal support
- Response validation
- Error classification
- Runtime authorization
- Provider diagnostics
- Controlled handling of late responses
- Fail-closed recovery behavior

### 7. Automated Reporting

Supported reporting capabilities include:

- Playwright HTML reports
- JUnit XML reports
- AutoHeal JSON summaries
- Execution statistics
- Self-healing metrics
- AI recovery metrics
- Candidate evaluation analytics
- Recovery confidence statistics

### 8. Portable Developer CLI

AutoHeal QA provides a command-line interface for framework diagnostics and non-destructive project initialization.

Available commands:

- `autoheal --help`
- `autoheal --version`
- `autoheal doctor`
- `autoheal doctor --project <path>`
- `autoheal init`
- `autoheal init --project <path>`

The CLI supports diagnostics in both the framework repository and independently configured Playwright projects.

### 9. npm Package Integration

The framework provides package entry points for:

- Public framework API
- Custom Playwright reporter
- Portable CLI

The package has been validated using a locally generated npm archive installed into a separate consumer project.

**The package is currently private and has not been published to the public npm registry.**

### 10. CI/CD Integration

GitHub Actions supports automated regression validation.

Development follows a feature-branch workflow with pull requests targeting `develop`.

## Technology Stack

| Technology | Purpose | Status |
|---|---|---|
| TypeScript | Framework implementation | Implemented |
| Node.js | Runtime | Implemented |
| Playwright | Browser automation | Implemented |
| OpenAI API | AI recovery provider | Integrated |
| Google Gemini API | AI recovery provider | Integrated |
| GitHub Actions | CI/CD | Implemented |
| npm | Package distribution tooling | Implemented locally |
| NestJS | Backend API | Planned |
| Next.js | Web dashboard | Planned |
| PostgreSQL | Persistent storage | Planned |
| Ollama | Local AI integration | Planned |

## Getting Started

There are two supported development workflows:

1. Work directly with the AutoHeal QA framework repository.
2. Install a locally packaged version into an independent Playwright project.

### Prerequisites

- Node.js 22 or later
- npm
- Git
- Playwright browser dependencies

## Framework Development Installation

Clone the repository:

```bash
git clone https://github.com/DulajAR/autoheal-qa.git
cd autoheal-qa
```

Install dependencies:

```bash
npm install
```

Install Chromium:

```bash
npx playwright install chromium
```

Build the framework:

```bash
npm run build
```

Verify TypeScript:

```bash
npm run typecheck
```

### Environment Configuration

Create a local environment configuration from the example:

```powershell
Copy-Item .env.example .env
```

Configure the environment values required for your testing scenario.

Never commit credentials, API keys, or sensitive configuration values.

AI provider access requires explicit authorization through framework runtime configuration.

## Install AutoHeal QA in Another Project

The framework can be packaged locally and installed into an independent Playwright project.

### Step 1: Build the Package

From the AutoHeal QA repository:

```powershell
npm install
npm run build
npm pack
```

This creates a local archive similar to:

```text
autoheal-qa-1.0.0.tgz
```

### Step 2: Create a Consumer Project

```powershell
mkdir autoheal-consumer
cd autoheal-consumer
npm init -y
npm install -D @playwright/test@^1.64.1
npx playwright install chromium
```

### Step 3: Install AutoHeal QA

Install the package using the actual path to your generated archive.

Example:

```powershell
npm install "E:\gitHubRepos\autoheal-qa\autoheal-qa-1.0.0.tgz"
```

### Step 4: Initialize Playwright

```powershell
npx --no-install autoheal init
```

For a fresh consumer project, this creates `playwright.config.cjs` and `tests/autoheal.example.spec.cjs`. Existing files are preserved.

### Step 5: Verify the generated files

```powershell
Test-Path playwright.config.cjs
Test-Path tests/autoheal.example.spec.cjs
```

For existing projects, inspect the existing configuration and ensure the AutoHeal reporter is registered. See the [Getting Started Guide](docs/GETTING_STARTED.md) for manual configuration.

### Step 6: Run Diagnostics

```powershell
npx --no-install autoheal doctor
```

The diagnostic command checks:

- Node.js compatibility
- npm availability
- Playwright dependency
- Playwright configuration
- AutoHeal reporter availability

### Step 7: Execute Tests

```powershell
npx playwright test --config=playwright.config.cjs
```

### Step 8: Verify the Report

```powershell
Test-Path reports/autoheal/summary.json
```

The report contains test execution statistics and available healing and AI recovery analytics.

### Step 9: Inspect Public API Exports

```powershell
node -e "console.log(Object.keys(require('autoheal-qa')))"
```

Verified runtime exports:

- `createSelfHealingRuntime`
- `loadAIRuntimeConfig`
- `PolicyEnforcedSelfHealingLocator`
- `SelfHealingLocator`

For more information:

- [Getting Started Guide](docs/GETTING_STARTED.md)
- [CLI Documentation](docs/CLI.md)

## Developer CLI

Display available commands:

```powershell
npx --no-install autoheal --help
```

Display version:

```powershell
npx --no-install autoheal --version
```

Check the current project:

```powershell
npx --no-install autoheal doctor
```

Check another existing project:

```powershell
npx --no-install autoheal doctor --project ./client-project
```

The `--project` argument must reference an existing directory.

Initialize the current project:

```powershell
npx --no-install autoheal init
```

Initialize another existing project:

```powershell
npx --no-install autoheal init --project ./client-project
```

Initialization requires an existing Node.js project with Playwright and AutoHeal-QA installed. Existing configurations and starter tests are preserved. Dependencies are not installed automatically.

## Running Framework Tests

### Chromium Tests

```bash
npm run test:chromium
```

### All Configured Projects

```bash
npm test
```

### Smoke Tests

```bash
npm run test:smoke
```

### Regression Tests

```bash
npm run test:regression
```

### TypeScript Validation

```bash
npm run typecheck
```

### CLI Tests

```bash
npm run test:cli
```

### Reporting Tests

```bash
npm run test:reporting
```

### Reliability Tests

```bash
npm run test:reliability
```

### Build

```bash
npm run build
```

## Verified Test Results

### Independent Consumer Integration — November 21, 2026

| Verification | Result |
|---|---|
| Local npm archive installation | Passed |
| Node.js diagnostic | Passed |
| npm diagnostic | Passed |
| Playwright dependency diagnostic | Passed |
| Playwright configuration diagnostic | Passed |
| AutoHeal reporter diagnostic | Passed |
| Consumer integration test | 1 passed |
| Consumer integration failures | 0 |
| Public API exports | Verified |
| JSON report generation | Passed |

The consumer test ran successfully using Chromium.

Generated report:

```text
reports/autoheal/summary.json
```

Reported execution statistics:

```text
Overall status: passed
Total attempts: 1
Passed attempts: 1
Failed attempts: 0
```

No locator healing or AI recovery was triggered in this basic consumer integration test.

### Project Initialization — November 23, 2026

| Verification | Result |
|---|---|
| Fresh packaged consumer initialization | Passed |
| Generated starter test | 1 passed |
| Repeated initialization | Existing files preserved |
| Environment diagnostics | 5/5 passed |
| PR #46 CI checks | 6/6 passed |

### CLI Regression Tests — November 24, 2026

| Metric | Result |
|---|---|
| Total tests | 44 |
| Passed | 44 |
| Failed | 0 |


### Installed-Package Integration — November 24, 2026

| Verification | Result |
|---|---|
| Package integration tests | 13/13 passed |
| Playwright recovery scenarios | 7/7 passed |
| CLI regression tests | 44/44 passed |
| Reporting regression tests | 99/99 passed |
| Deterministic healing events | 1 |
| AI advisory suggestions | 1 |
| AI recovery failures | 0 |
| Automatic AI healing | 0 |
| TypeScript validation | Passed |
| Production build | Passed |
| Local Windows validation | Passed |

AI recovery was validated using a controlled mock provider
and an isolated HTTPS browser fixture. AI-generated locator
suggestions remain advisory-only.

Cross-platform package integration is configured through
GitHub Actions for Windows and Linux.

### Historical Chromium Regression — November 9, 2026

| Metric | Result |
|---|---|
| Total tests | 226 |
| Passed | 226 |
| Failed | 0 |
| Execution time | 45.6 seconds |
| Explainability tests | 11 passed |
| Healing events | 5 |
| AI recovery evaluations | 4 |

These figures describe recorded test executions, not guaranteed results for future runs.

## Test Reports

Execute tests:

```bash
npm run test:chromium
```

Open the Playwright HTML report:

```bash
npm run report
```

Example report structure:

```text
reports/
├── html/
├── junit/
│   └── results.xml
└── autoheal/
    └── summary.json
```

The custom AutoHeal summary provides execution, healing, and AI recovery metrics.

## Development Progress

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Playwright Automation Core | Completed |
| Phase 2 | Deterministic Self-Healing | Implemented |
| Phase 3 | AI-Assisted Recovery | Implemented |
| Phase 4.0 | AI Provider Security and Reliability | Implemented |
| Phase 4.1 | Candidate Ranking and Validation | Completed |
| Phase 4.1.1 | Validation Reliability Hardening | Completed |
| Phase 4.2 | Explainable AI Recovery | Completed |
| Phase 4.3 | Recovery Analytics and Reporting | Implemented |
| Phase 5 | Package Adoption and Developer Experience | In progress |
| Phase 5.5.1 | Developer Installation and Quick Start | Validated locally |
| Phase 5.5.2 | Developer Project Initialization | Completed (PR #46) |
| Phase 5.5.3 | Developer Adoption and Package Integration Hardening | In progress |
| Phase 6 | Backend API and Web Dashboard | Planned |
| Phase 7 | Production Readiness | Planned |

## Roadmap

Current development priorities include:

- Developer onboarding improvements
- CLI command-level initialization regression coverage
- Automated external consumer integration tests
- Expanded package compatibility validation
- Real-world locator recovery testing
- Multi-project test management
- Persistent execution history
- NestJS backend services
- Next.js dashboard
- PostgreSQL integration
- Optional local AI providers
- Production security validation

## Development Workflow

The project follows a Git branching strategy:

```text
main
└── develop
    ├── feature/playwright-core
    ├── feature/ai-recovery-reliability
    ├── feature/cli-portability
    └── feature/developer-experience
```

Changes are developed in feature branches, validated with automated tests, and submitted through pull requests.

### Selected Milestones

- [PR #27 - Intelligent Candidate Ranking](https://github.com/DulajAR/autoheal-qa/pull/27)
- [PR #28 - AI Validation Reliability Hardening](https://github.com/DulajAR/autoheal-qa/pull/28)
- [PR #29 - Explainable AI Recovery](https://github.com/DulajAR/autoheal-qa/pull/29)
- [PR #36 - AI Recovery Reliability](https://github.com/DulajAR/autoheal-qa/pull/36)
- [PR #44 - Portable npm Distribution](https://github.com/DulajAR/autoheal-qa/pull/44)
- [PR #46 - Non-destructive Project Initialization](https://github.com/DulajAR/autoheal-qa/pull/46)

## Project Goals

AutoHeal QA aims to provide an extensible automation framework for software engineering and QA teams.

Primary goals include:

- Reduce maintenance caused by changing UI locators
- Improve automated test diagnostics
- Provide explainable AI-assisted recovery
- Support repeatable testing
- Improve framework portability
- Enable integration into independent projects
- Provide structured execution analytics
- Integrate with professional CI/CD workflows

## Current Limitations

AutoHeal QA remains under active development.

- AI-generated locator suggestions are advisory-only.
- The npm package has not been publicly published.
- Initialization preserves existing configurations; existing projects may require manual reporter configuration.
- Automated installed-package consumer testing covers installation, initialization, CLI execution, locator recovery, runtime policy enforcement, and reporting.
- Controlled installed-package recovery validation is complete; broader application compatibility testing is ongoing.
- Local AI integration is planned.
- Multi-project management is not yet complete.
- Backend and dashboard development is planned.
- Additional security and production validation are required.

## Security

- Never commit API keys or credentials.
- Keep sensitive environment values outside version control.
- Require explicit authorization for external AI providers.
- Sanitize DOM context before provider requests.
- Validate AI-generated locator candidates.
- Preserve fail-closed recovery behavior.
- Avoid exposing sensitive selectors in diagnostics.

## Author

**Dulaj Ranasinghe**

Software Engineer | Test Automation & AI Engineering

- GitHub: [@DulajAR](https://github.com/DulajAR)
- Portfolio: [dulajar.github.io/dulaj-portfolio-site](https://dulajar.github.io/dulaj-portfolio-site/)

## License

**Proprietary - All Rights Reserved**

This repository does not grant permission to copy, modify, redistribute, or commercially use its source code without authorization from the copyright holder.

## Project Status

**Active Development - Phase 5.5: Developer Experience and Package Adoption**

Phase 5.5.1 has been validated locally through an independent Playwright consumer integration test.

Phase 5.5.2 was merged into `develop` through PR #46 on November 23, 2026.

**Current milestone:** Phase 5.5.3 - Developer Adoption and Package Integration Hardening.

---

Built with Playwright, TypeScript, and Hybrid AI to advance reliable, explainable test automation.
