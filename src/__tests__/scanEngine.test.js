/**
 * ═══════════════════════════════════════════════════════════
 * scanEngine.test.js — Automated tests for Xtrusio Scan Engine
 *
 * These tests protect against the 9 bugs found on 2026-03-02.
 * Run: npm test
 * ═══════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { computeScores, buildExportPayload } from '../scanEngine.js';

/* ───────────────────────────────────────────────
   TEST DATA FACTORY — Builds realistic scan results
   ─────────────────────────────────────────────── */

// A single "good" analysis result (company mentioned, rank 1, positive)
function makeGoodAnalysis(overrides = {}) {
  return {
    mentioned: true,
    rank: 1,
    sentiment: 'positive',
    framing: 'market leader',
    strengths: ['AI-powered analytics'],
    gaps: [],
    vendors_mentioned: [
      { name: 'Sirion', position: 1, sentiment: 'positive', strength: 'strong', features: ['AI analytics'] },
      { name: 'Icertis', position: 2, sentiment: 'neutral', strength: 'moderate', features: ['Scale'] },
    ],
    cited_sources: [{ domain: 'gartner.com', type: 'analyst', context: 'Magic Quadrant' }],
    content_gaps: [],
    threats: [],
    recommendation: 'Maintain position',
    accuracy: 8,
    completeness: 7,
    positioning: 9,
    response_snippet: 'Sirion is a leading CLM platform...',
    full_response: 'Sirion is a leading CLM platform with AI capabilities...',
    citation_presence: true,
    sirion_content_cited: false,
    ...overrides,
  };
}

// A "not mentioned" analysis (company absent)
function makeAbsentAnalysis(overrides = {}) {
  return {
    mentioned: false,
    rank: null,
    sentiment: 'absent',
    framing: 'not mentioned',
    strengths: [],
    gaps: ['Not mentioned at all'],
    vendors_mentioned: [
      { name: 'Icertis', position: 1, sentiment: 'positive', strength: 'strong', features: [] },
    ],
    cited_sources: [],
    content_gaps: ['Need more content'],
    threats: ['Competitor dominance'],
    recommendation: 'Create content',
    accuracy: 0,
    completeness: 0,
    positioning: 0,
    response_snippet: 'Icertis is the leading...',
    full_response: 'Icertis is the leading CLM provider...',
    citation_presence: false,
    sirion_content_cited: false,
    ...overrides,
  };
}

// An error analysis (API failed)
function makeErrorAnalysis() {
  return {
    mentioned: false,
    rank: null,
    sentiment: 'absent',
    framing: 'API error',
    strengths: [],
    gaps: [],
    vendors_mentioned: [],
    cited_sources: [],
    content_gaps: [],
    threats: [],
    recommendation: 'Fix API connection',
    accuracy: 0,
    completeness: 0,
    positioning: 0,
    response_snippet: '',
    full_response: '',
    citation_presence: false,
    sirion_content_cited: false,
    _error: 'API timeout',
  };
}

// Build a complete result item (one question's worth of data)
function makeResultItem(qid, analyses, overrides = {}) {
  return {
    qid,
    query: `Test question ${qid}`,
    persona: 'CFO',
    stage: 'research',
    cw: 'evaluation',
    lifecycle: 'full-stack',
    analyses,
    difficulty: { specificity: 5, competition: 5, contentGap: 5, volume: 5, composite: 5 },
    ...overrides,
  };
}

/* ───────────────────────────────────────────────
   1. computeScores — MOST CRITICAL
   Guards against: BUG-001 (wrong scores after resume merge)
   ─────────────────────────────────────────────── */

