const fs = require('fs');
const path = require('path');

const master = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json'), 'utf8'));

// Keep only fully enriched questions (have intentType + personaFit + volumeTier)
const enriched = master.questions.filter(q => q.intentType && q.personaFit && q.volumeTier);
const dropped = master.questions.filter(q => !(q.intentType && q.personaFit && q.volumeTier));

console.log('Total: ' + master.questions.length);
console.log('Fully enriched: ' + enriched.length);
console.log('Dropped (incomplete): ' + dropped.length);
console.log('\nDropped questions:');
dropped.forEach((q, i) => console.log('  ' + (i+1) + '. ' + q.query.substring(0, 80) + '...'));

// Sort by cluster then query
enriched.sort((a, b) => {
  const ca = (a.cluster || '').localeCompare(b.cluster || '');
  if (ca !== 0) return ca;
  return (a.query || '').localeCompare(b.query || '');
});

const final = {
  _created: new Date().toISOString(),
  _version: 'FINAL',
  _note: '182 fully enriched questions. Single source of truth.',
  _company: 'Sirion',
  questions: enriched,
  count: enriched.length
};

const outPath = path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json');
fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf8');
console.log('\nSaved: data/QUESTIONS_MASTER.json (' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB)');
