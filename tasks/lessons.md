# Lessons Learned

Review this at the start of every session.

---

## 2026-03-03: Data Consistency Overhaul

**Problem**: Dashboard showed different numbers than modules. Scans didn't propagate. Endless fix-test-break cycle.

**Root Cause**: 4 independent persistence layers (IndexedDB, localStorage, file backup, Firebase) with no coordination. Race conditions in updateModule. No scan versioning.

**Solution**:
- Created persistenceManager.js (batched save queue)
- Made PipelineContext the single source of truth
- Removed file backup (dev-only, broke in production)
- Added generationId for scan versioning
- Added staleness warnings on Dashboard

**Lesson**: Never add a new persistence layer. Always route through PipelineContext -> persistenceManager.

---

## 2026-03-03: Decision Matrix Scores Lost on Deploy

**Problem**: Decision scores only saved to localStorage. New domain = fresh localStorage = all scores gone.

**Root Cause**: `decisionScores` state initialized from `xt_decision_scores` in localStorage, never saved to pipeline.

**Solution**: Save to `pipeline.m1.decisionScores` via updateModule. Restore from pipeline when localStorage is empty.

**Lesson**: Any user-generated data that matters must go through the pipeline, not just localStorage.

---

## 2026-03-03: DATA_VERSION Bump Wiped Everything

**Problem**: Bumping DATA_VERSION cleared localStorage + IndexedDB on first load, destroying all user data.

**Root Cause**: `clearStaleCache()` IIFE runs synchronously before React mounts. It deletes xtrusio-m1 IndexedDB and xt_pipeline_snapshot.

**Lesson**: Only bump DATA_VERSION when the data schema genuinely changes. Never bump for code-only changes. When you do bump, ensure Firebase has the data so it can restore.

---

## 2026-03-03: Persona Profiles Not Restored

**Problem**: After deploying to new domain, persona research profiles disappeared.

**Root Cause**: Profiles loaded from Firebase (m1_personas) or IndexedDB. Both empty on new domain. Pipeline had the data but nothing pulled from it.

**Solution**: Added useEffect to restore from pipeline.m1.personaProfiles when both sources are empty.

**Lesson**: Always add a pipeline fallback for any data that loads from IndexedDB or Firebase.

---

## Template for New Entries

```
## YYYY-MM-DD: Short Title

**Problem**: What went wrong?

**Root Cause**: Why did it go wrong?

**Solution**: What was done to fix it?

**Lesson**: What rule prevents this in the future?
```