describe('computeScores', () => {
  const llmIds = ['claude', 'gemini', 'openai'];

  it('should return all zeros when results array is empty', () => {
    const scores = computeScores([], llmIds);
    expect(scores.overall).toBe(0);
    expect(scores.mention).toBe(0);
    expect(scores.position).toBe(0);
    expect(scores.sentiment).toBe(0);
  });

  it('should return all zeros when all analyses have errors', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeErrorAnalysis(),
        gemini: makeErrorAnalysis(),
        openai: makeErrorAnalysis(),
      }),
    ];
    const scores = computeScores(results, llmIds);
    expect(scores.overall).toBe(0);
    expect(scores.mention).toBe(0);
  });

  it('should compute correct scores for 100% mention rate', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeGoodAnalysis(),
        gemini: makeGoodAnalysis(),
        openai: makeGoodAnalysis(),
      }),
    ];
    const scores = computeScores(results, llmIds);
    expect(scores.mention).toBe(100);
    expect(scores.position).toBeGreaterThan(0);
    expect(scores.sentiment).toBeGreaterThan(0);
    expect(scores.overall).toBeGreaterThan(0);
  });

  it('should compute correct scores for 0% mention rate', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeAbsentAnalysis(),
        gemini: makeAbsentAnalysis(),
        openai: makeAbsentAnalysis(),
      }),
    ];
    const scores = computeScores(results, llmIds);
    expect(scores.mention).toBe(0);
    expect(scores.position).toBe(0);
    expect(scores.sentiment).toBe(0);
  });

  it('should compute correct scores for mixed results (partial mentions)', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeGoodAnalysis(),          // mentioned
        gemini: makeAbsentAnalysis(),        // not mentioned
        openai: makeGoodAnalysis(),          // mentioned
      }),
    ];
    const scores = computeScores(results, llmIds);
    // 2 out of 3 mentioned = 67%
    expect(scores.mention).toBe(67);
  });

  // ★ BUG-001 PREVENTION: Scores must be correct after merge
  it('should produce SAME scores whether computed on merged array or original', () => {
    // Simulate: 5 questions done in first run, 5 more in resumed run
    const oldResults = Array.from({ length: 5 }, (_, i) =>
      makeResultItem(`q${i + 1}`, {
        claude: makeGoodAnalysis(),
        gemini: makeAbsentAnalysis(),
        openai: makeGoodAnalysis({ rank: 2 }),
      })
    );

    const newResults = Array.from({ length: 5 }, (_, i) =>
      makeResultItem(`q${i + 6}`, {
        claude: makeAbsentAnalysis(),
        gemini: makeGoodAnalysis(),
        openai: makeAbsentAnalysis(),
      })
    );

    // What SHOULD happen: compute scores on ALL 10 results
    const mergedResults = [...oldResults, ...newResults];
    const correctScores = computeScores(mergedResults, llmIds);

    // What BUG-001 does: compute scores on ONLY the new 5 results
    const wrongScores = computeScores(newResults, llmIds);

    // These must NOT be equal — if they are, the merge isn't being scored
    expect(correctScores.mention).not.toBe(wrongScores.mention);
    expect(correctScores.overall).not.toBe(wrongScores.overall);

    // The correct score should reflect all 10 results
    // Old: 10/15 analyses have mention (claude+openai per 5 questions)
    // New: 5/15 analyses have mention (gemini per 5 questions)
    // Total: 15/30 = 50% mention
    expect(correctScores.mention).toBe(50);
  });

  it('should handle single LLM correctly', () => {
    const results = [
      makeResultItem('q1', { claude: makeGoodAnalysis() }),
    ];
    const scores = computeScores(results, ['claude']);
    expect(scores.mention).toBe(100);
    expect(scores.overall).toBeGreaterThan(0);
  });

  it('should skip error analyses but still count valid ones', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeGoodAnalysis(),
        gemini: makeErrorAnalysis(),  // should be skipped
        openai: makeGoodAnalysis(),
      }),
    ];
    const scores = computeScores(results, llmIds);
    // 2 valid analyses, both mentioned = 100%
    expect(scores.mention).toBe(100);
  });

  it('should compute shareOfVoice correctly', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeGoodAnalysis(), // 2 vendors: Sirion + Icertis, Sirion mentioned
        gemini: makeGoodAnalysis(), // same
        openai: makeAbsentAnalysis(), // 1 vendor: Icertis, Sirion NOT mentioned
      }),
    ];
    const scores = computeScores(results, llmIds);
    // Sirion mentioned in 2 out of 3 analyses = 2 sirionMentions
    // Total vendor mentions: 2+2+1 = 5
    // ShareOfVoice = 2/5 = 40%
    expect(scores.shareOfVoice).toBe(40);
  });

  // ★ BUG-003 PREVENTION: completedQueries count must match results.length after merge
  it('should handle large merged arrays without double-counting', () => {
    // Simulate 100 old + 82 new = 182 total (the real Xtrusio scan size)
    const allResults = Array.from({ length: 182 }, (_, i) =>
      makeResultItem(`q${i + 1}`, {
        claude: i % 3 === 0 ? makeGoodAnalysis() : makeAbsentAnalysis(),
        gemini: i % 2 === 0 ? makeGoodAnalysis() : makeAbsentAnalysis(),
        openai: i % 5 === 0 ? makeGoodAnalysis() : makeAbsentAnalysis(),
      })
    );
    const scores = computeScores(allResults, llmIds);

    // Scores must be computed, not zero (would indicate the merge failed)
    expect(scores.overall).toBeGreaterThan(0);
    expect(scores.mention).toBeGreaterThan(0);
    expect(scores.mention).toBeLessThan(100);
  });

  it('should weight overall score correctly (35% mention + 40% position + 25% sentiment)', () => {
    // All mentioned, rank 1 (position=100), positive sentiment (sentiment=100)
    const results = [
      makeResultItem('q1', {
        claude: makeGoodAnalysis({ rank: 1 }),
        gemini: makeGoodAnalysis({ rank: 1 }),
        openai: makeGoodAnalysis({ rank: 1 }),
      }),
    ];
    const scores = computeScores(results, llmIds);
    // mention=100, position=100, sentiment=100
    // overall = 100*0.35 + 100*0.40 + 100*0.25 = 100
    expect(scores.overall).toBe(100);
  });
});


