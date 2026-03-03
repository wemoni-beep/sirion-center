/**
 * Reproduce the EXACT merge logic from QuestionGenerator.jsx
 * to get the true 182 unique questions.
 */
const fs = require('fs');
const path = require('path');

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

const company = "Sirion";

// ── Q_BANK: exact copy from QuestionGenerator.jsx lines 88-147 ──
const Q_BANK = [
  { q: "What are the biggest risks of managing enterprise contracts without dedicated CLM software?", p: "gc", s: "awareness", c: "CLM Platform Selection", l: "full-stack" },
  { q: "How is AI changing contract lifecycle management in 2026?", p: "cio", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What is the ROI of implementing a CLM platform for procurement teams?", p: "cpo", s: "awareness", c: "Implementation & ROI", l: "full-stack" },
  { q: "How much revenue leakage occurs from poor contract management?", p: "cfo", s: "awareness", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: "What are the compliance risks of manual contract tracking?", p: "gc", s: "awareness", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: "How does agentic AI apply to contract management workflows?", p: "cto", s: "awareness", c: "Agentic CLM", l: "pre-signature" },
  { q: "What percentage of enterprise contracts are poorly managed?", p: "cm", s: "awareness", c: "CLM Platform Selection", l: "full-stack" },
  { q: "What are the hidden costs of not having a CLM system?", p: "cfo", s: "awareness", c: "Implementation & ROI", l: "full-stack" },
  { q: "How can AI automate contract authoring and template management?", p: "vplo", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What are best practices for AI-powered contract redlining and negotiation?", p: "gc", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "How much time do legal teams waste on manual contract drafting and approvals?", p: "vplo", s: "awareness", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What are the best CLM software platforms for large enterprises?", p: "cio", s: "discovery", c: "CLM Platform Selection", l: "full-stack" },
  { q: "Which CLM solutions offer the strongest AI-powered contract review?", p: "vplo", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "What CLM platforms integrate best with SAP and Oracle procurement?", p: "cpo", s: "discovery", c: "Procurement CLM", l: "full-stack" },
  { q: "Which contract management tools are best for financial services?", p: "gc", s: "discovery", c: "Financial Services CLM", l: "full-stack" },
  { q: "What are the top contract analytics and reporting tools?", p: "cm", s: "discovery", c: "Contract AI / Automation", l: "full-stack" },
  { q: "Which CLM vendors offer no-code workflow configuration?", p: "cto", s: "discovery", c: "Enterprise Scale", l: "full-stack" },
  { q: "What CLM solutions support multi-entity global contract management?", p: "pd", s: "discovery", c: "Enterprise Scale", l: "full-stack" },
  { q: "What are the leading AI-native contract management platforms?", p: "cio", s: "discovery", c: "Agentic CLM", l: "full-stack" },
  { q: "Which CLM platforms have the best pre-signature contract authoring capabilities?", p: "gc", s: "discovery", c: "CLM Platform Selection", l: "pre-signature" },
  { q: "What CLM tools offer AI-powered clause intelligence and playbook automation?", p: "vplo", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  { q: "Best contract negotiation and collaboration tools for enterprise legal teams?", p: "gc", s: "discovery", c: "Contract AI / Automation", l: "pre-signature" },
  { q: `How does ${company} compare to Icertis for enterprise CLM?`, p: "cio", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: `${company} vs Agiloft — which is better for legal teams?`, p: "gc", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: `What do Gartner analysts say about ${company} CLM?`, p: "cpo", s: "consideration", c: "Analyst Rankings", l: "full-stack" },
  { q: `${company} pricing and total cost of ownership for CLM`, p: "cfo", s: "consideration", c: "Implementation & ROI", l: "full-stack" },
  { q: `Is ${company} a Leader in the Gartner Magic Quadrant for CLM?`, p: "vplo", s: "consideration", c: "Analyst Rankings", l: "full-stack" },
  { q: `${company} CLM implementation timeline and complexity`, p: "cto", s: "consideration", c: "Implementation & ROI", l: "full-stack" },
  { q: `How does ${company} handle obligation management and compliance?`, p: "gc", s: "consideration", c: "Post-Signature / Obligations", l: "post-signature" },
  { q: `${company} vs DocuSign CLM — feature comparison`, p: "cm", s: "consideration", c: "CLM Platform Selection", l: "full-stack" },
  { q: `What industries does ${company} CLM support best?`, p: "pd", s: "consideration", c: "Enterprise Scale", l: "full-stack" },
  { q: `Does ${company} support agentic AI for autonomous contract workflows?`, p: "cio", s: "consideration", c: "Agentic CLM", l: "pre-signature" },
  { q: `${company} contract AI capabilities vs competitors`, p: "vplo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  { q: `What is ${company} CLM's approach to procurement automation?`, p: "cpo", s: "consideration", c: "Procurement CLM", l: "full-stack" },
  { q: `How does ${company} pre-signature contract authoring compare to Ironclad?`, p: "gc", s: "consideration", c: "CLM Platform Selection", l: "pre-signature" },
  { q: `${company} AI redlining and clause intelligence — how does it work?`, p: "vplo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  { q: `Does ${company} offer automated contract negotiation workflows?`, p: "cpo", s: "consideration", c: "Contract AI / Automation", l: "pre-signature" },
  { q: `What do ${company} CLM customers say in G2 reviews?`, p: "vplo", s: "decision", c: "Analyst Rankings", l: "full-stack" },
  { q: `${company} CLM case studies in financial services`, p: "gc", s: "decision", c: "Financial Services CLM", l: "full-stack" },
  { q: `How long does ${company} CLM take to show ROI?`, p: "cfo", s: "decision", c: "Implementation & ROI", l: "full-stack" },
  { q: `${company} CLM security certifications and compliance`, p: "cto", s: "decision", c: "Enterprise Scale", l: "full-stack" },
  { q: `What support and training does ${company} provide for CLM?`, p: "cm", s: "decision", c: "Implementation & ROI", l: "full-stack" },
  { q: `${company} contract management for global procurement teams`, p: "pd", s: "decision", c: "Procurement CLM", l: "full-stack" },
  { q: `How does ${company} compare on Forrester Wave for CLM?`, p: "cpo", s: "decision", c: "Analyst Rankings", l: "full-stack" },
  { q: `${company} CLM integration with existing enterprise tech stack`, p: "cio", s: "decision", c: "Enterprise Scale", l: "full-stack" },
  { q: `Is ${company} CLM worth the investment after 1 year?`, p: "cfo", s: "validation", c: "Implementation & ROI", l: "full-stack" },
  { q: `${company} CLM user satisfaction and NPS scores`, p: "vplo", s: "validation", c: "Analyst Rankings", l: "full-stack" },
  { q: `How to maximize ROI from ${company} CLM deployment`, p: "cm", s: "validation", c: "Implementation & ROI", l: "full-stack" },
  { q: `${company} CLM roadmap and future AI capabilities`, p: "cio", s: "validation", c: "Agentic CLM", l: "pre-signature" },
  { q: `Best practices for scaling ${company} CLM across business units`, p: "pd", s: "validation", c: "Enterprise Scale", l: "full-stack" },
];

// ── Load pipeline questions (192) ──
const master = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json'), 'utf8'));

// ── Reproduce the exact merge from QuestionGenerator lines 838-903 ──
const seenMap = new Map();
const merged = [];

function addQ(q, opts = {}) {
  const { mergeMetadata = false, mergeEnrichment = false } = opts;
  const hash = questionHash(q.query);
  if (!seenMap.has(hash)) {
    seenMap.set(hash, merged.length);
    merged.push({ ...q, _hash: hash });
  } else {
    const existing = merged[seenMap.get(hash)];
    if (mergeMetadata) {
      if (!existing.persona && q.persona) existing.persona = q.persona;
      if (!existing.stage && q.stage) existing.stage = q.stage;
      if (!existing.cluster && q.cluster) existing.cluster = q.cluster;
      if (!existing.lifecycle && q.lifecycle) existing.lifecycle = q.lifecycle;
      if (!existing.classification && q.classification) existing.classification = q.classification;
    }
    if (mergeEnrichment) {
      if (q.personaFit != null) existing.personaFit = q.personaFit;
      if (q.bestPersona) existing.bestPersona = q.bestPersona;
      if (q.intentType) existing.intentType = q.intentType;
      if (q.volumeTier) existing.volumeTier = q.volumeTier;
      if (q.criterion) existing.criterion = q.criterion;
      if (q.enrichedAt) existing.enrichedAt = q.enrichedAt;
    }
  }
}

// Tier 1: Pipeline questions
master.questions.forEach(q => addQ({
  id: q.dedupHash || q._id,
  query: q.query,
  persona: q.persona,
  stage: q.stage,
  cluster: q.cluster,
  lifecycle: q.lifecycle || "full-stack",
  source: q.source || "pipeline",
  classification: q.classification || "macro",
  // carry enrichment fields
  intentType: q.intentType,
  personaFit: q.personaFit,
  bestPersona: q.bestPersona,
  volumeTier: q.volumeTier,
  criterion: q.criterion,
  enrichedAt: q.enrichedAt,
}));

console.log('After pipeline: ' + merged.length);

// Tier 2: Q_BANK (fills missing metadata, adds NEW questions not in pipeline)
Q_BANK.forEach((q, i) => addQ({
  id: `q-${i + 1}`,
  query: q.q,
  persona: q.p,
  stage: q.s,
  cluster: q.c,
  lifecycle: q.l || "full-stack",
  source: "static",
  classification: "macro",
}, { mergeMetadata: true }));

console.log('After Q_BANK merge: ' + merged.length);

// Count how many Q_BANK questions were NEW (not in pipeline)
const pipelineHashes = new Set(master.questions.map(q => questionHash(q.query)));
let newFromQBank = 0;
let overlapFromQBank = 0;
Q_BANK.forEach(q => {
  const h = questionHash(q.q);
  if (pipelineHashes.has(h)) {
    overlapFromQBank++;
  } else {
    newFromQBank++;
    console.log('  NEW from Q_BANK: "' + q.q.substring(0, 70) + '..."');
  }
});
console.log('Q_BANK overlap with pipeline: ' + overlapFromQBank);
console.log('Q_BANK NEW additions: ' + newFromQBank);
console.log('');
console.log('FINAL merged count: ' + merged.length);

// Sort
merged.sort((a, b) => {
  const ca = (a.cluster || '').localeCompare(b.cluster || '');
  if (ca !== 0) return ca;
  return (a.query || '').localeCompare(b.query || '');
});

// Clean up internal fields
merged.forEach(q => { delete q._hash; });

// Save
const final = {
  _created: new Date().toISOString(),
  _version: '3.0',
  _note: 'FINAL — exact app-level dedup (pipeline + Q_BANK merge). Single source of truth.',
  _company: company,
  questions: merged,
  count: merged.length
};

const outPath = path.join(__dirname, '..', 'data', 'QUESTIONS_MASTER.json');
fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf8');
console.log('\nSaved: data/QUESTIONS_MASTER.json (' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB, ' + merged.length + ' questions)');
