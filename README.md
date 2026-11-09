# AutoHeal QA

**AI-Powered Self-Healing Test Automation Framework**

A TypeScript-based test automation framework built with **Playwright, Node.js, and Hybrid AI**, designed to improve automated testing reliability through intelligent locator recovery, secure AI integration, and structured test reporting.

[![Playwright](https://img.shields.io/badge/Playwright-Test%20Automation-2EAD33)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933)](https://nodejs.org/)
![Development](https://img.shields.io/badge/Status-Active%20Development-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)

## Overview

AutoHeal QA is an evolving test automation framework that combines traditional browser automation with AI-assisted locator recovery.

When an application's UI changes and a locator becomes unavailable, the framework can evaluate trusted fallback locators and request AI-generated alternatives. Candidate selectors are validated and ranked before being presented as recovery suggestions.

**AI-generated suggestions are advisory and are not automatically executed.** This separation helps maintain predictable test behavior and reduces the risks associated with untrusted AI output.

The project is being developed with an emphasis on maintainability, reliability, security, and extensibility.

## Key Features

### 1. Playwright Automation Core

- TypeScript-based automated testing
- Chromium, Firefox, and WebKit test configurations
- Page Object Model architecture
- Reusable fixtures and test utilities
- Environment-based configuration
- Smoke and regression testing
- Screenshots, videos, and trace collection
- Configurable execution timeouts and retries

### 2. Self-Healing Locators

- Primary locator validation
- Deterministic fallback recovery
- Trusted selector evaluation
- Confidence-based fallback acceptance
- Unique-match validation
- Visibility validation
- Controlled recovery failures
- Structured healing events

### 3. Hybrid AI Recovery

AI-assisted recovery supports cloud AI provider integrations, including:

- OpenAI
- Google Gemini
- Mock AI provider for deterministic testing

The AI recovery architecture includes:

- Sanitized DOM context extraction
- Structured AI recovery requests
- Configurable provider authorization
- Confidence thresholds
- Candidate validation
- Recovery timeout enforcement
- Controlled error handling
- Advisory-only AI suggestions

External AI usage is restricted by runtime configuration and authorization controls.

### 4. Intelligent Candidate Ranking

The candidate ranking system evaluates AI-generated locator suggestions based on:

- Selector validity
- Confidence score
- Element uniqueness
- Element visibility
- Duplicate selector detection
- Deterministic ranking order

Invalid or unsafe candidates are rejected before a suggestion is returned.

### 5. Explainable AI Recovery — Phase 4.2

The explainability engine provides structured information about AI candidate evaluation.

Supported capabilities include:

- Accepted candidate records
- Rejected candidate records
- Not-evaluated candidate records
- Validation rejection reasons
- Ranking rejection reasons
- Duplicate-selector rejection diagnostics
- Validation timeout explanations
- Candidate identity preservation
- Candidate evaluation counts
- Validation duration metrics

Explanation records are designed to avoid exposing raw selectors and sensitive DOM content.

### 6. AI Provider Reliability and Security

- Provider request timeout handling
- Retry policies and bounded backoff
- Cancellation support
- Response size validation
- Provider error classification
- Request and response validation
- Runtime authorization controls
- Provider diagnostics
- Sensitive information protection
- Controlled handling of late responses

### 7. Automated Test Reporting

AutoHeal QA currently supports:

- Playwright HTML reports
- JUnit XML reports
- Custom AutoHeal JSON summaries
- Test execution statistics
- Self-healing event counts
- AI recovery evaluation metrics
- Recovery confidence statistics

**Planned improvement:** Integrate Phase 4.2 candidate explanations into aggregated reporting and analytics.

### 8. CI/CD Integration

The project uses GitHub Actions for automated validation and regression testing.

Development follows a feature-branch workflow with pull requests into the `develop` branch.

## Technology Stack

| Technology | Purpose | Status |
|---|---|---|
| TypeScript | Framework implementation | Implemented |
| Node.js | Runtime environment | Implemented |
| Playwright | Browser automation | Implemented |
| OpenAI API | Cloud AI recovery provider | Integrated |
| Google Gemini API | Cloud AI recovery provider | Integrated |
| GitHub Actions | CI/CD | Implemented |
| NestJS | Backend API | Planned |
| Next.js | Web dashboard | Planned |
| PostgreSQL | Persistent storage | Planned |
| Ollama | Local AI integration | Planned |

## Getting Started

### Prerequisites

- Node.js 22 or later
- npm
- Git
- Supported browser dependencies

### Installation

Clone the repository:

```bash
git clone https://github.com/DulajAR/autoheal-qa.git
cd autoheal-qa
```

Install dependencies:

```bash
npm install
```

Install Playwright browsers:

```bash
npx playwright install
```

For Chromium-only testing:

```bash
npx playwright install chromium
```

### Environment Configuration

The project includes an `.env.example` file.

Copy it to create a local environment configuration:

```powershell
Copy-Item .env.example .env
```

Configure the values according to your testing environment.

Keep API keys, credentials, and other sensitive configuration values out of version control.

AI provider access is subject to the framework's runtime authorization settings.

## Running Tests

### Chromium Regression Suite

```bash
npm run test:chromium
```

### All Configured Browser Projects

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

### Interactive Playwright UI

```bash
npm run test:ui
```

### Debug Mode

```bash
npm run test:debug
```

### Reliability Tests

```bash
npm run test:reliability
```

### Reporting Tests

```bash
npm run test:reporting
```

### AI Recovery Explainability Tests

```bash
npx playwright test tests/ai/ai-recovery-explainability.spec.ts --project=chromium
```

## Test Results

**Latest locally verified Chromium regression — November 9, 2026**

| Metric | Result |
|---|---|
| Total tests | 226 |
| Passed | 226 |
| Failed | 0 |
| Execution time | 45.6 seconds |
| Explainability tests | 11 passed |
| Healing events | 5 |
| AI recovery evaluations | 4 |

These results describe the recorded local regression run, not a guarantee of future runs or performance across all browsers.

## Test Reports

Generate a test report by running:

```bash
npm run test:chromium
```

Open the Playwright HTML report:

```bash
npm run report
```

The configured report outputs include:

```text
reports/
├── html/
├── junit/
│   └── results.xml
└── autoheal/
    └── summary.json
```

The custom summary records execution, healing, and AI recovery metrics.

## Development Progress

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Playwright Automation Core | Completed |
| Phase 2 | Deterministic Self-Healing Foundation | Implemented |
| Phase 3 | AI-Assisted Recovery Integration | Implemented |
| Phase 4.0 | AI Providers, Security and Reliability | Implemented |
| Phase 4.1 | Candidate Ranking and Validation | Completed |
| Phase 4.1.1 | Validation Reliability Hardening | Completed |
| Phase 4.2 | Explainable AI Recovery | Completed |
| Phase 4.3 | Recovery Analytics and Reporting | Next |
| Phase 4.4 | Recovery Intelligence Improvements | Planned |
| Phase 5 | Multi-Project Test Management | Planned |
| Phase 6 | Backend API and Web Dashboard | Planned |
| Phase 7 | Production Readiness | Planned |

## Roadmap

Future development priorities include:

- AI recovery analytics and reporting integration
- Expanded real-world application testing
- Improved candidate evaluation and recovery intelligence
- Multi-project test management
- Persistent execution and recovery history
- Backend APIs using NestJS
- Web dashboard using Next.js
- PostgreSQL database integration
- Optional local AI support
- Additional production security and reliability validation
- Deployment and packaging

## Development Workflow

The project follows a structured Git workflow:

```text
main
  └── develop
        └── feature/*
```

Development changes are implemented in feature branches, validated through automated tests, and reviewed through GitHub pull requests before merging.

### Recent Milestones

- [PR #27 — Intelligent Candidate Ranking](https://github.com/DulajAR/autoheal-qa/pull/27)
- [PR #28 — AI Validation Reliability Hardening](https://github.com/DulajAR/autoheal-qa/pull/28)
- [PR #29 — Explainable AI Recovery](https://github.com/DulajAR/autoheal-qa/pull/29)

## Project Goals

AutoHeal QA aims to provide a reliable and extensible automation framework for software testing teams.

Its long-term objectives are to:

- Reduce maintenance caused by changing UI locators
- Improve automated test diagnostics
- Provide explainable AI-assisted recovery
- Support repeatable and controlled testing
- Enable testing across multiple projects
- Provide useful execution and recovery analytics
- Integrate with professional development workflows

## Current Limitations

AutoHeal QA is under active development.

- AI-generated locator suggestions remain advisory.
- Local AI integration is not yet complete.
- Multi-project management is planned.
- The NestJS backend and Next.js dashboard are not yet implemented.
- Advanced recovery analytics are being developed.
- Additional production validation is required before commercial deployment.

## Author

**Dulaj Ranasinghe**

Software Engineer | Test Automation & AI Engineering

- GitHub: [@DulajAR](https://github.com/DulajAR)
- Portfolio: [dulajar.github.io/dulaj-portfolio-site](https://dulajar.github.io/dulaj-portfolio-site/)

## License

**Proprietary — All Rights Reserved**

This repository does not grant permission to copy, modify, redistribute, or commercially use its source code without authorization from the copyright holder.

## Project Status

**Active Development — Phase 4.2 Completed**

Next milestone: **Phase 4.3 — AI Recovery Analytics & Reporting**

---

Built with Playwright, TypeScript, and Hybrid AI to advance reliable, explainable test automation.
