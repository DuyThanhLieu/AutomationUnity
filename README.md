# AutomationUnity

**QA automation suite for the UniScore football platform** — API, database, and UI regression coverage across Competitions, Player/Coach services, Odds, Datalytics, Lineups, and native app checklists.

[![Playwright](https://img.shields.io/badge/Playwright-1.63-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Unlicensed-lightgrey)](#)

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Reporting](#reporting)
- [Module Coverage](#module-coverage)
- [Security](#security)
- [Contributing](#contributing)

## Overview

This repository holds the end-to-end QA automation for **UniScore**, a live football scores and stats platform. It combines:

- **API contract tests** — response shape, field presence, formula correctness (e.g. Datalytics percentages, odds market payloads).
- **Database cross-checks** — reconciling PostgreSQL / MongoDB source data against what the API and frontend actually serve.
- **Realtime verification** — MQTT socket payloads compared against REST snapshots for live match events.
- **UI regression** — Playwright browser tests for the web frontend (filters, navigation, locale-specific content).
- **Manual test documentation** — structured checklists for scenarios that require physical devices (Edge-to-Edge insets, App Tracking Transparency, Store screenshots).

At a glance:

| | |
|---|---|
| Test files | **167** `.spec.ts` |
| Test cases | **~2,100** (automated + documented manual checklists) |
| Task groups covered | **19** |

A full breakdown — every file, its API endpoints, and its test cases — is generated into [`REPORT_TongHop_ToanBoProject.xlsx`](./REPORT_TongHop_ToanBoProject.xlsx).

## Project Structure

```
tests/
├── standard/                         # Parameterized test framework
│   ├── _template/                    # 10-file blueprint — copy per new competition
│   ├── lib/                          # Shared clients: db.ts, mongo.ts, redis.ts, helpers.ts
│   ├── 2026-Q3-task-3462/            # Standard framework applied to 8 real competitions
│   ├── 2026-Q3-task-898-odds-service/        # Odds service migration (NestJS → Go)
│   ├── 2026-Q3-task-900-player-honor-service/# Player service migration (NestJS → Go)
│   ├── 2026-Q3-task-3369*/                   # Coach service migration (NestJS → Go)
│   ├── 2026-Q3-task-4064-datalytics-data/    # Datalytics formula verification
│   └── 2026-Q3-task-951-958-app-native/      # Edge-to-Edge / CMP-Consent-ATT checklists
└── *.spec.ts                         # Standalone smoke tests, bug repros, DB/socket checks

API/            Staging-vs-production comparison helpers
config/         Environment configuration
pages/          Page Object Model for uniscore.com
scripts/        Report generation, MongoDB mapping audit
docs/           Manual test checklists (HTML)
telegram-bot/   Standalone reminder bot (not part of UniScore's API surface)
```

## Tech Stack

| Layer | Tooling |
|---|---|
| Test runner | [Playwright Test](https://playwright.dev/) |
| Language | TypeScript |
| Relational DB | PostgreSQL (`pg`) |
| Document DB | MongoDB (`mongodb`) |
| Cache | Redis (`ioredis`) |
| Realtime | MQTT (`mqtt`) |
| Reporting | `exceljs`, `xlsx` |
| Misc | `google-play-scraper` (store listing checks), `node-telegram-bot-api` |

## Getting Started

```bash
git clone https://github.com/DuyThanhLieu/AutomationUnity.git
cd AutomationUnity

# NODE_ENV=production causes npm to skip devDependencies — always install as development
NODE_ENV=development npm install
```

Copy the environment template and fill in real connection details (never commit `.env`):

```bash
cp .env.example .env
```

| Variable | Used by |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Staging Postgres (`tests/standard/lib/db.ts`, `db-staging-direct.ts`) |
| `DB_PROD_HOST`, `DB_PROD_PASSWORD` | Production Postgres (several `tests/*.spec.ts`) |
| `MONGO_HOST`, `MONGO_USER`, `MONGO_PASSWORD` | FootyStats cache MongoDB (`tests/standard/lib/mongo.ts`) |
| `MONGO_MAPPING_HOST`, `MONGO_MAPPING_USER`, `MONGO_MAPPING_PASSWORD` | `scripts/check_mongo_mapping.mjs` |
| `MQTT_HOST`, `MQTT_PASSWORD` | Realtime socket tests (`check_socket.spec.ts`, `var_outcome_socket_check.spec.ts`) |
| `GOOGLE_EMAIL`, `GOOGLE_PASSWORD` | `login_daily_check.spec.ts` |
| `TELEGRAM_BOT_TOKEN` | `telegram-bot/bot.js` |

> Credentials are internal to the UniScore team. Clone this repo for the code and structure — actual test execution requires requesting access from the team.

## Running Tests

```bash
# Full suite
npx playwright test

# A single file
npx playwright test tests/upcoming_fakeip_time.spec.ts

# A task's whole directory
npx playwright test tests/standard/2026-Q3-task-4064-datalytics-data/

# Open the HTML report after a run
npx playwright show-report
```

To onboard a new competition onto the standard framework: copy `tests/standard/_template/`, point its competition-context file at the new `TEST_COMPETITION_ID`, and run — no need to re-author the 10 standard categories from scratch.

## Reporting

```bash
node scripts/export-full-project-report.mjs
```

Regenerates `REPORT_TongHop_ToanBoProject.xlsx` with four sheets — Overview, Detailed Task & API breakdown, By Group, and By Product Module — for a quick view of what's automated versus what's still manual.

## Module Coverage

| Product module | Status |
|---|---|
| Competitions / Leagues (standard framework, 8 competitions: AFC CL, Eredivisie, EPL, UCL, UNL, Super Cup, Community Shield) | ✅ Automated |
| Player — Player Detail / Honor Service (Go migration) | ✅ Automated |
| Player — Compare Player/Lineup | ✅ Automated |
| Player / Team — xG Stats | ✅ Automated |
| Coach — Coach Detail (Go migration) | ✅ Automated |
| Odds | ✅ Automated |
| Match Detail — Datalytics / H2H | ✅ Automated |
| Match Detail — Lineups (xG tab, Radar Chart, Rating Badge) | ✅ Automated |
| Home — Top Leagues | ✅ Automated |
| App Native — Safe Area / Consent & ATT (device checklists) | ✅ Documented |
| App Store Listing (screenshots) | ✅ Automated |
| Player — Transfer History | ⚠️ Manual investigation, not yet packaged as `.spec.ts` |
| Home — Suggestions ordering bug | ⚠️ Under investigation |
| Lineups — "Predicted Lineup" label rename | ⚠️ Under investigation |

Full detail — every row, endpoint, and test case — lives in `REPORT_TongHop_ToanBoProject.xlsx`.

## Security

- All credentials (database, MongoDB, MQTT, Google, Telegram) are read from environment variables — never hardcoded in source.
- `.env` is git-ignored and must never be committed.
- Anyone cloning this repository to run tests against real infrastructure needs to request credentials from the team and populate a local `.env`.

## Contributing

This is an internal QA project. For questions about test coverage or to request access to staging/production credentials, contact the QA team.