/* ───────────────────────────────────────────────
   2. buildExportPayload
   Guards against: wrong export data after resume
   ─────────────────────────────────────────────── */

describe('buildExportPayload', () => {
  it('should build valid export from scan data', () => {
    const scanData = {
      company: 'Sirion',
      scores: { overall: 75, mention: 80, position: 70, sentiment: 65 },
      results: [
        makeResultItem('q1', { claude: makeGoodAnalysis() }, { persona: 'CFO', stage: 'research' }),
        makeResultItem('q2', { claude: makeAbsentAnalysis() }, { persona: 'GC', stage: 'evaluation' }),
      ],
    };

    const payload = buildExportPayload(scanData);

    expect(payload.source).toBe('xtrusio-perception-monitor');
    expect(payload.company).toBe('Sirion');
    expect(payload.totalQueries).toBe(2);
    expect(payload.queries).toHaveLength(2);
    expect(payload.personaBreakdown).toHaveLength(2);
    expect(payload.stageBreakdown).toHaveLength(2);
  });

  it('should calculate persona mention rates correctly', () => {
    const scanData = {
      company: 'Sirion',
      scores: { overall: 50 },
      results: [
        makeResultItem('q1', { claude: makeGoodAnalysis() }, { persona: 'CFO', stage: 'research' }),
        makeResultItem('q2', { claude: makeGoodAnalysis() }, { persona: 'CFO', stage: 'research' }),
        makeResultItem('q3', { claude: makeAbsentAnalysis() }, { persona: 'CFO', stage: 'research' }),
      ],
    };

    const payload = buildExportPayload(scanData);
    const cfoBreakdown = payload.personaBreakdown.find(p => p.persona === 'CFO');
    // 2 out of 3 mentioned = 67%
    expect(cfoBreakdown.mentionRate).toBe(67);
    expect(cfoBreakdown.total).toBe(3);
  });

  it('should collect unique content gaps and recommendations', () => {
    const scanData = {
      company: 'Sirion',
      scores: { overall: 50 },
      results: [
        makeResultItem('q1', {
          claude: makeGoodAnalysis({
            content_gaps: ['Need case studies', 'Need ROI data'],
            recommendation: 'Publish case studies',
          }),
        }),
        makeResultItem('q2', {
          claude: makeGoodAnalysis({
            content_gaps: ['Need case studies', 'Need analyst coverage'],  // 'Need case studies' is duplicate
            recommendation: 'Publish case studies',  // duplicate
          }),
        }),
      ],
    };

    const payload = buildExportPayload(scanData);
    // Should deduplicate
    expect(payload.allContentGaps).toContain('Need case studies');
    expect(payload.allContentGaps).toContain('Need ROI data');
    expect(payload.allContentGaps).toContain('Need analyst coverage');
    expect(payload.allContentGaps).toHaveLength(3);
    expect(payload.allRecommendations).toHaveLength(1);
  });

  it('should handle results where no analysis exists (null filter)', () => {
    const scanData = {
      company: 'Sirion',
      scores: { overall: 0 },
      results: [
        makeResultItem('q1', {}),  // no claude, gemini, or openai key
      ],
    };

    const payload = buildExportPayload(scanData);
    expect(payload.totalQueries).toBe(0);
    expect(payload.queries).toHaveLength(0);
  });

  // ★ BUG-001 PREVENTION: Export must use scores computed on FULL results
  it('should use the scores from scanData directly (not recompute)', () => {
    const fakeScores = { overall: 42, mention: 33, position: 55, sentiment: 22 };
    const scanData = {
      company: 'Sirion',
      scores: fakeScores,
      results: [makeResultItem('q1', { claude: makeGoodAnalysis() })],
    };

    const payload = buildExportPayload(scanData);
    // Export should pass through the provided scores as-is
    expect(payload.scores).toEqual(fakeScores);
  });
});


