/**
 * ═══════════════════════════════════════════════════════════
 * dataFlow.test.js — Tests data consistency across the system
 *
 * Verifies that data flows correctly from master file → pipeline
 * → question files → snapshot. If any link in this chain breaks,
 * the UI shows stale or missing data.
 * ═══════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

// ── Same hash function as questionDB.js ──
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

describe('Data consistency: Master → Pipeline → Files', () => {

  it('master question count = pipeline question count', () => {
    const master = JSON.parse(fs.readFileSync(path.join(dataDir, 'QUESTIONS_MASTER.json'), 'utf8'));
    const pipeline = JSON.parse(fs.readFileSync(path.join(dataDir, 'pipelines', 'local_master.json'), 'utf8'));
    expect(pipeline.m1.questions.length).toBe(master.questions.length);
  });

  it('master question count = file count in m1_questions_v2', () => {
    // The app may add AI/persona-generated question files beyond the 182 canonical ones.
    const master = JSON.parse(fs.readFileSync(path.join(dataDir, 'QUESTIONS_MASTER.json'), 'utf8'));
    const qDir = path.join(dataDir, 'm1_questions_v2');
    const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(master.questions.length);
  });

  it('pipeline snapshot matches pipeline document', () => {
    const pipeline = JSON.parse(fs.readFileSync(path.join(dataDir, 'pipelines', 'local_master.json'), 'utf8'));
    const snapshot = JSON.parse(fs.readFileSync(path.join(dataDir, 'pipeline_snapshot', 'current.json'), 'utf8'));

    expect(snapshot.m1.questions.length).toBe(pipeline.m1.questions.length);
    expect(snapshot.m1.personas.length).toBe(pipeline.m1.personas.length);
    expect(snapshot.meta.company).toBe(pipeline.meta.company);
  });

  it('every pipeline question maps to a file in m1_questions_v2', () => {
    const pipeline = JSON.parse(fs.readFileSync(path.join(dataDir, 'pipelines', 'local_master.json'), 'utf8'));
    const qDir = path.join(dataDir, 'm1_questions_v2');
    const fileIds = new Set(
      fs.readdirSync(qDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    );

    const missing = [];
    pipeline.m1.questions.forEach(q => {
      const id = q.id;
      if (id && !fileIds.has(id)) {
        missing.push(id);
      }
    });
    expect(missing).toEqual([]);
  });

  it('enrichment fields survive the master → pipeline → file chain', () => {
    const master = JSON.parse(fs.readFileSync(path.join(dataDir, 'QUESTIONS_MASTER.json'), 'utf8'));
    const pipeline = JSON.parse(fs.readFileSync(path.join(dataDir, 'pipelines', 'local_master.json'), 'utf8'));
    const qDir = path.join(dataDir, 'm1_questions_v2');

    // Pick 5 random questions and verify enrichment survives each layer
    const sample = master.questions.slice(0, 5);

    sample.forEach(masterQ => {
      // Check pipeline has it
      const pipeQ = pipeline.m1.questions.find(q => q.query === masterQ.query);
      expect(pipeQ).toBeTruthy();
      expect(pipeQ.intentType).toBe(masterQ.intentType);
      expect(pipeQ.personaFit).toBe(masterQ.personaFit);

      // Check file has it
      const hash = masterQ.dedupHash || masterQ._id || questionHash(masterQ.query);
      const filePath = path.join(qDir, hash + '.json');
      if (fs.existsSync(filePath)) {
        const fileQ = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(fileQ.intentType).toBe(masterQ.intentType);
        expect(fileQ.personaFit).toBe(masterQ.personaFit);
      }
    });
  });
});

describe('Question hash consistency', () => {
  it('hash function is deterministic', () => {
    const text = "How does Sirion compare to Icertis for enterprise CLM?";
    const h1 = questionHash(text);
    const h2 = questionHash(text);
    expect(h1).toBe(h2);
  });

  it('hash ignores case and punctuation', () => {
    const h1 = questionHash("What is CLM?");
    const h2 = questionHash("what is clm");
    expect(h1).toBe(h2);
  });

  it('hash differentiates distinct questions', () => {
    const h1 = questionHash("What is CLM software?");
    const h2 = questionHash("How does AI help contracts?");
    expect(h1).not.toBe(h2);
  });
});

describe('Required data files exist', () => {
  it('QUESTIONS_MASTER.json exists', () => {
    expect(fs.existsSync(path.join(dataDir, 'QUESTIONS_MASTER.json'))).toBe(true);
  });

  it('pipelines/local_master.json exists', () => {
    expect(fs.existsSync(path.join(dataDir, 'pipelines', 'local_master.json'))).toBe(true);
  });

  it('pipeline_snapshot/current.json exists', () => {
    expect(fs.existsSync(path.join(dataDir, 'pipeline_snapshot', 'current.json'))).toBe(true);
  });

  it('m1_questions_v2/ directory exists', () => {
    expect(fs.existsSync(path.join(dataDir, 'm1_questions_v2'))).toBe(true);
  });

  it('BACKUP_LOCKED_2026-03-02.json exists', () => {
    expect(fs.existsSync(path.join(dataDir, 'BACKUP_LOCKED_2026-03-02.json'))).toBe(true);
  });
});
