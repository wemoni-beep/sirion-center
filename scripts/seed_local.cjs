/**
 * Seed local data/ directory from QUESTIONS_MASTER.json
 * Creates individual question files + clean pipeline doc
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const master = JSON.parse(fs.readFileSync(path.join(dataDir, 'QUESTIONS_MASTER.json'), 'utf8'));

console.log('Source: QUESTIONS_MASTER.json (' + master.count + ' questions)');

// === 1. Clear and re-seed m1_questions_v2 ===
const qDir = path.join(dataDir, 'm1_questions_v2');
if (fs.existsSync(qDir)) {
  fs.readdirSync(qDir).forEach(f => fs.unlinkSync(path.join(qDir, f)));
} else {
  fs.mkdirSync(qDir, { recursive: true });
}

master.questions.forEach(q => {
  const id = q.id || q.dedupHash || q._id;
  const doc = { ...q };
  delete doc._id; // _id gets added on read from filename
  fs.writeFileSync(path.join(qDir, id + '.json'), JSON.stringify(doc, null, 2), 'utf8');
});
console.log('Seeded m1_questions_v2/: ' + master.questions.length + ' files');

// === 2. Create clean pipeline doc ===
const pDir = path.join(dataDir, 'pipelines');
if (fs.existsSync(pDir)) {
  fs.readdirSync(pDir).forEach(f => fs.unlinkSync(path.join(pDir, f)));
} else {
  fs.mkdirSync(pDir, { recursive: true });
}

// Build persona profiles from question data
const personaCounts = {};
master.questions.forEach(q => {
  const p = q.persona || 'unknown';
  personaCounts[p] = (personaCounts[p] || 0) + 1;
});

const PERSONA_LABELS = {
  gc: 'General Counsel',
  cpo: 'Chief Procurement Officer',
  cio: 'Chief Information Officer',
  cfo: 'Chief Financial Officer',
  cto: 'Chief Technology Officer',
  vplo: 'VP Legal Operations',
  cm: 'Contract Manager',
  pd: 'Procurement Director',
};

const personaProfiles = Object.entries(personaCounts).map(([id, count]) => ({
  id,
  label: PERSONA_LABELS[id] || id.toUpperCase(),
  questionCount: count,
}));

// Carry over M2 scan data from the good pipeline doc if it exists
let m2Data = { scanResults: null, scores: null, contentGaps: [], personaBreakdown: [], stageBreakdown: [], recommendations: [], scannedAt: null };
let m4Data = { analyses: [], latestStage: null, latestReadiness: null, analyzedAt: null };

const oldPipeline = master.pipeline;
if (oldPipeline && oldPipeline.m2 && oldPipeline.m2.scores) {
  m2Data = oldPipeline.m2;
  console.log('Carried over M2 scan data (overall score: ' + (m2Data.scores ? m2Data.scores.overall : 'N/A') + ')');
}
if (oldPipeline && oldPipeline.m4 && oldPipeline.m4.analyses && oldPipeline.m4.analyses.length > 0) {
  m4Data = oldPipeline.m4;
  console.log('Carried over M4 data (' + m4Data.analyses.length + ' analyses)');
}

const pipelineDoc = {
  meta: { company: 'Sirion', url: 'https://sirion.ai', industry: 'Contract Lifecycle Management' },
  m1: {
    questions: master.questions.map(q => ({
      id: q.id || q.dedupHash || q._id,
      query: q.query,
      persona: q.persona,
      lifecycle: q.lifecycle,
      stage: q.stage,
      cluster: q.cluster,
      source: q.source,
      classification: q.classification,
      intentType: q.intentType || null,
      personaFit: q.personaFit || null,
      bestPersona: q.bestPersona || null,
      volumeTier: q.volumeTier || null,
      criterion: q.criterion || null,
      enrichedAt: q.enrichedAt || null,
    })),
    personas: Object.keys(personaCounts),
    clusters: [...new Set(master.questions.map(q => q.cluster).filter(Boolean))],
    generatedAt: new Date().toISOString(),
    personaProfiles,
  },
  m2: m2Data,
  m3: { prioritizedDomains: [], gapMatrix: null, outreachPlan: null, personaDomainMap: null, gapCount: 0, strongCount: 0, analyzedAt: null },
  m4: m4Data,
  m5: { recommendations: [], leadData: null, generatedAt: null },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

fs.writeFileSync(path.join(pDir, 'local_master.json'), JSON.stringify(pipelineDoc, null, 2), 'utf8');
console.log('Seeded pipelines/local_master.json');
console.log('  M1: ' + pipelineDoc.m1.questions.length + ' questions, ' + pipelineDoc.m1.personas.length + ' personas, ' + pipelineDoc.m1.clusters.length + ' clusters');

// === 3. Update pipeline_snapshot (localStorage mirror) ===
const snapDir = path.join(dataDir, 'pipeline_snapshot');
if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
fs.writeFileSync(path.join(snapDir, 'current.json'), JSON.stringify(pipelineDoc, null, 2), 'utf8');
console.log('Updated pipeline_snapshot/current.json');

console.log('\nDone. Local data is ready.');
