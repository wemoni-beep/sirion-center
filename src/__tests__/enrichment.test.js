/**
 * ═══════════════════════════════════════════════════════════
 * enrichment.test.js — Tests that enrichment data flows correctly
 *
 * These tests protect against the #1 bug: INTENT and FIT columns
 * showing "—" after enrichment. They verify the data layer,
 * not the UI rendering (that's what E2E tests are for).
 * ═══════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load the actual data files the app uses ──
function loadMasterQuestions() {
  const masterPath = path.join(__dirname, '..', '..', 'data', 'QUESTIONS_MASTER.json');
  return JSON.parse(fs.readFileSync(masterPath, 'utf8'));
}

function loadPipelineDoc() {
  const pipePath = path.join(__dirname, '..', '..', 'data', 'pipelines', 'local_master.json');
  return JSON.parse(fs.readFileSync(pipePath, 'utf8'));
}

// ── The same hash function used by the app (questionDB.js) ──
function questionHash(text) {
  const normalized = text.toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

describe('QUESTIONS_MASTER.json', () => {
  it('has exactly 182 questions', () => {
    const master = loadMasterQuestions();
    expect(master.questions.length).toBe(182);
    expect(master.count).toBe(182);
  });

  it('every question has intentType', () => {
    const master = loadMasterQuestions();
    const missing = master.questions.filter(q => !q.intentType);
    expect(missing.length).toBe(0);
  });

  it('every question has personaFit', () => {
    const master = loadMasterQuestions();
    const missing = master.questions.filter(q => q.personaFit == null);
    expect(missing.length).toBe(0);
  });

  it('every question has volumeTier', () => {
    const master = loadMasterQuestions();
    const missing = master.questions.filter(q => !q.volumeTier);
    expect(missing.length).toBe(0);
  });

  it('intentType values are valid', () => {
    const master = loadMasterQuestions();
    const valid = ['generic', 'category', 'vendor', 'decision'];
    master.questions.forEach(q => {
      expect(valid).toContain(q.intentType);
    });
  });

  it('personaFit values are 1-10', () => {
    const master = loadMasterQuestions();
    master.questions.forEach(q => {
      expect(q.personaFit).toBeGreaterThanOrEqual(1);
      expect(q.personaFit).toBeLessThanOrEqual(10);
    });
  });

  it('volumeTier values are valid', () => {
    const master = loadMasterQuestions();
    const valid = ['high', 'medium', 'niche'];
    master.questions.forEach(q => {
      expect(valid).toContain(q.volumeTier);
    });
  });

  it('no duplicate questions by hash', () => {
    const master = loadMasterQuestions();
    const seen = new Set();
    const dupes = [];
    master.questions.forEach(q => {
      const h = questionHash(q.query);
      if (seen.has(h)) dupes.push(q.query.substring(0, 60));
      seen.add(h);
    });
    expect(dupes).toEqual([]);
  });

  it('all 8 personas are represented', () => {
    const master = loadMasterQuestions();
    const personas = new Set(master.questions.map(q => q.persona));
    expect(personas.size).toBe(8);
    ['gc', 'cpo', 'cio', 'vplo', 'cto', 'cm', 'pd', 'cfo'].forEach(p => {
      expect(personas.has(p)).toBe(true);
    });
  });

  it('all 9 clusters are represented', () => {
    const master = loadMasterQuestions();
    const clusters = new Set(master.questions.map(q => q.cluster));
    expect(clusters.size).toBe(9);
  });
});

describe('Pipeline document (local_master.json)', () => {
  it('has 182 questions in m1', () => {
    const pipeline = loadPipelineDoc();
    expect(pipeline.m1.questions.length).toBe(182);
  });

  it('pipeline questions carry intentType', () => {
    const pipeline = loadPipelineDoc();
    const missing = pipeline.m1.questions.filter(q => !q.intentType);
    expect(missing.length).toBe(0);
  });

  it('pipeline questions carry personaFit', () => {
    const pipeline = loadPipelineDoc();
    const missing = pipeline.m1.questions.filter(q => q.personaFit == null);
    expect(missing.length).toBe(0);
  });

  it('pipeline questions carry volumeTier', () => {
    const pipeline = loadPipelineDoc();
    const missing = pipeline.m1.questions.filter(q => !q.volumeTier);
    expect(missing.length).toBe(0);
  });

  it('pipeline questions carry criterion for Decision Matrix', () => {
    const pipeline = loadPipelineDoc();
    // Most questions should have criterion (173/182 in master)
    const withCriterion = pipeline.m1.questions.filter(q => q.criterion);
    expect(withCriterion.length).toBeGreaterThan(150);
    // GC should have coverage across its 7 criteria
    const gcCriteria = new Set(
      pipeline.m1.questions.filter(q => q.criterion && q.criterion.startsWith('gc.')).map(q => q.criterion)
    );
    expect(gcCriteria.size).toBeGreaterThanOrEqual(5);
  });

  it('has 8 personas', () => {
    const pipeline = loadPipelineDoc();
    expect(pipeline.m1.personas.length).toBe(8);
  });

  it('has 9 clusters', () => {
    const pipeline = loadPipelineDoc();
    expect(pipeline.m1.clusters.length).toBe(9);
  });

  it('questions have cluster field (not cw)', () => {
    const pipeline = loadPipelineDoc();
    const withCw = pipeline.m1.questions.filter(q => q.cw !== undefined);
    expect(withCw.length).toBe(0);
    const withCluster = pipeline.m1.questions.filter(q => q.cluster);
    expect(withCluster.length).toBe(182);
  });

  it('meta has correct company', () => {
    const pipeline = loadPipelineDoc();
    expect(pipeline.meta.company).toBe('Sirion');
  });
});

describe('Pipeline snapshot matches pipeline', () => {
  it('snapshot has same question count as pipeline', () => {
    const pipeline = loadPipelineDoc();
    const snapPath = path.join(__dirname, '..', '..', 'data', 'pipeline_snapshot', 'current.json');
    const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    expect(snapshot.m1.questions.length).toBe(pipeline.m1.questions.length);
  });
});

describe('Individual question files (m1_questions_v2)', () => {
  it('has at least 182 question files', () => {
    // The app may add AI/persona-generated questions on top of the 182 canonical ones
    const qDir = path.join(__dirname, '..', '..', 'data', 'm1_questions_v2');
    const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(182);
  });

  it('canonical (enriched) files have enrichment data', () => {
    // Only canonical files (those with enrichedAt set) must have intentType + personaFit.
    // AI/persona-generated files may legitimately lack enrichment fields.
    const qDir = path.join(__dirname, '..', '..', 'data', 'm1_questions_v2');
    const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json'));
    let missingIntent = 0;
    let missingFit = 0;
    files.forEach(f => {
      const q = JSON.parse(fs.readFileSync(path.join(qDir, f), 'utf8'));
      if (!q.enrichedAt) return;   // skip non-canonical files
      if (!q.intentType) missingIntent++;
      if (q.personaFit == null) missingFit++;
    });
    expect(missingIntent).toBe(0);
    expect(missingFit).toBe(0);
  });
});
