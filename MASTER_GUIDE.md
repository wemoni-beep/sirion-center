# Xtrusio Intel — Master Development Guide

## The Golden Rule

**No code change ships without passing tests.**

Every change — bug fix, new feature, refactor — must pass both unit tests AND E2E tests before it's considered done.

---

## Master Commands

### Before ANY Code Change

```bash
npm run test:all
```

If tests pass: proceed with the change.
If tests fail: fix failing tests FIRST before changing anything else.

### After ANY Code Change

```bash
npm run test:all
```

If tests pass: the change is safe to keep.
If tests fail: revert or fix before moving on. Never leave failing tests.

### Individual Test Suites

```bash
npm test              # Unit/data tests only (fast, ~2 seconds)
npm run test:e2e      # E2E browser tests (opens Chromium, ~15 seconds)
npm run test:all      # Both suites sequentially
npm run test:watch    # Unit tests in watch mode (re-runs on file save)
```

### Data Management

```bash
npm run seed          # Re-seed local data from QUESTIONS_MASTER.json
```

Run `npm run seed` whenever QUESTIONS_MASTER.json changes, to push the data into the pipeline document and individual question files.

---

## What the Tests Protect

### Unit Tests (`npm test`)

| Test File | What It Checks |
|---|---|
| `scanEngine.test.js` | Scan scoring math, export payload structure |
| `enrichment.test.js` | All 182 questions have intentType, personaFit, volumeTier |
| `dataFlow.test.js` | Master file, pipeline doc, question files, and snapshot are all in sync |

### E2E Tests (`npm run test:e2e`)

| Test File | What It Checks |
|---|---|
| `dashboard.spec.js` | Dashboard loads, shows 182 questions, all 5 module cards visible |
| `questions.spec.js` | INTENT column shows data (not "—"), FIT column shows scores (not "—"), data persists after refresh |
| `decision-matrix.spec.js` | Decision Matrix tab accessible, enriched count > 0 |

### Why Both?

- **Unit tests** catch data corruption: wrong counts, missing fields, broken hashes.
- **E2E tests** catch UI bugs: columns showing "—", data disappearing on refresh, navigation broken.

You need both. A unit test can pass while the UI is broken (the data is correct but the component doesn't render it). An E2E test can pass while data is corrupt (localStorage has old cached data). Together, they catch everything.

---

## Prompts for AI Assistants

Copy-paste these when working with any AI coding assistant (Claude, Cursor, Copilot, etc.).

### Before Starting Any Task

```
IMPORTANT: This project has automated tests. Before making any code changes:
1. Run `npm run test:all` and show me the results
2. Make your changes
3. Run `npm run test:all` again and show me the results
4. If any test fails after your change, fix it before reporting done

Test commands:
- `npm test` — unit/data tests
- `npm run test:e2e` — browser tests
- `npm run test:all` — both

Never skip tests. Never mark a task as done with failing tests.
```

### For Bug Fixes

```
CONTEXT: This is a React 19 + Vite 7 app with 5 modules.
Data flows: QUESTIONS_MASTER.json → pipeline doc → individual files → UI.
The app uses a local file store (data/ folder via Vite dev server middleware).

RULES:
- Run `npm run test:all` before AND after every change
- The INTENT and FIT columns in Question Generator MUST show data, not "—"
- Never strip enrichment fields (intentType, personaFit, bestPersona, volumeTier)
  when loading or transforming questions
- After modifying data files, run `npm run seed` to re-sync the pipeline
- Check both the pipeline doc AND the individual question files after data changes
```

### For New Features

```
ARCHITECTURE:
- PipelineContext.jsx: Central state management, loads from data/pipelines/
- QuestionGenerator.jsx: M1 module, 4-tier question merge (pipeline → Q_BANK → KB → AI)
- firebase.js: Local-only data layer (db.save, db.getAll, db.update)
- vite.config.js: Dev server middleware serves data/ folder at /__api/backup/

TESTING:
- Write tests for new features in src/__tests__/ (vitest) or e2e/ (playwright)
- Run `npm run test:all` after implementation
- If adding new data fields, add assertions to enrichment.test.js
- If adding new UI elements, add assertions to the relevant .spec.js
```

---

## Architecture Quick Reference

```
src/
  App.jsx              — App shell, sidebar, routing, Dashboard
  PipelineContext.jsx   — Central state (useReducer + localStorage + file backup)
  QuestionGenerator.jsx — M1: Questions + Persona Research + Decision Matrix
  PerceptionMonitor.jsx — M2: AI scan engine
  AuthorityRing.jsx     — M3: Domain authority mapping
  BuyingStageGuide.jsx  — M4: Buyer readiness analysis
  CLMAdvisor.jsx        — M5: Vendor comparison engine
  firebase.js           — Local data layer (was Firebase, now file-based)
  questionDB.js         — IndexedDB for questions, macros, personas
  scanEngine.js         — Scan scoring + export logic
  claudeApi.js          — Multi-LLM API calls

data/
  QUESTIONS_MASTER.json          — 182 enriched questions (single source of truth)
  BACKUP_LOCKED_2026-03-02.json  — Emergency recovery backup
  pipelines/local_master.json    — Pipeline document (all 5 modules)
  pipeline_snapshot/current.json — Pipeline backup copy
  m1_questions_v2/               — 182 individual question files

e2e/                    — Playwright E2E tests (browser)
src/__tests__/          — Vitest unit/data tests
```

### Data Flow

```
QUESTIONS_MASTER.json
       │
       ├──→ seed_local.cjs ──→ pipelines/local_master.json
       │                   ──→ m1_questions_v2/*.json
       │                   ──→ pipeline_snapshot/current.json
       │
       └──→ App loads via PipelineContext:
              db.getAll("pipelines") → local_master.json
              localStorage.getItem("xt_pipeline_snapshot")
              /__api/backup/pipeline_snapshot/current
```

### Enrichment Fields (Never Strip These)

| Field | Type | Values |
|---|---|---|
| `intentType` | string | `generic`, `category`, `vendor`, `decision` |
| `personaFit` | number | 1-10 |
| `bestPersona` | string | `gc`, `cpo`, `cio`, `vplo`, `cto`, `cm`, `pd`, `cfo` |
| `volumeTier` | string | `high`, `medium`, `niche` |
| `criterion` | string | e.g., `gc.playbook_enforcement` |
| `enrichedAt` | string | ISO timestamp |

---

## Common Mistakes to Avoid

1. **Stripping enrichment when loading pipeline questions** — The Tier 1 mapping in QuestionGenerator.jsx MUST include intentType, personaFit, bestPersona, volumeTier, criterion, enrichedAt.

2. **Running seed with stale data** — Always check QUESTIONS_MASTER.json has enrichment before running `npm run seed`.

3. **Forgetting to re-seed after data changes** — If you modify QUESTIONS_MASTER.json, run `npm run seed` to propagate changes to the pipeline doc and individual files.

4. **Using `personaFit || null` instead of `personaFit ?? null`** — A personaFit of 0 would be falsy with `||`. Use `?? null` or explicit null check.

5. **Clearing localStorage without re-syncing** — The app patches pipeline data from localStorage. If you clear it, run a fresh load or seed.

---

## Emergency Recovery

If data gets corrupted:

```bash
# 1. Restore from locked backup
cp data/BACKUP_LOCKED_2026-03-02.json data/QUESTIONS_MASTER_BACKUP.json

# 2. Re-run seed to rebuild all data files
npm run seed

# 3. Verify
npm run test:all
```

The backup file at `data/BACKUP_LOCKED_2026-03-02.json` contains all 374 raw question docs. The master file has the curated 182.
