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

### 8. StrictMode destroys PersistenceManager (FIXED)
React 18 StrictMode mounts→unmounts→remounts. The PM cleanup called `destroy()` (setting `_destroyed = true`) but didn't null the ref, so the remount skipped recreation (`if (!pmRef.current)` was truthy). Fix: null `pmRef.current` in the cleanup so the next render creates a fresh PM instance.

### 9. Firebase project mismatch on deploy
Dev uses `sirion-persona-stage`. Deploy may use a different project. Check `VITE_FIREBASE_PROJECT_ID` env var in Cloudflare Pages settings.

---

## Dev Commands

```bash
# Development
npx vite --port 5200          # Dev server (or use preview_start "xtrusio-dev")

# Build (MUST pass before any PR/deploy)
npx vite build                # Output: dist/
```

---

## Deployment Checklist (Cloudflare Workers)

**CRITICAL: Follow this EVERY time after making code changes.**

```bash
# Step 1: Build locally
npx vite build

# Step 2: Stage the updated dist + any source changes
git add dist/ src/ [any other changed files]

# Step 3: Commit
git commit -m "Description of what changed"

# Step 4: Push to GitHub (triggers Cloudflare auto-deploy)
git push origin main
```

**Cloudflare will auto-deploy from the committed `dist/` folder. No build step runs on Cloudflare.**

### Cloudflare Settings (DO NOT CHANGE)
- **Build command**: EMPTY (no build on Cloudflare -- we commit pre-built dist/)
- **Deploy command**: `npx wrangler deploy`
- **Root directory**: `/`
- **Output dir**: `dist` (set in wrangler.toml)
- **Firebase env vars**: `VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_PROJECT_ID` (set as secrets)
- **Project uses npm, NOT pnpm** -- never set build command to `pnpm run build`

### Deployment Pitfalls
1. If `dist/` is in `.gitignore`, JS bundles won't reach Cloudflare -- site loads blank
2. If Cloudflare build command is set to `pnpm run build`, it fails silently and serves stale code
3. Always verify deployment by checking the live URL in incognito (avoids browser cache)
4. If something looks wrong on deployed site, run `curl -s <URL> | head -15` to check the HTML references the correct JS hash

### Live URLs
- **Production**: https://sirion-center.wemoni.workers.dev
- **Cloudflare Dashboard**: dash.cloudflare.com > Workers & Pages > sirion-center

---

## Pending Features

### Dashboard Fixes (Approved, Not Started)
1. **M2 data not showing on dashboard** - M2 has scan data but dashboard widgets (AI Visibility by LLM) show empty. Investigate why pipeline.m2 isn't being read.
2. **CLM Lifecycle Coverage** - Shows 0/0/0. Find where this data comes from and fix it.
3. **Domain Priority Distribution** - Chart is empty/broken. Fix data source.
4. **Remove useless sections** - "Command Center" header and Growth Pipeline funnel are wasting space. User wants actionable data, not decoration.

### AI Chat / Strategy Advisor (Approved, Not Started)
An AI chat panel that reads existing pipeline data (M1 questions, M2 scan results, M3 authority gaps, M4 buyer stages) and:
- Identifies gap areas automatically (e.g. "Sirion has zero presence on 14 authority domains")
- Suggests actionable next steps (e.g. "Publish content on G2, TrustRadius to close authority gaps")
- Answers questions about the data (e.g. "Which persona has the weakest coverage?")
- Uses Claude API (already in claudeApi.js) with pipeline data as context
- Could be a slide-out panel or a dedicated page

### URL Routing (Approved, Not Started)
Add browser URL routing so each module has its own URL. Refresh stays on the same page, back/forward works, links are shareable.
- `/` = Dashboard, `/m1` = Question Generator, `/m1/matrix` `/m1/research` for tabs
- `/m2` = Perception Monitor, `/m3` = Authority Ring, `/m4` = Buying Stage Guide, `/m5` = CLM Advisor, `/settings` = Settings
- Sync `activePage` state with `window.location` using History API (no react-router needed)
- Low complexity, ~15-20 min

---

## User Context

- The user (Gaurav) is a marketing/growth professional, not a developer.
- He operates at 125% browser zoom -- always test at that scale.
- Dark mode is primary, but light mode must also work.
- Content should center-align: `maxWidth: 1200, margin: "0 auto"`.
- He gets frustrated by the fix-test-break cycle. Always verify end-to-end before saying "done".
- He deploys to Cloudflare Workers and expects the deployed version to work identically to local.
