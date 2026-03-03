const fs = require('fs');
const path = require('path');

const master = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json'), 'utf8'));

// Same hash function as questionDB.js
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

// Deduplicate using the exact same hash the app uses
const seen = {};
const unique = [];
const dupes = [];

master.questions.forEach(q => {
  const h = questionHash(q.query);
  if (seen[h]) {
    // Merge enriched fields into existing (richest version wins)
    const existing = seen[h];
    if (q.intentType && !existing.intentType) existing.intentType = q.intentType;
    if (q.personaFit && !existing.personaFit) existing.personaFit = q.personaFit;
    if (q.bestPersona && !existing.bestPersona) existing.bestPersona = q.bestPersona;
    if (q.volumeTier && !existing.volumeTier) existing.volumeTier = q.volumeTier;
    if (q.enrichedAt && !existing.enrichedAt) existing.enrichedAt = q.enrichedAt;
    if (q.criterion && !existing.criterion) existing.criterion = q.criterion;
    dupes.push(q.query.substring(0, 80));
  } else {
    // Use the app hash as the canonical dedupHash
    q.dedupHash = h;
    q._id = h;
    seen[h] = q;
    unique.push(q);
  }
});

console.log('Input: ' + master.questions.length);
console.log('Unique (by app hash): ' + unique.length);
console.log('Duplicates removed: ' + dupes.length);
console.log('\nRemoved duplicates:');
dupes.forEach((d, i) => console.log('  ' + (i + 1) + '. ' + d + '...'));

// Sort by cluster then query
unique.sort((a, b) => {
  const ca = (a.cluster || '').localeCompare(b.cluster || '');
  if (ca !== 0) return ca;
  return (a.query || '').localeCompare(b.query || '');
});

// Save final
const final = {
  _created: new Date().toISOString(),
  _version: '3.0',
  _note: 'FINAL — 182 unique questions after app-level dedup. Single source of truth.',
  _company: 'Sirion',
  questions: unique,
  count: unique.length
};

const outPath = path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json');
fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf8');
console.log('\nSaved: data/QUESTIONS_MASTER.json (' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB)');
