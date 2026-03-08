/**
 * shared/scoring.js — Pure scoring functions
 *
 * These run identically in browser and Node.js.
 * No DOM, no fetch, no localStorage dependencies.
 *
 * The frontend's scanEngine.js can import from here,
 * and the backend workers will import the same functions.
 */

import { DEFAULT_CALIBRATION, NARRATIVE_CLASSES } from "./constants.js";

/**
 * Compute aggregate scores from scan results.
 *
 * @param {Array} results — array of result items (each has analyses keyed by LLM ID)
 * @param {Array} llmIds — which LLM IDs to consider (e.g. ["claude", "openai"])
 * @param {Object} [cal] — calibration overrides (defaults to DEFAULT_CALIBRATION)
 * @returns {{ overall, mention, position, sentiment, accuracy, completeness, positioning, shareOfVoice }}
 */
export function computeScores(results, llmIds, cal) {
  const c = cal || DEFAULT_CALIBRATION;
  let mc = 0, ps = 0, pc = 0, ss = 0, as2 = 0, cs = 0, pos2 = 0, n = 0;

  results.forEach((r) => {
    llmIds.forEach((lid) => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      n++;
      if (a.mentioned) mc++;
      if (a.rank) {
        ps += Math.max(0, 100 - (a.rank - 1) * c.rankStep);
        pc++;
      }
      ss += a.sentiment === "positive" ? 100 : a.sentiment === "neutral" ? 50 : a.sentiment === "absent" ? 0 : 20;
      as2 += (a.accuracy || 0) * 10;
      cs += (a.completeness || 0) * 10;
      pos2 += (a.positioning || 0) * 10;
    });
  });

  if (!n) return { overall: 0, mention: 0, position: 0, sentiment: 0, accuracy: 0, completeness: 0, positioning: 0 };

  const mention = Math.round((mc / n) * 100);
  const position = pc ? Math.round(ps / pc) : 0;
  const sentiment = Math.round(ss / n);
  const accuracy = Math.round(as2 / n);
  const completeness = Math.round(cs / n);
  const positioning = Math.round(pos2 / n);
  const overall = Math.round(mention * c.wMention + position * c.wPosition + sentiment * c.wSentiment);

  // Share of Voice = target company mentions / total vendor mentions
  let sirionMentions = 0;
  let totalVendorMentions = 0;
  results.forEach((r) => {
    llmIds.forEach((lid) => {
      const a = r.analyses[lid];
      if (!a || a._error) return;
      const vendors = a.vendors_mentioned || [];
      totalVendorMentions += vendors.length;
      if (a.mentioned) sirionMentions++;
    });
  });
  const shareOfVoice = totalVendorMentions > 0 ? Math.round((sirionMentions / totalVendorMentions) * 100) : 0;

  return { overall, mention, position, sentiment, accuracy, completeness, positioning, shareOfVoice };
}

/**
 * Score difficulty of a question based on analysis results.
 *
 * @param {Object} analyses — { [llmId]: analysisObject }
 * @param {Array} llmIds — which LLM IDs to consider
 * @param {string} company — target company name (for checking mentions)
 * @returns {{ specificity, competition, contentGap, volume, composite, rationale }}
 */
export function scoreDifficulty(analyses, llmIds, company) {
  const companyLower = company.toLowerCase();
  let sirionMentioned = 0;
  let totalAnalyses = 0;
  const allVendors = new Set();
  let totalContentGaps = 0;
  let totalRank = 0;
  let rankCount = 0;

  llmIds.forEach((lid) => {
    const a = analyses[lid];
    if (!a || a._error) return;
    totalAnalyses++;
    if (a.mentioned) sirionMentioned++;
    if (a.rank) {
      totalRank += a.rank;
      rankCount++;
    }
    (a.vendors_mentioned || []).forEach((v) => {
      if (v.name.toLowerCase() !== companyLower) allVendors.add(v.name.toLowerCase());
    });
    totalContentGaps += (a.content_gaps || []).length;
  });

  const avgRank = rankCount > 0 ? totalRank / rankCount : 10;
  const specificity = Math.min(10, Math.round(avgRank));
  const competition = Math.min(10, allVendors.size);
  const contentGap = Math.min(10, totalContentGaps);
  const volume = 5; // placeholder
  const composite = +((competition + contentGap + specificity + volume) / 4).toFixed(1);

  return {
    specificity,
    competition,
    contentGap,
    volume,
    composite,
    rationale: sirionMentioned === 0
      ? "Company not mentioned -- content creation needed"
      : sirionMentioned === totalAnalyses
        ? "Good presence -- maintain and optimize"
        : "Partial coverage -- targeted content can improve visibility",
  };
}

/**
 * Compute retrieval metadata for a single analysis result.
 *
 * @param {string} fullText — the full LLM response text
 * @param {string} company — the target company name
 * @param {string} finishReason — normalized finish_reason from the LLM
 * @param {string} scanMode — "economy" | "premium"
 * @returns {{ answer_length, truncated, first_mention_pos, total_mentions, parse_coverage, _low_confidence }}
 */
export function computeRetrievalMetadata(fullText, company, finishReason, scanMode) {
  const companyLower = company.toLowerCase();
  const textLower = fullText.toLowerCase();

  const answer_length = fullText.length;
  const truncated = finishReason === "max_tokens";
  const first_mention_pos = textLower.indexOf(companyLower);

  let mentionCount = 0;
  let searchPos = 0;
  while (searchPos < textLower.length) {
    const idx = textLower.indexOf(companyLower, searchPos);
    if (idx === -1) break;
    mentionCount++;
    searchPos = idx + companyLower.length;
  }

  const maxSnippet = scanMode === "premium" ? 12000 : 6000;
  const snippetLen = Math.min(maxSnippet, fullText.length);
  const parse_coverage = fullText.length > 0 ? +(snippetLen / fullText.length).toFixed(2) : 1;

  const _low_confidence = truncated || parse_coverage < 0.5;

  return {
    answer_length,
    truncated,
    first_mention_pos,
    total_mentions: mentionCount,
    parse_coverage,
    _low_confidence,
  };
}