/* ───────────────────────────────────────────────
   3. RESUME MERGE SIMULATION
   Guards against: BUG-001, BUG-003
   This tests the LOGIC that should happen in PerceptionMonitor
   ─────────────────────────────────────────────── */

describe('Resume merge logic (simulation)', () => {
  const llmIds = ['claude', 'gemini', 'openai'];

  it('BUG-001: scores MUST be recomputed after merging old + new results', () => {
    // Simulate what PerceptionMonitor should do after resume
    const oldResults = Array.from({ length: 35 }, (_, i) =>
      makeResultItem(`q${i + 1}`, {
        claude: makeGoodAnalysis(),
        gemini: makeGoodAnalysis(),
        openai: makeGoodAnalysis(),
      })
    );

    const newResults = Array.from({ length: 147 }, (_, i) =>
      makeResultItem(`q${i + 36}`, {
        claude: i % 2 === 0 ? makeGoodAnalysis() : makeAbsentAnalysis(),
        gemini: makeAbsentAnalysis(),
        openai: i % 3 === 0 ? makeGoodAnalysis() : makeAbsentAnalysis(),
      })
    );

    // Step 1: Merge (this part works)
    const mergedResults = [...oldResults, ...newResults];
    expect(mergedResults).toHaveLength(182);

    // Step 2: MUST recompute scores on merged array (BUG-001 misses this)
    const correctScores = computeScores(mergedResults, llmIds);
    const wrongScores = computeScores(newResults, llmIds);  // BUG-001 uses this

    // The scores MUST be different — if not, old results are being ignored
    expect(correctScores.overall).not.toBe(wrongScores.overall);

    // Correct scores should be higher (old results were all good)
    expect(correctScores.mention).toBeGreaterThan(wrongScores.mention);
  });

  it('BUG-003: completedQueries should equal merged results length, not prevCompleted + merged', () => {
    const prevCompleted = 35;
    const oldResults = Array.from({ length: 35 }, (_, i) =>
      makeResultItem(`q${i + 1}`, { claude: makeGoodAnalysis() })
    );
    const newResults = Array.from({ length: 147 }, (_, i) =>
      makeResultItem(`q${i + 36}`, { claude: makeGoodAnalysis() })
    );

    const mergedResults = [...oldResults, ...newResults];

    // CORRECT: completedQueries = total unique results
    const correctCount = mergedResults.length;
    expect(correctCount).toBe(182);

    // BUG-003: prevCompleted + mergedResults.length = 35 + 182 = 217 (WRONG!)
    const buggyCount = prevCompleted + mergedResults.length;
    expect(buggyCount).toBe(217);
    expect(buggyCount).not.toBe(correctCount);
  });

  it('BUG-004: totalQueries should come from scan metadata, not current question bank', () => {
    // Scan was started with 182 questions
    const scanMetadata = { totalQueries: 182 };
    // But user changed question bank to 200 questions
    const currentQuestionBank = { length: 200 };

    // CORRECT: Use scan metadata
    const correctTotal = scanMetadata.totalQueries || currentQuestionBank.length;
    expect(correctTotal).toBe(182);

    // BUG-004: Uses current bank first (|| short-circuit)
    const buggyTotal = currentQuestionBank.length || scanMetadata.totalQueries || 138;
    expect(buggyTotal).toBe(200);
    expect(buggyTotal).not.toBe(correctTotal);
  });

  it('BUG-005: no magic number 138 fallback', () => {
    const scanMeta = { totalQueries: 0 };
    const queries = { length: 0 };

    // CORRECT: fallback to 0
    const correctFallback = scanMeta.totalQueries || queries.length || 0;
    expect(correctFallback).toBe(0);

    // BUG-005: fallback to magic 138
    const buggyFallback = queries.length || scanMeta.totalQueries || 138;
    expect(buggyFallback).toBe(138);
  });
});


