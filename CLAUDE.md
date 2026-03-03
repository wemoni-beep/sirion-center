# CLAUDE.md - Xtrusio Growth Engine

## Project Overview
React + Vite app (no TypeScript). 5 modules: M1 Question Generator, M2 Perception Monitor, M3 Authority Ring, M4 Buying Stage Guide, M5 CLM Advisor. Deployed on Cloudflare Pages at sirion-center.pages.dev.

---

## 1. PLAN MODE DEFAULT

- **Always enter plan mode** for any change touching 2+ files or involving state/data flow.
- If a fix breaks something else, **stop and re-plan** instead of patching forward.
- Before writing code, check how data flows: PipelineContext -> module -> persistence.
- The user is not a developer. Explain trade-offs in plain language, not jargon.

## 2. SUBAGENT STRATEGY

- Use **Explore agents** to search the codebase before making changes. This project has ~8000+ lines across modules.
- Run **parallel agents** when investigating multi-module issues (e.g., one agent per module).
- Keep the main context clean: offload research, never read 2000-line files inline.

## 3. SELF-IMPROVEMENT LOOP

- After fixing a bug caused by a pattern, add it to the "Known Pitfalls" section below.
- Review this file at the start of every session.
- If a fix required 3+ iterations, the approach was wrong -- document what the right approach was.

## 4. VERIFICATION BEFORE DONE

- **MANDATORY**: Run `npx vite build` after every code change. Zero errors required.
- Start the dev server via `preview_start` (name: "xtrusio-dev") and verify:
  - Dashboard loads with no console errors
  - Navigate to the modified module -- confirm it renders
  - Check for network errors (no 404s, no failed requests that shouldn't fail)
- Never say "done" without proving the app builds AND loads.

## 5. DEMAND ELEGANCE (BALANCED)

- For data flow changes: pause and ask "is there a simpler path?"
- For UI tweaks: just do it, don't over-engineer.
- Avoid adding new persistence layers. We have enough: Pipeline (source of truth) -> localStorage (fast cache) -> Firebase (cloud backup).

## 6. AUTONOMOUS BUG FIXING

- When given a bug report, reproduce it first (check the deployed site or dev server).
- Point at the exact line causing the issue before proposing a fix.
- Fix it, build it, verify it. Zero context switching from the user.

---

## Architecture Rules

### Data Flow (Single Source of Truth)
```
Module State (React) --> updateModule("m1", data) --> PipelineContext dispatch
                                                      |
                                                      v
                                              persistenceManager.enqueueSave()
                                                      |
                                              +-------+-------+
                                              |               |
                                         localStorage    Firebase
                                         (sync, fast)   (async, durable)
```

- **PipelineContext** is the single source of truth for cross-module data.
- Each module reads from `pipeline.mX` and writes via `updateModule("mX", {...})`.
- `persistenceManager.js` batches saves (1.5s window) to localStorage + Firebase.
- **Never** save directly to Firebase from modules for pipeline data. Always go through `updateModule`.
- Module-specific collections (m1_questions_v2, m1_personas, m2_scan_results) are fine for large datasets.

### State Restoration Priority
1. Firebase (cloud, survives cross-device)
2. localStorage snapshot (fast, same-device)
3. Pipeline migration from existing state
4. INITIAL_STATE defaults

### Module Communication
- M1 -> M2: `exportToM2()` pushes questions to `pipeline.m1.questions`
- M2 -> M3: `pipeline.m2.scanResults` consumed by M3 Authority Ring
- M1 -> M4: `pipeline.m1.personaProfiles` consumed by M4 Buying Stage Guide
- Each module stamps `generationId` so downstream modules detect staleness.

---

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.jsx` | ~800 | Shell, sidebar, Dashboard, routing |
| `src/QuestionGenerator.jsx` | ~3500 | M1: questions, enrichment, decision matrix, persona research |
| `src/PerceptionMonitor.jsx` | ~2000 | M2: AI perception scanning across LLMs |
| `src/AuthorityRing.jsx` | ~1800 | M3: authority domain gap analysis |
| `src/BuyingStageGuide.jsx` | ~1500 | M4: buyer readiness intelligence |
| `src/CLMAdvisor.jsx` | ~1200 | M5: vendor comparison engine |
| `src/PipelineContext.jsx` | ~200 | Central state + persistence orchestration |
| `src/persistenceManager.js` | ~100 | Batched save queue (localStorage + Firebase) |
| `src/firebase.js` | ~250 | Firebase Firestore REST API wrapper |
| `src/claudeApi.js` | ~150 | Claude/Gemini API calls with rate limiting |
| `src/questionDB.js` | ~200 | IndexedDB for M1 question storage |

---

## Theme Pattern

M2 and M3 use a local theme object pattern:
```javascript
const T_DARK = { bg: "#0a0a0f", text: "#e4e4e7", ... };
const T_LIGHT = { bg: "#fafafa", text: "#18181b", ... };
let T = { ...T_DARK }; // module-level default

// Inside the component:
T = _globalTheme.mode === "light" ? { ...T_LIGHT } : { ...T_DARK };
```
**Always ensure both T_DARK and T_LIGHT have the same keys.** Missing keys cause invisible text or broken layouts in the other mode.

---

## Known Pitfalls

### 1. Race condition in updateModule (FIXED)
`stateRef.current` was read before React processed `dispatch`. Fix: use `queueMicrotask` to delay persistence read.

### 2. File backup doesn't work in production (FIXED)
`/__api/backup/` was Vite dev middleware only. Removed entirely. Never add file-based persistence back.

### 3. DATA_VERSION cache clearing is aggressive
Bumping `DATA_VERSION` in PipelineContext wipes localStorage AND IndexedDB. Only bump when the data schema truly changes. Never bump just for code changes.

### 4. Decision scores were localStorage-only (FIXED)
Now saved to `pipeline.m1.decisionScores`. Both auto-grade and manual scores persist to pipeline.

### 5. Persona profiles not restored on new domain (FIXED)
Added pipeline fallback: if Firebase + IndexedDB are empty, hydrate from `pipeline.m1.personaProfiles`.

### 6. M3 had no useEffect import
AuthorityRing.jsx was missing `useEffect` in its React import, causing a black screen. Always verify imports when editing module files.

### 7. Questions merge from 4 tiers
The `questions` useMemo in QuestionGenerator merges: Pipeline -> Static Q_BANK -> KB (IndexedDB) -> AI-generated. Enrichment fields (intentType, personaFit) come from KB tier. If IndexedDB is empty, enrichment data disappears unless pipeline has it.

### 8. Firebase project mismatch on deploy
Dev uses `sirion-persona-stage`. Deploy may use a different project. Check `VITE_FIREBASE_PROJECT_ID` env var in Cloudflare Pages settings.

---

## Dev Commands

```bash
# Development
npx vite --port 5200          # Dev server (or use preview_start "xtrusio-dev")

# Build (MUST pass before any PR/deploy)
npx vite build                # Output: dist/

# Deploy (Cloudflare Pages)
# Push to git repo linked to Cloudflare Pages, or:
npx wrangler pages deploy dist/
```

---

## User Context

- The user (Gaurav) is a marketing/growth professional, not a developer.
- He operates at 125% browser zoom -- always test at that scale.
- Dark mode is primary, but light mode must also work.
- Content should center-align: `maxWidth: 1200, margin: "0 auto"`.
- He gets frustrated by the fix-test-break cycle. Always verify end-to-end before saying "done".
- He deploys to Cloudflare Pages and expects the deployed version to work identically to local.
