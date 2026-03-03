const fs = require('fs');
const path = require('path');

const backup = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'BACKUP_LOCKED_2026-03-02.json'), 'utf8'));

// Group by query text (normalized)
const byQuery = {};
backup.questions.forEach(q => {
  const key = (q.query || '').trim();
  if (!key) return;
  if (!byQuery[key]) byQuery[key] = [];
  byQuery[key].push(q);
});

// Merge: for each unique query, combine all fields — enriched version wins
const merged = [];
Object.entries(byQuery).forEach(([queryText, versions]) => {
  // Sort: enriched versions first (has enrichedAt), then by updated_at desc
  versions.sort((a, b) => {
    if (a.enrichedAt && !b.enrichedAt) return -1;
    if (!a.enrichedAt && b.enrichedAt) return 1;
    return (b.updated_at || '').localeCompare(a.updated_at || '');
  });

  // Start with base, layer enriched fields on top (richest wins)
  const base = {};
  versions.reverse().forEach(v => {
    Object.entries(v).forEach(([k, val]) => {
      if (val !== null && val !== undefined && val !== '') base[k] = val;
    });
  });

  // Use the enriched version's dedupHash as canonical ID
  base._id = versions[0].dedupHash || versions[0]._id;
  base.dedupHash = base._id;

  // Remove _cachedAt (internal cache field, not needed)
  delete base._cachedAt;

  merged.push(base);
});

// Sort by cluster then query for readability
merged.sort((a, b) => {
  const ca = (a.cluster || '').localeCompare(b.cluster || '');
  if (ca !== 0) return ca;
  return (a.query || '').localeCompare(b.query || '');
});

// === Stats ===
const fields = ['persona', 'lifecycle', 'stage', 'intentType', 'personaFit', 'cluster', 'volumeTier', 'enrichedAt', 'bestPersona', 'classification', 'source'];
console.log('=== MERGED RESULT ===');
console.log('Unique questions: ' + merged.length);
console.log('');
console.log('Field coverage:');
fields.forEach(f => {
  const count = merged.filter(q => q[f] !== null && q[f] !== undefined && q[f] !== '').length;
  console.log('  ' + f + ': ' + count + '/' + merged.length + (count === merged.length ? ' (complete)' : ''));
});

// Lifecycle breakdown
const lcCounts = {};
merged.forEach(q => { const lc = q.lifecycle || 'unknown'; lcCounts[lc] = (lcCounts[lc] || 0) + 1; });
console.log('\nLifecycle breakdown:');
Object.entries(lcCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// Persona breakdown
const pCounts = {};
merged.forEach(q => { const p = q.persona || 'unknown'; pCounts[p] = (pCounts[p] || 0) + 1; });
console.log('\nPersona breakdown:');
Object.entries(pCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// Stage breakdown
const sCounts = {};
merged.forEach(q => { const s = q.stage || 'unknown'; sCounts[s] = (sCounts[s] || 0) + 1; });
console.log('\nStage breakdown:');
Object.entries(sCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// Cluster breakdown
const clCounts = {};
merged.forEach(q => { const c = q.cluster || 'unknown'; clCounts[c] = (clCounts[c] || 0) + 1; });
console.log('\nCluster breakdown:');
Object.entries(clCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// IntentType breakdown
const itCounts = {};
merged.forEach(q => { const i = q.intentType || 'NOT_ENRICHED'; itCounts[i] = (itCounts[i] || 0) + 1; });
console.log('\nIntent type breakdown:');
Object.entries(itCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// === Save ===
const cleanData = {
  _created: new Date().toISOString(),
  _version: '2.0',
  _note: 'CLEAN MASTER — unique queries merged from 374 raw docs. Single source of truth.',
  _company: 'Sirion',
  questions: merged,
  count: merged.length
};

const outPath = path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json');
fs.writeFileSync(outPath, JSON.stringify(cleanData, null, 2), 'utf8');
console.log('\nSaved: data/QUESTIONS_MASTER.json (' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB)');