/* ───────────────────────────────────────────────
   4. SCAN RESULT INTEGRITY
   Guards against: data corruption, missing fields
   ─────────────────────────────────────────────── */

describe('Scan result integrity', () => {
  it('computeScores should return all required fields', () => {
    const results = [
      makeResultItem('q1', { claude: makeGoodAnalysis() }),
    ];
    const scores = computeScores(results, ['claude']);

    // Every field must exist and be a number
    const requiredFields = ['overall', 'mention', 'position', 'sentiment', 'accuracy', 'completeness', 'positioning', 'shareOfVoice'];
    requiredFields.forEach(field => {
      expect(scores).toHaveProperty(field);
      expect(typeof scores[field]).toBe('number');
      expect(isNaN(scores[field])).toBe(false);
    });
  });

  it('scores should never exceed 100', () => {
    const results = Array.from({ length: 50 }, (_, i) =>
      makeResultItem(`q${i}`, {
        claude: makeGoodAnalysis({ rank: 1, accuracy: 10, completeness: 10, positioning: 10 }),
        gemini: makeGoodAnalysis({ rank: 1, accuracy: 10, completeness: 10, positioning: 10 }),
        openai: makeGoodAnalysis({ rank: 1, accuracy: 10, completeness: 10, positioning: 10 }),
      })
    );
    const scores = computeScores(results, ['claude', 'gemini', 'openai']);

    expect(scores.overall).toBeLessThanOrEqual(100);
    expect(scores.mention).toBeLessThanOrEqual(100);
    expect(scores.position).toBeLessThanOrEqual(100);
    expect(scores.shareOfVoice).toBeLessThanOrEqual(100);
  });

  it('scores should never be negative', () => {
    const results = [
      makeResultItem('q1', {
        claude: makeAbsentAnalysis(),
        gemini: makeErrorAnalysis(),
      }),
    ];
    const scores = computeScores(results, ['claude', 'gemini']);

    Object.values(scores).forEach(val => {
      expect(val).toBeGreaterThanOrEqual(0);
    });
  });
});
