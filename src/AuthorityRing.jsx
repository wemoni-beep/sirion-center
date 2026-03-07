import React, { useState, useMemo, useCallback, useEffect } from "react";
import { FONT } from "./typography";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Cell, Treemap, CartesianGrid } from "recharts";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { buildExportPayload } from "./scanEngine";
import { db } from "./firebase";

// Firebase stores arrays as objects with numeric keys — normalize everywhere
const asArray = v => Array.isArray(v) ? v : (v && typeof v === "object" && !v.nodeType ? Object.values(v) : []);

/* ═══════════════════════════════════════════════════════
   AUTHORITY RING — Module 2 of Xtrusio Platform
   Gap identification → Outreach roadmap → Cost modeling
   
   Flow: Question Generator (M1) tells us WHAT questions matter
         Authority Ring (M2) tells us WHERE to build presence
         Perception Monitor (M3) tracks if citations shift
   ═══════════════════════════════════════════════════════ */

const T_DARK = {
  bg: "#08070D", surface: "#0E0D16", card: "#14131F", cardHover: "#1A192A",
  border: "rgba(139,92,246,0.08)", borderActive: "rgba(139,92,246,0.25)",
  text: "#E8E5F0", muted: "rgba(255,255,255,0.62)", dim: "rgba(255,255,255,0.30)",
  accent: "#A78BFA", accentDim: "rgba(167,139,250,0.15)",
  teal: "#2DD4BF", gold: "#FBBF24", red: "#F87171", green: "#34D399",
  blue: "#60A5FA", orange: "#FB923C", pink: "#F472B6", cyan: "#22D3EE",
  sirion: "#2DD4BF", icertis: "#F87171", ironclad: "#A78BFA",
  h: FONT.heading,
  b: FONT.body,
  m: FONT.mono,
};

const T_LIGHT = {
  ...T_DARK,
  bg: "#f7f7f8", surface: "#ededf0", card: "#ffffff", cardHover: "#f0f0f5",
  border: "rgba(139,92,246,0.12)", borderActive: "rgba(139,92,246,0.30)",
  text: "#111118", muted: "rgba(0,0,0,0.55)", dim: "rgba(0,0,0,0.30)",
  accentDim: "rgba(167,139,250,0.10)",
};

let T = { ...T_DARK };

/* ═══════════════════════════════════════════════════════
   VERIFIED DOMAIN DATA — Manual Google Boolean verification
   Each domain verified with: "sirion" site:domain.com
   + "sirionlabs" site:domain.com + brand variations
   
   STATUS KEY:
   verified_zero = searched, confirmed no results
   verified_present = searched, found real content
   verified_strong = multiple pieces of substantial content
   needs_verification = not yet manually checked
   ═══════════════════════════════════════════════════════ */

const DOMAINS = [
  // ── TIER 1: PURE GAPS — Verified zero presence ──
  { id: "hbr", domain: "hbr.org", da: 93, aiCitationWeight: 95, category: "Tier-1 Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: true, icertisContentType: "Research citations", searchQueries: ['"sirion" site:hbr.org'], verifiedDate: "2026-02-18", approach: "Research Partnership", method: "Co-author with academic on contract AI ROI study — pitch to HBR", difficulty: "very_hard", estCostLow: 15000, estCostHigh: 25000, timelineWeeks: "12-16", fiverr: false, contactType: "Editor / Academic Co-Author", topicsFit: ["Governance", "Full Lifecycle", "Analytics", "Agentic CLM"], priorityScore: 98, buyerPersonas: ["GC", "CPO", "CFO"], buyingStages: ["awareness", "consideration"] },
  
  { id: "zdnet", domain: "zdnet.com", da: 92, aiCitationWeight: 88, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: true, icertisContentType: "Product coverage", searchQueries: ['"sirion" site:zdnet.com', '"sirionlabs" site:zdnet.com'], verifiedDate: "2026-02-18", approach: "Product Review / Vendor Spotlight", method: "Pitch product review to ZDNet enterprise team — agentic contract governance angle", difficulty: "medium", estCostLow: 4000, estCostHigh: 8000, timelineWeeks: "3-6", fiverr: true, contactType: "Reporter / Contributor", topicsFit: ["Full Lifecycle", "AI Contract Intelligence", "Enterprise Tech"], priorityScore: 92, buyerPersonas: ["CIO", "VP IT", "CPO"], buyingStages: ["discovery", "consideration"] },

  { id: "venturebeat", domain: "venturebeat.com", da: 92, aiCitationWeight: 89, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: "Only SIRION Biotech (different company)", icertisPresent: true, icertisContentType: "AI/enterprise coverage", searchQueries: ['"sirion" site:venturebeat.com'], verifiedDate: "2026-02-18", approach: "AI Product Announcement", method: "Pitch agentic CLM launch as AI enterprise news story", difficulty: "medium", estCostLow: 3000, estCostHigh: 6000, timelineWeeks: "2-4", fiverr: true, contactType: "Reporter / PR Agency", topicsFit: ["AI Enterprise", "Agentic CLM", "Full Lifecycle"], priorityScore: 90, buyerPersonas: ["CIO", "CTO", "VP IT"], buyingStages: ["awareness", "discovery"] },

  { id: "techrepublic", domain: "techrepublic.com", da: 92, aiCitationWeight: 85, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: true, icertisContentType: "Enterprise tech coverage", searchQueries: ['"sirion" site:techrepublic.com', '"sirionlabs" site:techrepublic.com'], verifiedDate: "2026-02-18", approach: "Contributed Article / Buyer Guide", method: "Pitch CLM buyer guide or enterprise AI adoption article", difficulty: "easy", estCostLow: 2000, estCostHigh: 4000, timelineWeeks: "2-4", fiverr: true, contactType: "Contributor / Editor", topicsFit: ["Enterprise IT", "CLM Buyer Guide", "AI Adoption"], priorityScore: 86, buyerPersonas: ["CIO", "VP IT", "IT Director"], buyingStages: ["discovery", "consideration"] },

  { id: "techtarget", domain: "techtarget.com", da: 92, aiCitationWeight: 87, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: true, icertisContentType: "Vendor definitions + comparisons", searchQueries: ['"sirion" site:techtarget.com'], verifiedDate: "2026-02-18", approach: "Vendor Profile + Sponsored Content", method: "Create TechTarget vendor profile + sponsor CLM comparison content", difficulty: "easy", estCostLow: 2500, estCostHigh: 5000, timelineWeeks: "2-4", fiverr: true, contactType: "Ad Sales / Editor", topicsFit: ["CLM Definition", "Vendor Comparison", "Enterprise Procurement"], priorityScore: 88, buyerPersonas: ["IT Director", "VP Procurement", "CIO"], buyingStages: ["discovery", "consideration"] },

  { id: "cfo", domain: "cfo.com", da: 78, aiCitationWeight: 80, category: "Finance Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:cfo.com'], verifiedDate: "2026-02-18", approach: "Executive Byline", method: "Pitch CFO on contract value leakage / financial impact of poor CLM", difficulty: "medium", estCostLow: 3000, estCostHigh: 6000, timelineWeeks: "4-6", fiverr: false, contactType: "Editor / Contributor", topicsFit: ["Contract Value Leakage", "Financial Impact", "Procurement ROI"], priorityScore: 82, buyerPersonas: ["CFO", "VP Finance"], buyingStages: ["awareness", "consideration"] },

  { id: "computerweekly", domain: "computerweekly.com", da: 90, aiCitationWeight: 82, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:computerweekly.com'], verifiedDate: "2026-02-18", approach: "UK/EU Vendor Spotlight", method: "Pitch to UK enterprise IT editors — GDPR contract compliance angle", difficulty: "medium", estCostLow: 3000, estCostHigh: 5000, timelineWeeks: "3-5", fiverr: true, contactType: "Reporter / Editor", topicsFit: ["Enterprise IT", "GDPR Compliance", "UK/EU Market"], priorityScore: 78, buyerPersonas: ["CIO", "VP IT", "DPO"], buyingStages: ["discovery"] },

  { id: "theregister", domain: "theregister.com", da: 88, aiCitationWeight: 79, category: "Enterprise Tech Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirionlabs" site:theregister.com'], verifiedDate: "2026-02-18", approach: "Product Review / Editorial Pitch", method: "Hard pitch — The Register is editorial-first, needs genuine news angle", difficulty: "hard", estCostLow: 5000, estCostHigh: 10000, timelineWeeks: "4-8", fiverr: false, contactType: "Reporter", topicsFit: ["Enterprise Tech", "AI Innovation"], priorityScore: 68, buyerPersonas: ["CIO", "VP IT"], buyingStages: ["awareness"] },

  { id: "spiceworks", domain: "spiceworks.com", da: 84, aiCitationWeight: 74, category: "IT Community", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:spiceworks.com'], verifiedDate: "2026-02-18", approach: "Community Content + Vendor Profile", method: "Answer community questions on CLM + enhanced vendor profile", difficulty: "easy", estCostLow: 1500, estCostHigh: 3000, timelineWeeks: "1-2", fiverr: false, contactType: "Self-Service", topicsFit: ["CLM FAQ", "IT Buyer Guide", "Vendor Profile"], priorityScore: 64, buyerPersonas: ["IT Director", "IT Manager"], buyingStages: ["discovery"] },

  { id: "atl", domain: "abovethelaw.com", da: 82, aiCitationWeight: 76, category: "Legal Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['sirionlabs "above the law"'], verifiedDate: "2026-02-18", approach: "Legal Tech Coverage", method: "Pitch in-house legal tech angle — GC persona content", difficulty: "medium", estCostLow: 3000, estCostHigh: 5000, timelineWeeks: "3-5", fiverr: false, contactType: "Reporter / Contributor", topicsFit: ["Legal Tech", "In-House Counsel", "Contract Risk"], priorityScore: 74, buyerPersonas: ["GC", "VP Legal Ops"], buyingStages: ["awareness", "discovery"] },

  { id: "cloc", domain: "cloc.org", da: 55, aiCitationWeight: 72, category: "Legal Ops", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: true, icertisContentType: "Sponsor + conference", searchQueries: ['"sirion" site:cloc.org'], verifiedDate: "2026-02-18", approach: "Sponsorship + Event Presence", method: "Sponsor CLOC Institute, present case study at annual conference", difficulty: "easy", estCostLow: 5000, estCostHigh: 15000, timelineWeeks: "4-12", fiverr: false, contactType: "Events / Sponsorship", topicsFit: ["Legal Operations", "Legal Tech", "CLM for Legal"], priorityScore: 76, buyerPersonas: ["VP Legal Ops", "GC"], buyingStages: ["consideration", "decision"] },

  { id: "supplychain", domain: "supplychaindive.com", da: 70, aiCitationWeight: 68, category: "Procurement Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:supplychaindive.com'], verifiedDate: "2026-02-18", approach: "Guest Article / Contributed Piece", method: "Pitch procurement contract management angle — supply chain resilience", difficulty: "medium", estCostLow: 2500, estCostHigh: 5000, timelineWeeks: "3-5", fiverr: true, contactType: "Editor", topicsFit: ["Procurement", "Supply Chain", "Supplier Management"], priorityScore: 70, buyerPersonas: ["CPO", "VP Procurement"], buyingStages: ["awareness", "discovery"] },

  { id: "isaca", domain: "isaca.org", da: 70, aiCitationWeight: 70, category: "Compliance / Risk", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:isaca.org'], verifiedDate: "2026-02-18", approach: "Webinar / White Paper", method: "Joint content on contract compliance and IT governance", difficulty: "medium", estCostLow: 3000, estCostHigh: 6000, timelineWeeks: "4-8", fiverr: false, contactType: "Content / Events", topicsFit: ["IT Governance", "Compliance", "Risk Management"], priorityScore: 62, buyerPersonas: ["CRO", "CISO", "VP Compliance"], buyingStages: ["consideration"] },

  { id: "compweek", domain: "complianceweek.com", da: 65, aiCitationWeight: 68, category: "Compliance Media", sirionStatus: "verified_zero", sirionPresence: null, sirionContentType: null, icertisPresent: false, icertisContentType: null, searchQueries: ['"sirion" site:complianceweek.com'], verifiedDate: "2026-02-18", approach: "Contributed Article", method: "Pitch contract compliance automation for regulated industries", difficulty: "medium", estCostLow: 2000, estCostHigh: 4000, timelineWeeks: "3-5", fiverr: true, contactType: "Editor", topicsFit: ["Compliance", "Contract Risk", "Regulation"], priorityScore: 60, buyerPersonas: ["VP Compliance", "GC"], buyingStages: ["awareness"] },

  // ── TIER 2: WRONG NARRATIVE — Present but wrong content type ──
  { id: "forbes", domain: "forbes.com", da: 95, aiCitationWeight: 93, category: "Tier-1 Media", sirionStatus: "verified_present", sirionPresence: "3 Forbes Tech Council articles by Claude Marais (2020) — may be archived. Council membership still active.", sirionContentType: "council_articles", icertisPresent: true, icertisContentType: "Executive thought leadership + product coverage", searchQueries: ['sirionlabs forbes', '"claude marais" Forbes CLM', 'site:forbes.com "claude marais"'], verifiedDate: "2026-02-18", approach: "Reactivate Forbes Council", method: "Claude Marais ALREADY has Forbes Tech Council access. Publish updated agentic CLM articles immediately.", difficulty: "easy", estCostLow: 500, estCostHigh: 2000, timelineWeeks: "1-2", fiverr: false, contactType: "Forbes Council (existing)", topicsFit: ["Agentic CLM", "Full Lifecycle", "Enterprise Governance", "AI Transformation"], priorityScore: 97, narrativeGap: "Old articles (2020) focused on CLM++ concept. Need current agentic contract governance positioning.", buyerPersonas: ["CPO", "GC", "CFO", "CIO"], buyingStages: ["awareness", "consideration"] },

  { id: "techcrunch", domain: "techcrunch.com", da: 94, aiCitationWeight: 91, category: "Tier-1 Media", sirionStatus: "verified_present", sirionPresence: "3 articles: $1B valuation (2024), $85M raise (2022), $44M raise (2020). All funding coverage.", sirionContentType: "funding_coverage", icertisPresent: true, icertisContentType: "Funding + product coverage", searchQueries: ['sirion site:techcrunch.com'], verifiedDate: "2026-02-18", approach: "Product Announcement Coverage", method: "Next product launch (agentic CLM / Stella) — pitch as product news, not just funding", difficulty: "medium", estCostLow: 3000, estCostHigh: 6000, timelineWeeks: "2-4", fiverr: false, contactType: "Reporter / PR Agency", topicsFit: ["Agentic CLM Launch", "AI Enterprise", "Product Innovation"], priorityScore: 89, narrativeGap: "Has: Funding coverage ('startup raises money'). Needs: Product coverage ('this platform does X better than Icertis').", buyerPersonas: ["CTO", "CIO", "VP Engineering"], buyingStages: ["awareness"] },

  { id: "diginomica", domain: "diginomica.com", da: 75, aiCitationWeight: 74, category: "Enterprise IT Analysis", sirionStatus: "verified_present", sirionPresence: "Full Vestas Wind Systems customer case study (2017). Editorial feature with 300% ROI story.", sirionContentType: "customer_case_study", icertisPresent: true, icertisContentType: "Multiple analyst-style articles", searchQueries: ['"sirion" site:diginomica.com'], verifiedDate: "2026-02-18", approach: "Updated Customer Case Study", method: "Pitch updated Sirion story — agentic CLM evolution since 2017. Warm outreach via existing relationship.", difficulty: "easy", estCostLow: 1500, estCostHigh: 3000, timelineWeeks: "2-4", fiverr: false, contactType: "Editor (warm)", topicsFit: ["Customer Success", "Agentic CLM", "Digital Transformation"], priorityScore: 72, narrativeGap: "Has: One case study from 2017 (post-sig focused). Needs: Updated full-lifecycle agentic CLM coverage.", buyerPersonas: ["CIO", "CPO"], buyingStages: ["consideration"] },

  { id: "bizinsider", domain: "businessinsider.com", da: 95, aiCitationWeight: 86, category: "Tier-1 Media", sirionStatus: "verified_present", sirionPresence: "2 articles: Stella Legal partnership (Feb 2026), $44M Series C pitch deck (Jul 2020).", sirionContentType: "funding_deal_coverage", icertisPresent: true, icertisContentType: "Enterprise coverage", searchQueries: ['sirion site:businessinsider.com'], verifiedDate: "2026-02-18", approach: "Enterprise AI Product Story", method: "Pitch agentic CLM as enterprise AI trend story — not funding news", difficulty: "hard", estCostLow: 5000, estCostHigh: 12000, timelineWeeks: "4-8", fiverr: false, contactType: "Reporter / PR Agency", topicsFit: ["AI Enterprise", "Contract Tech"], priorityScore: 75, narrativeGap: "Has: Funding/deal coverage. Needs: Product analysis or thought leadership.", buyerPersonas: ["CIO", "CPO"], buyingStages: ["awareness"] },

  { id: "softrev", domain: "softwarereviews.com", da: 65, aiCitationWeight: 73, category: "Review Platform", sirionStatus: "verified_strong", sirionPresence: "Full profile, customer reviews, Data Quadrant Gold Medal (2022), 4+ competitor comparison pages.", sirionContentType: "reviews_awards", icertisPresent: true, icertisContentType: "Full profile + comparisons", searchQueries: ['"sirion" site:softwarereviews.com'], verifiedDate: "2026-02-18", approach: "Drive New Reviews", method: "CRITICAL: Current reviews say 'best for post-signature.' Drive new reviews from full-lifecycle customers.", difficulty: "medium", estCostLow: 2000, estCostHigh: 4000, timelineWeeks: "4-8", fiverr: false, contactType: "Customer Success (internal)", topicsFit: ["Full Lifecycle Reviews", "Pre-Signature Capability", "Agentic CLM"], priorityScore: 85, narrativeGap: "ACTIVE HARM: Reviews explicitly say 'best suited for post-signature contract management.' This directly reinforces the perception problem.", buyerPersonas: ["All"], buyingStages: ["consideration", "decision"] },

  // ── TIER 3: STRONG PARTNERSHIPS — Leverage existing ──
  { id: "kpmg", domain: "kpmg.com", da: 93, aiCitationWeight: 84, category: "Big 4 Consulting", sirionStatus: "verified_strong", sirionPresence: "Deep strategic alliance: dedicated pages (US+UK), joint whitepaper 'Turning Contracts Into Strategic Assets', press release, Digital Strategy hub listing.", sirionContentType: "strategic_alliance", icertisPresent: true, icertisContentType: "Similar alliance pages", searchQueries: ['"sirion" site:kpmg.com'], verifiedDate: "2026-02-18", approach: "Deepen Joint Content", method: "Co-author updated report on agentic contract governance. Push narrative beyond 'contract management' to 'contract intelligence.'", difficulty: "easy", estCostLow: 2000, estCostHigh: 5000, timelineWeeks: "4-8", fiverr: false, contactType: "Alliance Manager (existing)", topicsFit: ["Contract Intelligence", "Business Transformation", "Agentic CLM"], priorityScore: 80, narrativeGap: "Existing content is good but uses 2021 language. Needs agentic CLM refresh.", buyerPersonas: ["CPO", "CFO", "GC"], buyingStages: ["consideration", "decision"] },

  { id: "deloitte", domain: "deloitte.com", da: 93, aiCitationWeight: 83, category: "Big 4 Consulting", sirionStatus: "verified_present", sirionPresence: "Formal partnership for Africa (Jun 2024). Actively hiring Sirion-certified consultants (L1/L2/L3).", sirionContentType: "partnership_hiring", icertisPresent: true, icertisContentType: "Alliance + hiring", searchQueries: ['"sirion" site:deloitte.com'], verifiedDate: "2026-02-18", approach: "Joint Thought Leadership", method: "Leverage Deloitte partnership for co-branded content on contract transformation", difficulty: "medium", estCostLow: 3000, estCostHigh: 8000, timelineWeeks: "6-10", fiverr: false, contactType: "Alliance Manager", topicsFit: ["Digital Transformation", "Contract Governance", "Africa Expansion"], priorityScore: 76, buyerPersonas: ["CPO", "GC"], buyingStages: ["consideration"] },

  { id: "worldcc", domain: "worldcc.com", da: 60, aiCitationWeight: 75, category: "Industry Association", sirionStatus: "verified_strong", sirionPresence: "CEO keynote at Benchmark 2025, Innovation Awards case study (Norlys), presentation decks since 2017, CPD content, co-published report 'From Control to Connection'.", sirionContentType: "deep_partnership", icertisPresent: true, icertisContentType: "Similar sponsorship + content", searchQueries: ['"sirion" site:worldcommerce.org OR site:worldcc.com'], verifiedDate: "2026-02-18", approach: "Maintain & Leverage", method: "Already strong. Use WorldCC credibility as proof-point when pitching other domains.", difficulty: "easy", estCostLow: 0, estCostHigh: 1000, timelineWeeks: "ongoing", fiverr: false, contactType: "Existing relationship", topicsFit: ["Contract Excellence", "Agentic CLM", "Commercial Management"], priorityScore: 55, buyerPersonas: ["VP Legal Ops", "CPO"], buyingStages: ["consideration", "decision"] },

  { id: "microsoft", domain: "microsoft.com", da: 96, aiCitationWeight: 94, category: "Technology Partner", sirionStatus: "verified_strong", sirionPresence: "6+ listings: Marketplace, Word add-in, Dynamics 365 integration, AI First Movers case study, Cloud Blog mention.", sirionContentType: "partner_listings_case_study", icertisPresent: true, icertisContentType: "Deep integration — 47+ links, joint case studies, co-sell agreement", searchQueries: ['sirion site:microsoft.com'], verifiedDate: "2026-02-18", approach: "Co-Authored Blog + Case Study", method: "Expand from product listings → joint blog on AI contract intelligence + customer case study", difficulty: "medium", estCostLow: 5000, estCostHigh: 12000, timelineWeeks: "6-10", fiverr: false, contactType: "Partner Marketing Manager", topicsFit: ["AI First Movers", "Enterprise Integration", "Full Lifecycle"], priorityScore: 94, narrativeGap: "Has: Product listings + one case study. Icertis has 47+ links with deep co-sell. Massive gap in joint narrative content.", buyerPersonas: ["CIO", "CTO", "CPO"], buyingStages: ["discovery", "consideration", "decision"] },

  { id: "sap", domain: "sap.com", da: 96, aiCitationWeight: 90, category: "Technology Partner", sirionStatus: "verified_strong", sirionPresence: "5+ items: Ariba partner page, CPQ integration, S/4HANA integration with full config guides, Community blog.", sirionContentType: "technical_integration", icertisPresent: true, icertisContentType: "Deep integration + co-sell", searchQueries: ['"sirion" site:sap.com'], verifiedDate: "2026-02-18", approach: "Joint Blog + Customer Case Study", method: "Expand from technical docs → joint SAP blog on procurement transformation + case study", difficulty: "medium", estCostLow: 4000, estCostHigh: 8000, timelineWeeks: "4-8", fiverr: false, contactType: "SAP Partner Marketing", topicsFit: ["Procurement Transformation", "ERP Integration", "Full Lifecycle"], priorityScore: 86, narrativeGap: "Has: Deep technical integration content. Needs: Narrative/thought leadership (blog, case study). All current content is technical docs.", buyerPersonas: ["CPO", "VP IT", "CIO"], buyingStages: ["consideration", "decision"] },

  // ── TIER 4: EASY WINS — Low cost, fast execution ──
  { id: "medium", domain: "medium.com", da: 96, aiCitationWeight: 65, category: "Blog Platform", sirionStatus: "verified_present", sirionPresence: "Official @SirionLabs account with Vodafone case study, newsletters (2017). Kanti Prabha Authority Magazine interview (2023).", sirionContentType: "official_blog_dormant", icertisPresent: true, icertisContentType: "Multiple articles", searchQueries: ['"sirion" site:medium.com'], verifiedDate: "2026-02-18", approach: "Revive Dormant Account", method: "Reactivate @SirionLabs Medium with weekly agentic CLM content. Zero cost, high volume.", difficulty: "easy", estCostLow: 0, estCostHigh: 500, timelineWeeks: "1", fiverr: false, contactType: "Self-publish (existing account)", topicsFit: ["Thought Leadership", "Agentic CLM", "Customer Stories"], priorityScore: 60, narrativeGap: "Account dormant since ~2017. Easy to revive.", buyerPersonas: ["All"], buyingStages: ["awareness"] },

  { id: "fastco", domain: "fastcompany.com", da: 93, aiCitationWeight: 82, category: "Tier-1 Media", sirionStatus: "verified_present", sirionPresence: "Named to Most Innovative Companies list in 2017 AND 2021 (Top 10 Enterprise).", sirionContentType: "awards_listing", icertisPresent: false, icertisContentType: null, searchQueries: ['sirionlabs "fast company" most innovative'], verifiedDate: "2026-02-18", approach: "Apply for 2026 MIC List", method: "Apply for Fast Company Most Innovative Companies 2026 — applications open. Use agentic CLM as innovation story.", difficulty: "medium", estCostLow: 500, estCostHigh: 2000, timelineWeeks: "application-based", fiverr: false, contactType: "Application / PR", topicsFit: ["Innovation", "Agentic CLM", "AI Enterprise"], priorityScore: 70, narrativeGap: "Last recognition was 2021. Need 2026 refresh.", buyerPersonas: ["All"], buyingStages: ["awareness"] },

  { id: "bloomberg", domain: "bloomberg.com", da: 97, aiCitationWeight: 92, category: "Tier-1 Financial Media", sirionStatus: "verified_present", sirionPresence: "Company profiles (US + India), TPG/Warburg $500M stake article (Nov 2025), $85M funding press release (2022), executive profiles.", sirionContentType: "company_profiles_funding", icertisPresent: true, icertisContentType: "Multiple articles + profiles", searchQueries: ['"sirion" site:bloomberg.com'], verifiedDate: "2026-02-18", approach: "Leverage TPG/Warburg Story", method: "If $500M deal closes, pitch Bloomberg for enterprise CLM product story alongside deal coverage", difficulty: "hard", estCostLow: 5000, estCostHigh: 15000, timelineWeeks: "4-12", fiverr: false, contactType: "Reporter / PR Agency", topicsFit: ["Enterprise Value", "AI Investment", "CLM Market Growth"], priorityScore: 72, narrativeGap: "Has: Financial profiles + deal coverage. Needs: Product/market analysis piece.", buyerPersonas: ["CFO", "CPO"], buyingStages: ["awareness"] },
];

/* ═══════════════════════════════════════════════════════
   BUYER PERSONA → DOMAIN MAPPING
   Which domains influence which buyer personas
   ═══════════════════════════════════════════════════════ */

const PERSONAS = [
  { id: "CPO", label: "Chief Procurement Officer", icon: "📊", color: T.teal, keyDomains: ["hbr", "forbes", "cfo", "kpmg", "sap", "spendmatters", "worldcc", "supplychain"] },
  { id: "GC", label: "General Counsel", icon: "⚖️", color: T.accent, keyDomains: ["hbr", "forbes", "atl", "cloc", "artificallawyer", "law", "kpmg"] },
  { id: "CFO", label: "Chief Financial Officer", icon: "💰", color: T.gold, keyDomains: ["hbr", "forbes", "cfo", "bloomberg", "kpmg", "deloitte"] },
  { id: "CIO", label: "Chief Information Officer", icon: "🖥️", color: T.blue, keyDomains: ["zdnet", "venturebeat", "techrepublic", "techtarget", "computerweekly", "microsoft", "sap"] },
  { id: "VPLegalOps", label: "VP Legal Operations", icon: "📋", color: T.pink, keyDomains: ["cloc", "atl", "worldcc", "softrev", "artificallawyer"] },
  { id: "VPProcurement", label: "VP Procurement", icon: "🔗", color: T.orange, keyDomains: ["spendmatters", "supplychain", "sap", "worldcc", "kpmg", "techtarget"] },
];

/* ═══════════════════════════════════════════════════════
   BUYING STAGE → CONTENT TYPE MAPPING
   ═══════════════════════════════════════════════════════ */

const STAGES = [
  { id: "awareness", label: "Awareness", color: "#F59E0B", icon: "🔍", description: "Buyer recognizes they have a problem", contentNeeded: "Thought leadership, trend articles, HBR-style research", domainTypes: ["Tier-1 Media", "Finance Media"] },
  { id: "discovery", label: "Discovery", color: "#60A5FA", icon: "🧭", description: "Buyer actively researching solutions", contentNeeded: "Vendor comparisons, buyer guides, analyst reports", domainTypes: ["Enterprise Tech Media", "Review Platform", "IT Community"] },
  { id: "consideration", label: "Consideration", color: "#34D399", icon: "⚡", description: "Buyer evaluating specific vendors", contentNeeded: "Case studies, peer reviews, ROI analysis", domainTypes: ["Big 4 Consulting", "Review Platform", "Industry Association"] },
  { id: "decision", label: "Decision", color: "#A78BFA", icon: "✅", description: "Buyer making final selection", contentNeeded: "Analyst rankings, customer testimonials, partner validations", domainTypes: ["Technology Partner", "Big 4 Consulting", "Review Platform"] },
];

/* ═══════════════════════════════════════════════════════
   OUTREACH METHODS + COST DATABASE
   ═══════════════════════════════════════════════════════ */

const OUTREACH_METHODS = {
  fiverr_guest_post: { label: "Fiverr Guest Post", costRange: "$150–$500", timeline: "1-2 weeks", quality: "low-medium", domains: ["zdnet", "venturebeat", "techrepublic", "techtarget", "compweek", "supplychain"] },
  pr_agency: { label: "PR Agency Pitch", costRange: "$3,000–$8,000", timeline: "4-8 weeks", quality: "high", domains: ["techcrunch", "bizinsider", "bloomberg", "theregister"] },
  council_membership: { label: "Council/Contributor Access", costRange: "$500–$2,500/yr", timeline: "1-2 weeks", quality: "high", domains: ["forbes"] },
  partner_co_create: { label: "Partner Co-Creation", costRange: "$2,000–$12,000", timeline: "4-10 weeks", quality: "very high", domains: ["microsoft", "sap", "kpmg", "deloitte"] },
  sponsored_content: { label: "Sponsored Content", costRange: "$2,500–$15,000", timeline: "2-6 weeks", quality: "medium-high", domains: ["techtarget", "cloc", "isaca"] },
  self_publish: { label: "Self-Publish", costRange: "$0–$500", timeline: "< 1 week", quality: "varies", domains: ["medium", "fastco"] },
  academic_research: { label: "Academic Research Partnership", costRange: "$15,000–$25,000", timeline: "12-16 weeks", quality: "very high", domains: ["hbr"] },
  event_sponsorship: { label: "Event Sponsorship", costRange: "$5,000–$25,000", timeline: "4-12 weeks", quality: "high", domains: ["cloc", "worldcc", "isaca"] },
  review_campaign: { label: "Customer Review Drive", costRange: "$2,000–$4,000", timeline: "4-8 weeks", quality: "high", domains: ["softrev"] },
};

/* ═══════════════════════════════════════════════════════
   UI COMPONENTS
   ═══════════════════════════════════════════════════════ */

const Glow = ({ color, size = 180, top = -70, right = -50 }) => (
  <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: color, filter: `blur(${size/2}px)`, opacity: 0.06, top, right, pointerEvents: "none" }} />
);

const Panel = ({ children, style: s = {}, glow, onClick, active }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: active ? T.cardHover : hov && onClick ? T.cardHover : T.card, borderRadius: 12, border: `1px solid ${active ? T.borderActive : hov && onClick ? T.borderActive : T.border}`, padding: "16px 18px", position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "all 0.2s ease", ...s }}>
      {glow && <Glow color={glow} />}
      {children}
    </div>
  );
};

const Label = ({ children, color = T.dim }) => (
  <div style={{ fontSize: 11, color, letterSpacing: "0.16em", fontWeight: 700, textTransform: "uppercase", marginBottom: 8, fontFamily: T.m }}>{children}</div>
);

const Chip = ({ text, color, small }) => (
  <span style={{ display: "inline-block", padding: small ? "2px 7px" : "3px 10px", borderRadius: 10, fontSize: 11, background: `${color}14`, color, border: `1px solid ${color}20`, fontWeight: 600, marginRight: 4, marginBottom: 3, lineHeight: 1.3, fontFamily: T.m }}>{text}</span>
);

const StatusBadge = ({ status }) => {
  const cfg = {
    verified_zero: { label: "ZERO", color: T.red, bg: "rgba(248,113,113,0.08)" },
    verified_present: { label: "PRESENT", color: T.gold, bg: "rgba(251,191,36,0.08)" },
    verified_strong: { label: "STRONG", color: T.green, bg: "rgba(52,211,153,0.08)" },
    needs_verification: { label: "UNVERIFIED", color: T.dim, bg: "rgba(255,255,255,0.04)" },
  }[status] || { label: status, color: T.dim, bg: "transparent" };
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22`, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.08em" }}>{cfg.label}</span>;
};

const DifficultyBadge = ({ d }) => {
  const cfg = { easy: { color: T.green, label: "EASY" }, medium: { color: T.gold, label: "MEDIUM" }, hard: { color: T.orange, label: "HARD" }, very_hard: { color: T.red, label: "VERY HARD" } }[d] || { color: T.dim, label: d };
  return <span style={{ fontSize: 11, color: cfg.color, fontFamily: T.m, fontWeight: 600 }}>{cfg.label}</span>;
};

const Stat = ({ label, value, color = T.text, sub }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 11, color: T.dim, fontFamily: T.m, letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: T.h }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
  </div>
);

/* ─── Insight Banner: "So what? Now what?" for every tab ─── */
const InsightBanner = ({ color, insight, action, style: s = {} }) => (
  <div style={{
    marginBottom: 16, padding: "14px 18px", borderRadius: 10,
    background: `linear-gradient(135deg, ${color}06 0%, transparent 100%)`,
    border: `1px solid ${color}18`, borderLeft: `3px solid ${color}`,
    ...s,
  }}>
    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, fontFamily: T.b }}>{insight}</div>
    {action && (
      <div style={{ fontSize: 12, color, lineHeight: 1.6, fontFamily: T.b, marginTop: 6, fontWeight: 600 }}>{action}</div>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════
   MAIN APPLICATION
   ═══════════════════════════════════════════════════════ */

const NAV = [
  { id: "ring", icon: "◎", label: "Authority Ring" },
  { id: "perception", icon: "⚡", label: "Perception Intel", tag: "M2→M3" },
  { id: "gaps", icon: "△", label: "Gap Matrix" },
  { id: "outreach", icon: "→", label: "Outreach Plan" },
  { id: "cost", icon: "$", label: "Cost Model" },
  { id: "persona", icon: "◈", label: "Persona Map" },
];

export default function AuthorityRing() {
  const _globalTheme = useTheme();
  T = _globalTheme.mode === "light" ? { ...T_LIGHT } : { ...T_DARK };
  const { pipeline, updateModule } = usePipeline();

  const [nav, setNav] = useState("ring");
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterPersona, setFilterPersona] = useState(null);
  const [sortBy, setSortBy] = useState("priorityScore");
  const [sortDir, setSortDir] = useState("desc");
  const [view, setView] = useState("list");

  // ═══ M2→M3 BRIDGE: Auto-load perception data ═══
  const [perceptionData, setPerceptionData] = useState(null);
  const [perceptionImportText, setPerceptionImportText] = useState("");
  const [perceptionStatus, setPerceptionStatus] = useState(null);
  const [pipelineM2Loaded, setPipelineM2Loaded] = useState(false);
  const [aiCitedDomains, setAiCitedDomains] = useState([]);
  const [outreachTracker, setOutreachTracker] = useState(() => pipeline.m3?.outreachTracker || {});
  const [outreachFilter, setOutreachFilter] = useState("all");

  const updateOutreachStatus = useCallback((domainId, field, value) => {
    setOutreachTracker(prev => {
      const next = { ...prev, [domainId]: { ...prev[domainId], [field]: value, updatedAt: new Date().toISOString() } };
      updateModule("m3", { outreachTracker: next });
      return next;
    });
  }, [updateModule]);

  // Auto-load M2 perception data from pipeline (exportPayload OR fallback to scanResults)
  useEffect(() => {
    if (pipelineM2Loaded) return;

    // Priority 1: exportPayload already built by M2
    if (pipeline.m2.exportPayload) {
      const ep = pipeline.m2.exportPayload;
      // Normalize inner arrays (Firebase may store as objects with numeric keys)
      setPerceptionData({
        ...ep,
        personaBreakdown: asArray(ep.personaBreakdown),
        stageBreakdown: asArray(ep.stageBreakdown),
        allContentGaps: asArray(ep.allContentGaps),
        allRecommendations: asArray(ep.allRecommendations),
      });
      setPipelineM2Loaded(true);
      setPerceptionStatus({ type: "success", msg: `Auto-loaded perception data from M2 (${pipeline.m2.scores?.overall || 0}/100 overall score).` });
      return;
    }

    // Priority 2: Fallback — construct perception data from raw scanResults
    const rawSR = pipeline.m2.scanResults;
    const srResults = rawSR?.results;
    // Normalize: Firebase may store arrays as objects with numeric keys
    const srArr = asArray(srResults);
    if (srArr.length > 0) {
      try {
        const normalizedSR = { ...rawSR, results: srArr, llms: asArray(rawSR.llms) };
        const payload = buildExportPayload(normalizedSR);
        // Normalize payload inner arrays too
        const safePayload = {
          ...payload,
          personaBreakdown: asArray(payload.personaBreakdown),
          stageBreakdown: asArray(payload.stageBreakdown),
          allContentGaps: asArray(payload.allContentGaps),
          allRecommendations: asArray(payload.allRecommendations),
        };
        setPerceptionData(safePayload);
        setPipelineM2Loaded(true);
        // Also save the constructed payload back to pipeline so M3 doesn't rebuild next time
        updateModule("m2", { exportPayload: safePayload });
        setPerceptionStatus({ type: "success", msg: `Auto-constructed perception data from ${srArr.length} scan results (${pipeline.m2.scores?.overall || 0}/100).` });
      } catch (e) {
        console.warn("[M3] Failed to build perception data from scanResults:", e);
      }
    }
  }, [pipeline.m2.exportPayload, pipeline.m2.scanResults, pipelineM2Loaded]);

  // Cross-reference AI-cited domains with Authority Ring domain list
  useEffect(() => {
    const scanResults = pipeline.m2.scanResults;
    const resultsArr = asArray(scanResults?.results);
    const llmsArr = asArray(scanResults?.llms);
    if (!resultsArr.length) { setAiCitedDomains([]); return; }

    const domainMap = {};
    const domainLookup = {};
    DOMAINS.forEach(d => {
      // Normalize domain for matching: "hbr.org" → "hbr.org", handle www prefix
      domainLookup[d.domain.toLowerCase()] = d;
      // Also index without TLD for fuzzy match: "hbr.org" → "hbr"
      const base = d.domain.toLowerCase().replace(/\.(com|org|net|io|co|ai)$/, "");
      domainLookup[base] = d;
    });

    resultsArr.forEach(r => {
      llmsArr.forEach(lid => {
        const a = r.analyses?.[lid];
        if (!a || a._error) return;
        (a.cited_sources || []).forEach(src => {
          const raw = (src.domain || "").toLowerCase().replace(/^www\./, "");
          if (!raw) return;
          // Try exact match first, then base domain match
          const matched = domainLookup[raw] || domainLookup[raw.replace(/\.(com|org|net|io|co|ai)$/, "")];
          if (matched) {
            const key = matched.id;
            if (!domainMap[key]) domainMap[key] = { domainId: key, domain: matched.domain, citationCount: 0, llms: new Set(), queries: new Set(), contexts: [] };
            domainMap[key].citationCount++;
            domainMap[key].llms.add(lid);
            domainMap[key].queries.add(r.qid);
            if (src.context && domainMap[key].contexts.length < 5) domainMap[key].contexts.push(src.context);
          }
        });
      });
    });

    const cited = Object.values(domainMap)
      .map(d => ({ ...d, llms: [...d.llms], queries: [...d.queries], queryCount: d.queries.size || d.queries.length }))
      .sort((a, b) => b.citationCount - a.citationCount);
    setAiCitedDomains(cited);
  }, [pipeline.m2.scanResults]);

  // Compute enhanced priority scores when perception data is available
  const enhancedDomains = useMemo(() => {
    if (!perceptionData && aiCitedDomains.length === 0) return DOMAINS;

    // Pre-compute weak personas and stages once (outside the map)
    const pbArr = asArray(perceptionData?.personaBreakdown);
    const sbArr = asArray(perceptionData?.stageBreakdown);
    const weakPersonas = pbArr.filter(p => p.mentionRate < 70).map(p => p.persona);
    const weakStages = sbArr.filter(s => s.mentionRate < 70).map(s => s.stage.toLowerCase());
    const weakest = pbArr.length > 0 ? pbArr.reduce((a, b) => a.mentionRate < b.mentionRate ? a : b) : null;

    return DOMAINS.map(d => {
      let boost = 0;
      const matchingGaps = [];
      let personaOverlap = [];
      let stageOverlap = [];

      if (perceptionData) {
        personaOverlap = (d.buyerPersonas || []).filter(p => weakPersonas.includes(p));
        boost += personaOverlap.length * 3;

        stageOverlap = (d.buyingStages || []).filter(s => weakStages.includes(s));
        boost += stageOverlap.length * 2;

        // Match domain topics to content gaps
        asArray(perceptionData.allContentGaps).forEach(gap => {
          const gapLower = gap.toLowerCase();
          (d.topicsFit || []).forEach(topic => {
            if (gapLower.includes(topic.toLowerCase()) || topic.toLowerCase().split(" ").some(w => w.length > 4 && gapLower.includes(w))) {
              matchingGaps.push(gap);
              boost += 2;
            }
          });
        });

        // Extra boost if domain serves the weakest persona
        if (weakest && (d.buyerPersonas || []).includes(weakest.persona)) boost += 5;
      }

      // AI Citation cross-reference: boost domains that AI already cites
      const citedEntry = aiCitedDomains.find(c => c.domainId === d.id);
      const aiCitations = citedEntry ? citedEntry.citationCount : 0;
      const aiCitedByLLMs = citedEntry ? citedEntry.llms : [];
      // Domains already cited by AI get a boost (validates their authority)
      if (aiCitations > 0) boost += Math.min(aiCitations * 2, 10);

      return {
        ...d,
        perceptionBoost: boost,
        matchingGaps: [...new Set(matchingGaps)],
        enhancedPriority: Math.min(d.priorityScore + boost, 100),
        weakPersonasServed: personaOverlap,
        weakStagesServed: stageOverlap,
        aiCitations,
        aiCitedByLLMs,
        aiCitedContexts: citedEntry?.contexts || [],
      };
    });
  }, [perceptionData, aiCitedDomains]);

  const toggleSort = useCallback((col) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }, [sortBy]);

  const filtered = useMemo(() => {
    let d = [...enhancedDomains];
    if (filterStatus) d = d.filter(x => x.sirionStatus === filterStatus);
    if (filterCategory) d = d.filter(x => x.category === filterCategory);
    if (filterPersona) d = d.filter(x => x.buyerPersonas?.includes(filterPersona));
    const sortKey = perceptionData && sortBy === "priorityScore" ? "enhancedPriority" : sortBy;
    const mul = sortDir === "desc" ? 1 : -1;
    d.sort((a, b) => mul * ((b[sortKey] || 0) - (a[sortKey] || 0)));
    return d;
  }, [filterStatus, filterCategory, filterPersona, sortBy, sortDir, enhancedDomains, perceptionData]);

  const stats = useMemo(() => {
    const zeros = DOMAINS.filter(d => d.sirionStatus === "verified_zero").length;
    const present = DOMAINS.filter(d => d.sirionStatus === "verified_present").length;
    const strong = DOMAINS.filter(d => d.sirionStatus === "verified_strong").length;
    const totalCostLow = DOMAINS.filter(d => d.sirionStatus === "verified_zero").reduce((s, d) => s + (d.estCostLow || 0), 0);
    const totalCostHigh = DOMAINS.filter(d => d.sirionStatus === "verified_zero").reduce((s, d) => s + (d.estCostHigh || 0), 0);
    const fiverrable = DOMAINS.filter(d => d.fiverr).length;
    const avgDA = Math.round(DOMAINS.reduce((s, d) => s + d.da, 0) / DOMAINS.length);
    const narrativeGaps = DOMAINS.filter(d => d.narrativeGap).length;
    return { zeros, present, strong, totalCostLow, totalCostHigh, fiverrable, avgDA, narrativeGaps, total: DOMAINS.length };
  }, []);

  const categories = useMemo(() => [...new Set(DOMAINS.map(d => d.category))].sort(), []);

  // Force re-sync perception data from M2 pipeline
  const forceResyncPerception = useCallback(() => {
    setPipelineM2Loaded(false);
    setPerceptionData(null);
    setPerceptionStatus(null);
  }, []);

  // Computed insights for every tab — "So what? Now what?"
  const insights = useMemo(() => {
    // Ring: top gaps by priority
    const topGaps = enhancedDomains
      .filter(d => d.sirionStatus === "verified_zero")
      .sort((a, b) => (b.enhancedPriority || b.priorityScore) - (a.enhancedPriority || a.priorityScore))
      .slice(0, 3);
    // Gap Matrix
    const icertisGaps = DOMAINS.filter(d => d.sirionStatus === "verified_zero" && d.icertisPresent).length;
    const whiteSpace = DOMAINS.filter(d => d.sirionStatus === "verified_zero" && !d.icertisPresent).length;
    // Outreach
    const allZeros = DOMAINS.filter(d => d.sirionStatus === "verified_zero");
    const outreachDone = allZeros.filter(d => outreachTracker[d.id]?.status === "DONE").length;
    const outreachIP = allZeros.filter(d => outreachTracker[d.id]?.status === "IN_PROGRESS").length;
    const quickWins = allZeros.filter(d => d.fiverr || d.difficulty === "easy").length;
    // Cost
    const top5Gaps = enhancedDomains
      .filter(d => d.sirionStatus === "verified_zero")
      .sort((a, b) => (b.enhancedPriority || b.priorityScore) - (a.enhancedPriority || a.priorityScore))
      .slice(0, 5);
    const top5CostLow = top5Gaps.reduce((s, d) => s + (d.estCostLow || 0), 0);
    const top5CostHigh = top5Gaps.reduce((s, d) => s + (d.estCostHigh || 0), 0);
    const top5Personas = [...new Set(top5Gaps.flatMap(d => d.buyerPersonas || []))];
    // Persona coverage
    const pCov = PERSONAS.map(p => {
      const doms = DOMAINS.filter(d => d.buyerPersonas?.includes(p.id));
      const present = doms.filter(d => d.sirionStatus !== "verified_zero").length;
      const pct = doms.length ? Math.round((present / doms.length) * 100) : 0;
      const topUncovered = doms.filter(d => d.sirionStatus === "verified_zero")
        .sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 2);
      return { ...p, pct, present, total: doms.length, topUncovered };
    }).sort((a, b) => a.pct - b.pct);
    // Perception
    const pbArr = asArray(perceptionData?.personaBreakdown);
    const weakPerceptionCount = pbArr.filter(p => p.mentionRate < 70).length;
    return {
      ring: { topGaps },
      gaps: { icertisGaps, whiteSpace },
      outreach: { done: outreachDone, inProgress: outreachIP, quickWins, totalTargets: allZeros.length },
      cost: { top5Gaps, top5CostLow, top5CostHigh, top5Personas },
      persona: { weakest: pCov[0], strongest: pCov[pCov.length - 1] },
      perception: { weakPerceptionCount },
    };
  }, [enhancedDomains, outreachTracker, perceptionData]);

  // Push M3 output to pipeline (auto-triggered whenever perception data or citations change)
  useEffect(() => {
    // Only write if we have SOME data (perception or citations)
    if (!perceptionData && aiCitedDomains.length === 0) return;
    const gapDomains = enhancedDomains.filter(d => d.sirionStatus === "verified_zero");
    const personaDomainMap = {};
    enhancedDomains.forEach(d => {
      (d.buyerPersonas || []).forEach(p => {
        if (!personaDomainMap[p]) personaDomainMap[p] = [];
        personaDomainMap[p].push(d.domain);
      });
    });
    const m3Data = {
      prioritizedDomains: gapDomains.map(d => ({
        domain: d.domain, da: d.da, priority: d.enhancedPriority || d.priorityScore,
        personas: d.buyerPersonas, stages: d.buyingStages, narrativeGap: d.narrativeGap,
        aiCitations: d.aiCitations || 0,
      })),
      personaDomainMap,
      aiCitedDomains: aiCitedDomains.slice(0, 50),
      gapCount: stats.zeros,
      strongCount: stats.strong,
      presentCount: stats.present,
      totalDomains: stats.total,
      analyzedAt: new Date().toISOString(),
    };
    // Phase 3: Add generation tracking so Dashboard can detect staleness
    m3Data.generationId = new Date().toISOString();
    m3Data.m2GenerationId = pipeline.m2.generationId || null;
    updateModule("m3", m3Data);
    // Phase 2: Removed separate db.saveWithId("m3_authority_ring") — PipelineContext
    // now saves M3 data to Firebase as part of the pipeline document via persistenceManager.
  }, [perceptionData, enhancedDomains, aiCitedDomains]);

  const tipStyle = { background: T.card, border: `1px solid ${T.borderActive}`, borderRadius: 8, fontSize: 11, fontFamily: T.b, color: T.text, padding: "8px 12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" };

  /* ─── RENDER ─── */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.b }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      {/* Header */}
      <div style={{ padding: "20px 24px 0", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: T.m, color: T.accent, letterSpacing: "0.2em", opacity: 0.6 }}>XTRUSIO</span>
          <span style={{ fontSize: 11, color: T.dim }}>·</span>
          <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim, letterSpacing: "0.15em" }}>MODULE 3 OF 5</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, fontFamily: T.h, margin: "4px 0", background: `linear-gradient(135deg, ${T.accent}, ${T.teal})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Authority Ring
        </h1>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 16, maxWidth: 700, lineHeight: 1.5 }}>
          Competitor backlink intelligence → Gap identification → Outreach roadmap.
          Every domain below has been manually verified with Google Boolean search.
        </p>

        {/* Perception Data Active Banner */}
        {perceptionData && (
          <div style={{ padding: "8px 14px", borderRadius: 8, background: T.teal + "08", border: `1px solid ${T.teal}25`, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.teal, animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: T.teal, fontWeight: 600, fontFamily: T.m }}>PERCEPTION INTEL ACTIVE</span>
            <span style={{ fontSize: 11, color: T.muted }}>
              Score: {perceptionData.scores?.overall}/100 · {perceptionData.totalQueries} queries · Imported {new Date(perceptionData.exportDate).toLocaleDateString()}
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setNav("perception")} style={{ fontSize: 11, color: T.teal, background: "transparent", border: `1px solid ${T.teal}30`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: T.m }}>View</button>
          </div>
        )}

        {/* Nav */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setNav(n.id)}
              style={{ padding: "8px 16px", fontSize: 11, fontFamily: T.m, fontWeight: nav === n.id ? 700 : 400, color: nav === n.id ? (n.id === "perception" && perceptionData ? T.teal : T.accent) : T.dim, background: nav === n.id ? T.accentDim : "transparent", border: "none", borderBottom: nav === n.id ? `2px solid ${n.id === "perception" && perceptionData ? T.teal : T.accent}` : "2px solid transparent", cursor: "pointer", borderRadius: "6px 6px 0 0", transition: "all 0.15s", letterSpacing: "0.04em" }}>
              <span style={{ marginRight: 6, fontSize: 12 }}>{n.icon}</span>{n.label}
              {n.tag && <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 5px", borderRadius: 3, background: perceptionData ? T.teal + "15" : "rgba(255,255,255,0.04)", color: perceptionData ? T.teal : T.dim, fontWeight: 700 }}>{perceptionData ? "ACTIVE" : n.tag}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 24px 40px", maxWidth: 1100, margin: "0 auto" }}>
        {/* ═══ TAB: AUTHORITY RING ═══ */}
        {nav === "ring" && (
          <>
            {/* Insight Banner */}
            <InsightBanner color={T.accent}
              insight={<>{stats.zeros} of {stats.total} tracked domains have <span style={{ fontWeight: 800, color: T.red }}>zero</span> Sirion presence. {stats.present} have content but wrong narrative. {stats.strong} are strong partnerships to leverage.</>}
              action={<>Focus first on {insights.ring.topGaps.map((d, i) => <span key={d.id}>{i > 0 && ", "}<span style={{ color: T.text }}>{d.domain}</span> (DA {d.da})</span>)} — these are the highest-impact gaps.</>}
            />

            {/* Competitive Alert Banner */}
            {(() => {
              const icertisCount = DOMAINS.filter(d => d.icertisPresent).length;
              const sirionPresentCount = DOMAINS.filter(d => d.sirionStatus !== "verified_zero").length;
              const bothZeroSirionIcertisHas = DOMAINS.filter(d => d.sirionStatus === "verified_zero" && d.icertisPresent).length;
              const gapPct = Math.round((icertisCount - sirionPresentCount) / DOMAINS.length * 100);
              return (
                <div style={{
                  marginBottom: 16, padding: "14px 20px", borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(251,146,60,0.04) 100%)",
                  border: `1px solid rgba(248,113,113,0.18)`,
                  borderLeft: `4px solid ${T.red}`,
                  display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>!!</span>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, fontFamily: T.h, color: T.red, letterSpacing: "0.06em", marginBottom: 3 }}>
                      COMPETITIVE ALERT
                    </div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, fontFamily: T.b }}>
                      Icertis holds presence on <span style={{ fontWeight: 800, color: T.red }}>{icertisCount}</span> of {DOMAINS.length} tracked domains.
                      {" "}Sirion: <span style={{ fontWeight: 800, color: T.teal }}>{sirionPresentCount}</span>.
                      {" "}Gap: <span style={{ fontWeight: 800, color: T.red }}>{gapPct > 0 ? "+" : ""}{gapPct}%</span>.
                      {" "}<span style={{ color: T.muted }}>|</span>{" "}
                      <span style={{ fontWeight: 800, color: T.orange }}>{bothZeroSirionIcertisHas}</span> domains where Icertis is present and Sirion has zero presence.
                    </div>
                  </div>
                  <div style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 8,
                    background: "rgba(248,113,113,0.10)", border: `1px solid rgba(248,113,113,0.20)`,
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: T.h, color: T.red, lineHeight: 1 }}>{bothZeroSirionIcertisHas}</div>
                    <div style={{ fontSize: 9, fontFamily: T.m, color: T.red, letterSpacing: "0.08em", marginTop: 2 }}>CRITICAL GAPS</div>
                  </div>
                </div>
              );
            })()}

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
              <Panel glow={T.red}><Stat label="PURE GAPS" value={stats.zeros} color={T.red} sub="verified zero" /></Panel>
              <Panel glow={T.gold}><Stat label="WRONG NARRATIVE" value={stats.present} color={T.gold} sub="present but wrong type" /></Panel>
              <Panel glow={T.green}><Stat label="STRONG" value={stats.strong} color={T.green} sub="leverage existing" /></Panel>
              <Panel glow={T.accent}><Stat label="NARRATIVE GAPS" value={stats.narrativeGaps} color={T.accent} sub="need content fix" /></Panel>
              <Panel glow={T.blue}><Stat label="FIVERR-ABLE" value={stats.fiverrable} color={T.blue} sub="guest post available" /></Panel>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m, marginRight: 4 }}>FILTER:</span>
              {[null, "verified_zero", "verified_present", "verified_strong"].map(s => (
                <button key={s || "all"} onClick={() => setFilterStatus(s)}
                  style={{ padding: "4px 10px", fontSize: 11, fontFamily: T.m, color: filterStatus === s ? T.text : T.dim, background: filterStatus === s ? T.accentDim : "transparent", border: `1px solid ${filterStatus === s ? T.borderActive : T.border}`, borderRadius: 6, cursor: "pointer" }}>
                  {s ? s.replace("verified_", "").toUpperCase() : "ALL"}
                </button>
              ))}
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m, marginLeft: 10 }}>{filtered.length} of {DOMAINS.length} domains</span>
            </div>

            {/* ═══ SORTABLE DOMAIN TABLE ═══ */}
            {(() => {
              const thBase = { padding: "8px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.06em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", position: "sticky", top: 0, background: T.bg, zIndex: 2 };
              const thActive = (col) => sortBy === col ? { color: T.accent } : {};
              const arrow = (col) => sortBy === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";
              const tdBase = { padding: "8px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
              const scoreColor = (s) => s >= 90 ? T.red : s >= 75 ? T.gold : T.dim;
              return (
                <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", background: T.surface }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                      <thead>
                        <tr>
                          <th style={{ ...thBase, width: 36, textAlign: "center", ...thActive("priorityScore") }} onClick={() => toggleSort("priorityScore")}>SCORE{arrow("priorityScore")}</th>
                          <th style={{ ...thBase, minWidth: 120 }}>DOMAIN</th>
                          <th style={{ ...thBase, width: 70, textAlign: "center" }}>STATUS</th>
                          <th style={{ ...thBase, width: 44, textAlign: "center", ...thActive("da") }} onClick={() => toggleSort("da")}>DA{arrow("da")}</th>
                          <th style={{ ...thBase, width: 44, textAlign: "center", ...thActive("aiCitationWeight") }} onClick={() => toggleSort("aiCitationWeight")}>AI{arrow("aiCitationWeight")}</th>
                          <th style={{ ...thBase, width: 80, textAlign: "center" }}>COMPETE</th>
                          <th style={{ ...thBase, minWidth: 100 }}>CATEGORY</th>
                          <th style={{ ...thBase, minWidth: 140 }}>APPROACH</th>
                          <th style={{ ...thBase, width: 90, textAlign: "right", ...thActive("estCostLow") }} onClick={() => toggleSort("estCostLow")}>COST{arrow("estCostLow")}</th>
                          <th style={{ ...thBase, width: 70, textAlign: "center" }}>DIFF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((d, idx) => {
                          const ps = d.enhancedPriority || d.priorityScore;
                          const isExpanded = selectedDomain === d.id;
                          return (
                            <React.Fragment key={d.id}>
                              <tr onClick={() => setSelectedDomain(isExpanded ? null : d.id)}
                                style={{ cursor: "pointer", background: isExpanded ? T.accentDim : idx % 2 === 0 ? "transparent" : T.bg + "80", transition: "background 0.15s" }}
                                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.cardHover; }}
                                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : T.bg + "80"; }}>
                                {/* Score */}
                                <td style={{ ...tdBase, textAlign: "center", position: "relative" }}>
                                  <span style={{ fontWeight: 800, fontFamily: T.h, fontSize: 13, color: scoreColor(ps) }}>{ps}</span>
                                  {d.perceptionBoost > 0 && (
                                    <span title="AI perception boost from M2 scan data" style={{ position: "absolute", top: 2, right: 2, fontSize: 9, fontWeight: 800, color: "#000", background: T.teal, borderRadius: 4, padding: "0 3px", fontFamily: T.m }}>+{d.perceptionBoost}</span>
                                  )}
                                </td>
                                {/* Domain */}
                                <td style={{ ...tdBase, fontWeight: 600, color: T.text }}>
                                  {d.domain}
                                  {d.aiCitations > 0 && (
                                    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, fontFamily: T.m, color: "#000", background: "linear-gradient(135deg, #22D3EE, #3B82F6)", padding: "1px 6px", borderRadius: 3, verticalAlign: "middle" }}>AI x{d.aiCitations}</span>
                                  )}
                                </td>
                                {/* Status */}
                                <td style={{ ...tdBase, textAlign: "center" }}><StatusBadge status={d.sirionStatus} /></td>
                                {/* DA */}
                                <td style={{ ...tdBase, textAlign: "center", fontFamily: T.m, fontWeight: 600, color: d.da >= 85 ? T.green : T.muted }}>{d.da}</td>
                                {/* AI Weight */}
                                <td style={{ ...tdBase, textAlign: "center", fontFamily: T.m, fontWeight: 600, color: d.aiCitationWeight >= 85 ? T.cyan : T.muted }}>{d.aiCitationWeight}</td>
                                {/* Competitor */}
                                <td style={{ ...tdBase, textAlign: "center" }}>
                                  {d.icertisPresent
                                    ? d.sirionStatus === "verified_zero"
                                      ? <span style={{ fontSize: 9, fontWeight: 800, fontFamily: T.m, color: "#fff", background: T.red, padding: "2px 6px", borderRadius: 3 }}>ICERTIS</span>
                                      : <span style={{ fontSize: 9, fontFamily: T.m, color: T.red, opacity: 0.7 }}>ICERTIS</span>
                                    : <span style={{ fontSize: 9, color: T.dim }}>--</span>
                                  }
                                </td>
                                {/* Category */}
                                <td style={{ ...tdBase, fontSize: 10, color: T.muted }}>{d.category}</td>
                                {/* Approach */}
                                <td style={{ ...tdBase, fontSize: 10, color: T.accent }}>{d.approach || "--"}</td>
                                {/* Cost */}
                                <td style={{ ...tdBase, textAlign: "right", fontFamily: T.m, fontSize: 10 }}>${(d.estCostLow/1000).toFixed(1)}K-${(d.estCostHigh/1000).toFixed(1)}K</td>
                                {/* Difficulty */}
                                <td style={{ ...tdBase, textAlign: "center" }}><DifficultyBadge d={d.difficulty} /></td>
                              </tr>
                              {/* Expanded Detail Row */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={10} style={{ padding: 0, borderBottom: `2px solid ${T.accent}30` }} onClick={e => e.stopPropagation()}>
                                    <div style={{ padding: "14px 18px", background: T.card }}>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                        <div>
                                          <Label color={T.accent}>CURRENT SIRION PRESENCE</Label>
                                          <p style={{ fontSize: 11, color: d.sirionStatus === "verified_zero" ? T.red : T.muted, lineHeight: 1.5 }}>
                                            {d.sirionPresence || "No presence found. Verified zero with Google Boolean search."}
                                          </p>
                                          {d.narrativeGap && <>
                                            <Label color={T.gold}>NARRATIVE GAP</Label>
                                            <p style={{ fontSize: 11, color: T.gold, lineHeight: 1.5, opacity: 0.85 }}>{d.narrativeGap}</p>
                                          </>}
                                        </div>
                                        <div>
                                          <Label color={T.teal}>OUTREACH METHOD</Label>
                                          <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{d.method}</p>
                                          <div style={{ marginTop: 8 }}>
                                            <Label color={T.dim}>VERIFICATION</Label>
                                            <div style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>
                                              {d.searchQueries?.map((q, i) => <div key={i} style={{ marginBottom: 2 }}>-- {q}</div>)}
                                              <div style={{ marginTop: 4, color: T.green }}>Verified: {d.verifiedDate}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Tags */}
                                      <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {d.topicsFit?.map(t => <Chip key={t} text={t} color={T.accent} small />)}
                                        {d.buyerPersonas?.map(p => <Chip key={p} text={p} color={T.teal} small />)}
                                        {d.buyingStages?.map(s => <Chip key={s} text={s} color={T.gold} small />)}
                                        {d.fiverr && <Chip text="FIVERR" color={T.blue} small />}
                                      </div>
                                      {/* Perception Intelligence */}
                                      {perceptionData && (d.weakPersonasServed?.length > 0 || d.matchingGaps?.length > 0) && (
                                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: T.teal + "06", border: `1px solid ${T.teal}18` }}>
                                          <Label color={T.teal}>PERCEPTION INTELLIGENCE (FROM M2)</Label>
                                          {d.weakPersonasServed?.length > 0 && (
                                            <div style={{ marginBottom: 6 }}>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>SERVES WEAK PERSONAS: </span>
                                              {d.weakPersonasServed.map(p => <Chip key={p} text={p} color={T.teal} small />)}
                                            </div>
                                          )}
                                          {d.weakStagesServed?.length > 0 && (
                                            <div style={{ marginBottom: 6 }}>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>COVERS WEAK STAGES: </span>
                                              {d.weakStagesServed.map(s => <Chip key={s} text={s} color={T.gold} small />)}
                                            </div>
                                          )}
                                          {d.matchingGaps?.length > 0 && (
                                            <div>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>ADDRESSES CONTENT GAPS:</span>
                                              {d.matchingGaps.slice(0, 3).map((g, i) => (
                                                <div key={i} style={{ fontSize: 11, color: T.muted, marginTop: 2, paddingLeft: 8, borderLeft: `2px solid ${T.teal}30` }}>- {g}</div>
                                              ))}
                                              {d.matchingGaps.length > 3 && <div style={{ fontSize: 11, color: T.dim, paddingLeft: 8, marginTop: 2 }}>+{d.matchingGaps.length - 3} more</div>}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {/* AI Citation Intelligence */}
                                      {d.aiCitations > 0 && (
                                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: T.cyan + "06", border: `1px solid ${T.cyan}18` }}>
                                          <Label color={T.cyan}>AI CITATION INTELLIGENCE</Label>
                                          <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
                                            <div>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>CITED </span>
                                              <span style={{ fontSize: 14, fontWeight: 800, color: T.cyan, fontFamily: T.h }}>{d.aiCitations}x</span>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}> across scan results</span>
                                            </div>
                                            <div>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>BY: </span>
                                              {d.aiCitedByLLMs?.map(lid => (
                                                <Chip key={lid} text={lid.charAt(0).toUpperCase() + lid.slice(1)} color={T.blue} small />
                                              ))}
                                            </div>
                                          </div>
                                          {d.aiCitedContexts?.length > 0 && (
                                            <div>
                                              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>CITATION CONTEXT:</span>
                                              {d.aiCitedContexts.slice(0, 3).map((ctx, i) => (
                                                <div key={i} style={{ fontSize: 11, color: T.muted, marginTop: 2, paddingLeft: 8, borderLeft: `2px solid ${T.cyan}30` }}>- {ctx}</div>
                                              ))}
                                            </div>
                                          )}
                                          <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>This domain is already being cited by AI models. Content published here has high authority signal.</div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ═══ TAB: PERCEPTION INTEL (M2→M3 Bridge) ═══ */}
        {nav === "perception" && (
          <>
            {/* Insight Banner */}
            {perceptionData ? (
              <InsightBanner color={T.teal}
                insight={<>M2 perception score: <span style={{ fontWeight: 800, color: T.teal }}>{perceptionData.scores?.overall}/100</span>. {insights.perception.weakPerceptionCount > 0 ? <>{insights.perception.weakPerceptionCount} personas below 70% mention rate.</> : <>All personas above 70% mention rate.</>} {aiCitedDomains.length > 0 && <>{aiCitedDomains.length} Authority Ring domains are actively cited by AI models.</>}</>}
                action={<>Domain priority scores have been boosted based on perception gaps. Switch to the Ring tab to see enhanced priorities.</>}
              />
            ) : (
              <InsightBanner color={T.dim}
                insight={<>No perception data available yet. Run a scan in <span style={{ fontWeight: 800, color: T.accent }}>Perception Monitor</span> to enable intelligent domain prioritization based on AI citation gaps, weak personas, and content opportunities.</>}
                action={<>Without M2 data, domain priorities are based on static DA scores and manual verification only.</>}
              />
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: T.teal, letterSpacing: "0.16em", fontWeight: 700, textTransform: "uppercase", fontFamily: T.m }}>PERCEPTION INTELLIGENCE — M2→M3 AUTO-BRIDGE</div>
              <span style={{ flex: 1 }} />
              {perceptionData && (
                <button onClick={forceResyncPerception} style={{ fontSize: 10, fontFamily: T.m, color: T.teal, background: T.teal + "10", border: `1px solid ${T.teal}25`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.04em" }}>
                  Refresh from latest scan
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5, marginTop: -8 }}>
              Scan data from the Perception Monitor flows automatically into Authority Ring.
              Domain priority scores are boosted based on how well each domain addresses your weakest personas, content gaps, and AI citation patterns.
            </p>

            {/* Auto-sync Status */}
            <Panel glow={T.teal} style={{ borderLeft: `3px solid ${perceptionData ? T.green : T.dim}`, marginBottom: 16 }}>
              <Label color={perceptionData ? T.green : T.dim}>DATA SYNC STATUS</Label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: perceptionData ? T.green : T.dim, boxShadow: perceptionData ? `0 0 8px ${T.green}50` : "none" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: perceptionData ? T.green : T.dim, fontFamily: T.m }}>
                  {perceptionData ? "ACTIVE — Auto-synced from M2" : "WAITING — Run a scan in Perception Monitor first"}
                </span>
              </div>
              {perceptionStatus && (
                <div style={{ fontSize: 11, color: perceptionStatus.type === "success" ? T.green : T.red, fontWeight: 600 }}>
                  {perceptionStatus.msg}
                </div>
              )}
              {perceptionData && (
                <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 11, color: T.muted }}>
                  <span>Queries: <strong style={{ color: T.text }}>{perceptionData.totalQueries}</strong></span>
                  <span>Score: <strong style={{ color: T.teal }}>{perceptionData.scores?.overall}/100</strong></span>
                  <span>Gaps: <strong style={{ color: T.red }}>{perceptionData.allContentGaps?.length || 0}</strong></span>
                  <span>AI-Cited Domains: <strong style={{ color: T.cyan }}>{aiCitedDomains.length}</strong></span>
                </div>
              )}
            </Panel>

            {/* AI-Cited Domains Cross-Reference */}
            {aiCitedDomains.length > 0 && (
              <Panel glow={T.cyan} style={{ borderLeft: `3px solid ${T.cyan}`, marginBottom: 16 }}>
                <Label color={T.cyan}>AI-CITED AUTHORITY DOMAINS ({aiCitedDomains.length} MATCHED)</Label>
                <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  These domains from the Authority Ring are being actively cited by AI models in scan results. Publishing Sirion content here has the highest impact on AI perception.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {aiCitedDomains.slice(0, 10).map(c => {
                    const domObj = DOMAINS.find(d => d.id === c.domainId);
                    return (
                      <div key={c.domainId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: T.surface }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: T.cyan, fontFamily: T.h, minWidth: 30, textAlign: "center" }}>{c.citationCount}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.domain}</span>
                          <span style={{ fontSize: 11, color: T.dim, marginLeft: 8 }}>{domObj?.category}</span>
                          {domObj && <StatusBadge status={domObj.sirionStatus} />}
                        </div>
                        <div style={{ display: "flex", gap: 3 }}>
                          {c.llms.map(lid => <Chip key={lid} text={lid} color={T.blue} small />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {aiCitedDomains.length > 10 && (
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>+{aiCitedDomains.length - 10} more domains</div>
                )}
              </Panel>
            )}

            {/* Perception Dashboard (when data is loaded) */}
            {perceptionData && (
              <>
                {/* Scores Overview */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { l: "OVERALL SCORE", v: perceptionData.scores?.overall, c: T.teal },
                    { l: "MENTION RATE", v: perceptionData.scores?.mention + "%", c: T.blue },
                    { l: "TOTAL QUERIES", v: perceptionData.totalQueries, c: T.accent },
                    { l: "CONTENT GAPS", v: perceptionData.allContentGaps?.length || 0, c: T.red },
                  ].map(k => (
                    <Panel key={k.l} glow={k.c}>
                      <Stat label={k.l} value={k.v} color={k.c} />
                    </Panel>
                  ))}
                </div>

                {/* Persona Mention Rate Table */}
                {(() => {
                  const pArr = asArray(perceptionData.personaBreakdown).sort((a, b) => a.mentionRate - b.mentionRate);
                  if (pArr.length === 0) return null;
                  const piThS = { padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left" };
                  const piTdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
                  return (
                    <div style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${T.accent}15`, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", background: T.accent + "08", borderBottom: `1px solid ${T.border}` }}>
                        <Label color={T.accent}>PERSONA MENTION RATES</Label>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                        <thead>
                          <tr>
                            <th style={{ ...piThS }}>PERSONA</th>
                            <th style={{ ...piThS, width: 70, textAlign: "center" }}>RATE</th>
                            <th style={{ ...piThS, width: 50, textAlign: "center" }}>QUERIES</th>
                            <th style={{ ...piThS, width: 70, textAlign: "center" }}>STATUS</th>
                            <th style={{ ...piThS }}>TOP DOMAINS TO TARGET</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pArr.map((p, idx) => {
                            const isWeak = p.mentionRate < 70;
                            const topDoms = enhancedDomains
                              .filter(d => (d.buyerPersonas || []).includes(p.persona) && d.sirionStatus === "verified_zero")
                              .sort((a, b) => (b.enhancedPriority || b.priorityScore) - (a.enhancedPriority || a.priorityScore))
                              .slice(0, 4);
                            return (
                              <tr key={p.persona} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                                <td style={{ ...piTdS, fontWeight: 600, color: T.text }}>{p.persona}</td>
                                <td style={{ ...piTdS, textAlign: "center", fontWeight: 800, fontFamily: T.h, fontSize: 14, color: isWeak ? T.red : T.green }}>{p.mentionRate}%</td>
                                <td style={{ ...piTdS, textAlign: "center", fontFamily: T.m, color: T.dim }}>{p.total}</td>
                                <td style={{ ...piTdS, textAlign: "center" }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.m, padding: "2px 6px", borderRadius: 3, background: isWeak ? T.red + "18" : T.green + "18", color: isWeak ? T.red : T.green }}>{isWeak ? "WEAK" : "OK"}</span>
                                </td>
                                <td style={{ ...piTdS }}>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {isWeak && topDoms.length > 0
                                      ? topDoms.map(d => <Chip key={d.id} text={d.domain} color={T.red} small />)
                                      : <span style={{ fontSize: 10, color: T.dim }}>--</span>
                                    }
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Stage Mention Rate Table */}
                {(() => {
                  const sArr = asArray(perceptionData.stageBreakdown).sort((a, b) => a.mentionRate - b.mentionRate);
                  if (sArr.length === 0) return null;
                  const siThS = { padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left" };
                  const siTdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
                  return (
                    <div style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${T.gold}15`, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", background: T.gold + "08", borderBottom: `1px solid ${T.border}` }}>
                        <Label color={T.gold}>BUYING STAGE MENTION RATES</Label>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                        <thead>
                          <tr>
                            <th style={{ ...siThS }}>STAGE</th>
                            <th style={{ ...siThS, width: 70, textAlign: "center" }}>RATE</th>
                            <th style={{ ...siThS, width: 70, textAlign: "center" }}>STATUS</th>
                            <th style={{ ...siThS }}>CONTENT NEEDED</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sArr.map((s, idx) => {
                            const isWeak = s.mentionRate < 70;
                            const stageConfig = STAGES.find(st => st.label.toLowerCase() === s.stage.toLowerCase());
                            return (
                              <tr key={s.stage} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                                <td style={{ ...siTdS, fontWeight: 600, color: T.text }}>{s.stage}</td>
                                <td style={{ ...siTdS, textAlign: "center", fontWeight: 800, fontFamily: T.h, fontSize: 14, color: isWeak ? T.gold : T.green }}>{s.mentionRate}%</td>
                                <td style={{ ...siTdS, textAlign: "center" }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.m, padding: "2px 6px", borderRadius: 3, background: isWeak ? T.gold + "18" : T.green + "18", color: isWeak ? T.gold : T.green }}>{isWeak ? "WEAK" : "OK"}</span>
                                </td>
                                <td style={{ ...siTdS, fontSize: 10, color: T.muted }}>{isWeak && stageConfig ? stageConfig.contentNeeded : "--"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Content Gaps Table */}
                {(() => {
                  const gaps = asArray(perceptionData.allContentGaps).slice(0, 15);
                  if (gaps.length === 0) return null;
                  const gThS = { padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left" };
                  const gTdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
                  return (
                    <div style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${T.red}15`, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", background: T.red + "08", borderBottom: `1px solid ${T.border}` }}>
                        <Label color={T.red}>CONTENT GAPS → DOMAIN MATCHES</Label>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                        <thead>
                          <tr>
                            <th style={{ ...gThS, width: 24, textAlign: "center" }}>#</th>
                            <th style={{ ...gThS }}>GAP DESCRIPTION</th>
                            <th style={{ ...gThS, minWidth: 160 }}>MATCHING DOMAINS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaps.map((gap, i) => {
                            const matchingDoms = enhancedDomains.filter(d => (d.matchingGaps || []).includes(gap)).slice(0, 3);
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.bg + "80" }}>
                                <td style={{ ...gTdS, textAlign: "center", fontFamily: T.m, color: T.dim, fontSize: 10 }}>{i + 1}</td>
                                <td style={{ ...gTdS, color: T.muted, fontSize: 11 }}>{gap}</td>
                                <td style={{ ...gTdS }}>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {matchingDoms.length > 0
                                      ? matchingDoms.map(d => <Chip key={d.id} text={d.domain} color={T.teal} small />)
                                      : <span style={{ fontSize: 10, color: T.dim, fontFamily: T.m }}>No match</span>
                                    }
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Re-prioritized Domain List */}
                <Panel style={{ marginBottom: 16 }}>
                  <Label color={T.teal}>RE-PRIORITIZED DOMAIN TARGETS (PERCEPTION-WEIGHTED)</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                    Domain scores boosted by how well they address your specific perception weaknesses. Green badge = perception boost applied.
                  </p>
                  {enhancedDomains
                    .filter(d => d.perceptionBoost > 0)
                    .sort((a, b) => b.enhancedPriority - a.enhancedPriority)
                    .slice(0, 12)
                    .map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ width: 32, textAlign: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.h, color: T.teal }}>{d.enhancedPriority}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600 }}>{d.domain}</span>
                            <StatusBadge status={d.sirionStatus} />
                            <Chip text={`+${d.perceptionBoost} boost`} color={T.teal} small />
                          </div>
                          <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                            {d.weakPersonasServed?.length > 0 && <span>Personas: {d.weakPersonasServed.join(", ")} · </span>}
                            {d.weakStagesServed?.length > 0 && <span>Stages: {d.weakStagesServed.join(", ")}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>was {d.priorityScore}</span>
                          <DifficultyBadge d={d.difficulty} />
                        </div>
                      </div>
                    ))}
                </Panel>
              </>
            )}

            {/* Empty State */}
            {!perceptionData && (
              <Panel style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.h, marginBottom: 8 }}>No Scan Data Available</div>
                <div style={{ color: T.muted, fontSize: 11, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
                  Run a scan in the Perception Monitor (M2) to automatically feed data into the Authority Ring.
                  Domain priority scores will be boosted based on your weakest personas, stages, and content gaps.
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontFamily: T.m, color: T.accent }}>Navigate to Perception Monitor → Run Scan → Data flows here automatically</span>
                </div>
              </Panel>
            )}
          </>
        )}

        {/* ═══ TAB: GAP MATRIX ═══ */}
        {nav === "gaps" && (
          <>
            {/* Insight Banner */}
            <InsightBanner color={T.red}
              insight={<><span style={{ fontWeight: 800, color: T.red }}>{insights.gaps.icertisGaps}</span> domains where Icertis is present and Sirion is absent — these are the competitive gaps driving AI citation losses. <span style={{ fontWeight: 800, color: T.gold }}>{insights.gaps.whiteSpace}</span> domains are white space with first-mover advantage. <span style={{ fontWeight: 800, color: T.accent }}>{stats.narrativeGaps}</span> existing pages reinforce the wrong narrative.</>}
              action={<>Close the {insights.gaps.icertisGaps} Icertis-held gaps first to reach competitive parity, then target white-space domains before competitors claim them.</>}
            />

            {/* Summary Stats Bar */}
            {(() => {
              const icGaps = DOMAINS.filter(d => d.sirionStatus === "verified_zero" && d.icertisPresent);
              const wsGaps = DOMAINS.filter(d => d.sirionStatus === "verified_zero" && !d.icertisPresent);
              const narGaps = DOMAINS.filter(d => d.narrativeGap);
              const allGapsSorted = [...icGaps, ...wsGaps].sort((a, b) => {
                const scoreA = (a.da / 100) * (a.aiCitationWeight || 50) * (a.icertisPresent ? 1.5 : 1);
                const scoreB = (b.da / 100) * (b.aiCitationWeight || 50) * (b.icertisPresent ? 1.5 : 1);
                return scoreB - scoreA;
              });
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                    <Panel glow={T.red} style={{ padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 900, fontFamily: T.h, color: T.red }}>{icGaps.length}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.red, letterSpacing: "0.1em", marginTop: 2 }}>COMPETITIVE GAPS</div>
                      <div style={{ fontSize: 9, color: T.dim, fontFamily: T.m, marginTop: 2 }}>Icertis present, Sirion absent</div>
                    </Panel>
                    <Panel glow={T.gold} style={{ padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 900, fontFamily: T.h, color: T.gold }}>{wsGaps.length}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.gold, letterSpacing: "0.1em", marginTop: 2 }}>WHITE SPACE</div>
                      <div style={{ fontSize: 9, color: T.dim, fontFamily: T.m, marginTop: 2 }}>First-mover advantage</div>
                    </Panel>
                    <Panel glow={T.accent} style={{ padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 900, fontFamily: T.h, color: T.accent }}>{narGaps.length}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.accent, letterSpacing: "0.1em", marginTop: 2 }}>NARRATIVE MISALIGNED</div>
                      <div style={{ fontSize: 9, color: T.dim, fontFamily: T.m, marginTop: 2 }}>Present but wrong positioning</div>
                    </Panel>
                  </div>

                  {/* Priority-Ranked Gap Table */}
                  <Label color={T.accent}>PRIORITY-RANKED GAPS — ALL ZERO-PRESENCE DOMAINS</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>Ranked by DA x AI citation weight x competitive multiplier. Higher score = close this gap first.</p>
                  <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 24 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface, minWidth: 700 }}>
                      <thead>
                        <tr>
                          {[{ l: "#", w: 36 }, { l: "DOMAIN" }, { l: "DA", w: 44 }, { l: "IMPACT", w: 60 }, { l: "TYPE", w: 100 }, { l: "EST. COST", w: 95 }, { l: "DIFF", w: 60 }, { l: "ACTION", w: 100 }].map(h => (
                            <th key={h.l} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: h.l === "#" || h.l === "DA" || h.l === "IMPACT" || h.l === "DIFF" ? "center" : h.l === "EST. COST" ? "right" : "left", width: h.w || "auto", whiteSpace: "nowrap" }}>{h.l}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allGapsSorted.map((d, idx) => {
                          const impactScore = Math.round((d.da / 100) * (d.aiCitationWeight || 50) * (d.icertisPresent ? 1.5 : 1));
                          return (
                            <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                              <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: T.m, borderBottom: `1px solid ${T.border}`, textAlign: "center", color: T.dim }}>{idx + 1}</td>
                              <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, fontWeight: 600, color: T.text }}>
                                {d.domain}
                                {d.fiverr && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, fontFamily: T.m, color: T.blue, background: T.blue + "18", padding: "1px 5px", borderRadius: 3 }}>FIVERR</span>}
                              </td>
                              <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: T.m, borderBottom: `1px solid ${T.border}`, textAlign: "center", fontWeight: 600, color: d.da >= 90 ? T.green : T.muted }}>{d.da}</td>
                              <td style={{ padding: "7px 10px", fontSize: 12, fontFamily: T.h, borderBottom: `1px solid ${T.border}`, textAlign: "center", fontWeight: 800, color: impactScore >= 100 ? T.red : impactScore >= 70 ? T.gold : T.muted }}>{impactScore}</td>
                              <td style={{ padding: "7px 10px", fontSize: 10, fontFamily: T.m, borderBottom: `1px solid ${T.border}`, color: d.icertisPresent ? T.red : T.teal }}>
                                {d.icertisPresent ? "Competitive Gap" : "White Space"}
                              </td>
                              <td style={{ padding: "7px 10px", fontSize: 10, fontFamily: T.m, borderBottom: `1px solid ${T.border}`, textAlign: "right", color: T.text }}>${(d.estCostLow / 1000).toFixed(1)}K–${(d.estCostHigh / 1000).toFixed(1)}K</td>
                              <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, textAlign: "center" }}><DifficultyBadge d={d.difficulty} /></td>
                              <td style={{ padding: "7px 6px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}` }}>
                                <button onClick={() => { setNav("outreach"); setOutreachFilter("all"); }} style={{ fontSize: 9, fontFamily: T.m, fontWeight: 700, color: T.teal, background: T.teal + "10", border: `1px solid ${T.teal}25`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                                  Close Gap →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Side-by-side breakdown (preserved, now below priority table) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    <Panel glow={T.red}>
                      <Label color={T.red}>ICERTIS HAS, SIRION DOESN'T</Label>
                      {icGaps.sort((a, b) => b.da - a.da).map(d => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 11, color: T.text }}>{d.domain}</span>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>DA {d.da}</span>
                            <DifficultyBadge d={d.difficulty} />
                          </div>
                        </div>
                      ))}
                    </Panel>
                    <Panel glow={T.gold}>
                      <Label color={T.gold}>BOTH ABSENT — WHITE SPACE</Label>
                      {wsGaps.sort((a, b) => b.da - a.da).map(d => (
                        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 11, color: T.text }}>{d.domain}</span>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>DA {d.da}</span>
                            <Chip text="FIRST MOVER" color={T.teal} small />
                          </div>
                        </div>
                      ))}
                    </Panel>
                  </div>

                  <Label color={T.gold}>SIRION PRESENT — WRONG NARRATIVE</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>These domains have Sirion content but it reinforces the post-signature specialist perception.</p>
                  {narGaps.map(d => (
                    <Panel key={d.id} style={{ padding: "10px 14px", marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{d.domain}</span>
                          <StatusBadge status={d.sirionStatus} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>{d.category}</span>
                      </div>
                      <p style={{ fontSize: 11, color: T.gold, marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>{d.narrativeGap}</p>
                    </Panel>
                  ))}
                </>
              );
            })()}
          </>
        )}

        {/* ═══ TAB: OUTREACH PLAN ═══ */}
        {nav === "outreach" && (
          <>
            {/* Insight Banner */}
            <InsightBanner color={insights.outreach.done > 0 ? T.green : T.blue}
              insight={<><span style={{ fontWeight: 800, color: T.green }}>{insights.outreach.done}</span> of {insights.outreach.totalTargets} target domains completed{insights.outreach.inProgress > 0 && <>, <span style={{ fontWeight: 800, color: T.blue }}>{insights.outreach.inProgress}</span> in progress</>}. <span style={{ fontWeight: 800, color: T.teal }}>{insights.outreach.quickWins}</span> quick wins available (easy difficulty or Fiverr-eligible).</>}
              action={insights.outreach.done === 0
                ? <>Start with quick wins to build momentum — easy domains like techrepublic.com, techtarget.com, and spiceworks.com can be closed in 1-2 weeks.</>
                : <>{insights.outreach.totalTargets - insights.outreach.done} domains remaining. {insights.outreach.quickWins > 0 && <>Prioritize the {insights.outreach.quickWins} quick wins to accelerate coverage.</>}</>
              }
            />

            {/* ── PROGRESS BAR ── */}
            {(() => {
              const allZ = DOMAINS.filter(d => d.sirionStatus === "verified_zero");
              const done = allZ.filter(d => outreachTracker[d.id]?.status === "DONE").length;
              const ip = allZ.filter(d => outreachTracker[d.id]?.status === "IN_PROGRESS").length;
              const pct = allZ.length ? Math.round(((done + ip * 0.5) / allZ.length) * 100) : 0;
              return (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.h }}>Outreach Progress</span>
                    <span style={{ fontSize: 11, fontFamily: T.m, color: pct >= 50 ? T.green : pct >= 20 ? T.gold : T.dim }}>{pct}% coverage</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: T.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${T.green}, ${T.teal})`, width: `${pct}%`, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>{done} done · {ip} in progress · {allZ.length - done - ip} remaining</span>
                    <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>Target: 50% in 90 days</span>
                  </div>
                </div>
              );
            })()}

            {/* ── THIS MONTH'S FOCUS ── */}
            {(() => {
              const allZeros = DOMAINS.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore);
              const notStarted = allZeros.filter(d => !outreachTracker[d.id]?.status || outreachTracker[d.id]?.status === "NOT_STARTED");
              const quickWinFirst = [...notStarted].sort((a, b) => {
                const diffOrder = { easy: 0, medium: 1, hard: 2, very_hard: 3 };
                const da = (diffOrder[a.difficulty] || 2) - (diffOrder[b.difficulty] || 2);
                return da !== 0 ? da : b.priorityScore - a.priorityScore;
              });
              const focusDomains = quickWinFirst.slice(0, 5);
              const inProgress = allZeros.filter(d => outreachTracker[d.id]?.status === "IN_PROGRESS");
              return focusDomains.length > 0 || inProgress.length > 0 ? (
                <Panel glow={T.teal} style={{ padding: "14px 18px", marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.h, color: T.teal }}>This Month's Focus</span>
                    <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim, background: T.teal + "12", padding: "2px 8px", borderRadius: 10 }}>MARCH 2026</span>
                  </div>
                  {inProgress.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.blue, letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>CONTINUE IN PROGRESS</div>
                      {inProgress.map(d => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.blue, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{d.domain}</span>
                          <span style={{ fontSize: 10, fontFamily: T.m, color: T.dim }}>DA {d.da}</span>
                          <span style={{ fontSize: 10, color: T.accent }}>{d.approach}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 9, fontFamily: T.m, color: T.teal, letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>START NEXT ({Math.min(focusDomains.length, 5)} RECOMMENDED)</div>
                  {focusDomains.map((d, i) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < focusDomains.length - 1 ? `1px solid ${T.border}` : "none" }}>
                      <span style={{ width: 18, height: 18, borderRadius: 9, background: T.teal + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, fontFamily: T.m, color: T.teal, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.text, minWidth: 140 }}>{d.domain}</span>
                      <span style={{ fontSize: 10, fontFamily: T.m, color: T.dim }}>DA {d.da}</span>
                      <DifficultyBadge d={d.difficulty} />
                      <span style={{ fontSize: 10, fontFamily: T.m, color: T.muted }}>${(d.estCostLow / 1000).toFixed(1)}K–${(d.estCostHigh / 1000).toFixed(1)}K</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: T.accent }}>{d.approach}</span>
                    </div>
                  ))}
                </Panel>
              ) : null;
            })()}

            {/* ── MONTHLY ROADMAP TIMELINE ── */}
            {(() => {
              const allZ = DOMAINS.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore);
              const easy = allZ.filter(d => d.difficulty === "easy" || d.fiverr);
              const medium = allZ.filter(d => d.difficulty === "medium" && !d.fiverr);
              const hard = allZ.filter(d => d.difficulty === "hard" || d.difficulty === "very_hard");
              const months = [
                { label: "Month 1", sub: "Quick Wins", color: T.green, domains: easy.slice(0, 4) },
                { label: "Month 2", sub: "Medium Targets", color: T.blue, domains: [...easy.slice(4), ...medium.slice(0, 3)] },
                { label: "Month 3", sub: "Strategic Pushes", color: T.gold, domains: medium.slice(3) },
                { label: "Month 4-6", sub: "High-Impact", color: T.red, domains: hard },
              ].filter(m => m.domains.length > 0);
              return (
                <div style={{ marginBottom: 20 }}>
                  <Label color={T.accent}>MONTHLY ROADMAP — PHASED EXECUTION</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>Domains grouped by difficulty into monthly execution phases. Easy wins first, then escalate.</p>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: 10 }}>
                    {months.map((m, mi) => (
                      <div key={mi} style={{ background: T.surface, borderRadius: 8, border: `1px solid ${m.color}15`, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: m.color + "08", borderBottom: `1px solid ${m.color}15` }}>
                          <div style={{ fontSize: 11, fontWeight: 800, fontFamily: T.h, color: m.color }}>{m.label}</div>
                          <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>{m.sub} · {m.domains.length} domains</div>
                        </div>
                        <div style={{ padding: "8px 12px" }}>
                          {m.domains.map(d => {
                            const st = outreachTracker[d.id]?.status || "NOT_STARTED";
                            const stColor = st === "DONE" ? T.green : st === "IN_PROGRESS" ? T.blue : T.dim;
                            return (
                              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
                                <span style={{ width: 5, height: 5, borderRadius: 3, background: stColor, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: T.text, flex: 1 }}>{d.domain}</span>
                                <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>{d.da}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <Label color={T.accent}>OUTREACH PROJECT TRACKER</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>Track outreach execution per domain. Status changes persist to Firebase automatically.</p>

            {/* Status Summary + Filters */}
            {(() => {
              const allZeros = DOMAINS.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore);
              const statusCounts = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0, BLOCKED: 0 };
              allZeros.forEach(d => { const s = outreachTracker[d.id]?.status || "NOT_STARTED"; statusCounts[s]++; });
              const statusColors = { NOT_STARTED: T.dim, IN_PROGRESS: T.blue, DONE: T.green, BLOCKED: T.red };
              const statusLabels = { NOT_STARTED: "Not Started", IN_PROGRESS: "In Progress", DONE: "Done", BLOCKED: "Blocked" };
              const filteredOutreach = outreachFilter === "all" ? allZeros
                : outreachFilter === "quick_wins" ? allZeros.filter(d => d.fiverr || d.difficulty === "easy")
                : outreachFilter === "high_impact" ? allZeros.filter(d => d.priorityScore >= 85)
                : allZeros.filter(d => (outreachTracker[d.id]?.status || "NOT_STARTED") === "BLOCKED");

              const thS = { padding: "8px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0, background: T.bg, zIndex: 2 };
              const tdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
              const selS = { fontSize: 10, fontFamily: T.m, background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 4, padding: "3px 6px", cursor: "pointer" };

              return (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                    {Object.entries(statusCounts).map(([key, count]) => (
                      <Panel key={key} glow={statusColors[key]} style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: statusColors[key] }}>{count}</div>
                        <div style={{ fontSize: 9, fontFamily: T.m, color: statusColors[key], letterSpacing: "0.08em", marginTop: 2 }}>{statusLabels[key].toUpperCase()}</div>
                      </Panel>
                    ))}
                  </div>

                  {/* Filter Buttons */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                    {[{ id: "all", label: "All Targets" }, { id: "quick_wins", label: "Quick Wins" }, { id: "high_impact", label: "High Impact" }, { id: "blocked", label: "Blocked" }].map(f => (
                      <button key={f.id} onClick={() => setOutreachFilter(f.id)}
                        style={{ padding: "4px 10px", fontSize: 11, fontFamily: T.m, color: outreachFilter === f.id ? T.text : T.dim, background: outreachFilter === f.id ? T.accentDim : "transparent", border: `1px solid ${outreachFilter === f.id ? T.borderActive : T.border}`, borderRadius: 6, cursor: "pointer" }}>
                        {f.label}
                      </button>
                    ))}
                    <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m, marginLeft: 8 }}>{filteredOutreach.length} domains</span>
                  </div>

                  {/* Outreach Table */}
                  <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", background: T.surface }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
                        <thead>
                          <tr>
                            <th style={{ ...thS, width: 50, textAlign: "center" }}>SCORE</th>
                            <th style={{ ...thS, minWidth: 110 }}>DOMAIN</th>
                            <th style={{ ...thS, minWidth: 160 }}>ACTION</th>
                            <th style={{ ...thS, width: 100, textAlign: "center" }}>STATUS</th>
                            <th style={{ ...thS, width: 90 }}>METHOD</th>
                            <th style={{ ...thS, width: 80, textAlign: "right" }}>COST</th>
                            <th style={{ ...thS, width: 65, textAlign: "center" }}>DIFF</th>
                            <th style={{ ...thS, width: 80 }}>TIMELINE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOutreach.map((d, idx) => {
                            const tracker = outreachTracker[d.id] || {};
                            const st = tracker.status || "NOT_STARTED";
                            const outreachEntry = Object.values(OUTREACH_METHODS).find(m => m.domains.includes(d.id));
                            return (
                              <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                                <td style={{ ...tdS, textAlign: "center", fontFamily: T.h, fontWeight: 800, fontSize: 13, color: d.priorityScore >= 90 ? T.red : d.priorityScore >= 75 ? T.gold : T.dim }}>{d.priorityScore}</td>
                                <td style={{ ...tdS, fontWeight: 600, color: T.text }}>
                                  {d.domain}
                                  {d.fiverr && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, fontFamily: T.m, color: T.blue, background: T.blue + "18", padding: "1px 5px", borderRadius: 3 }}>FIVERR</span>}
                                </td>
                                <td style={{ ...tdS, fontSize: 10, color: T.accent }}>{d.approach || d.method?.split(".")[0] || "--"}</td>
                                <td style={{ ...tdS, textAlign: "center" }}>
                                  <select value={st} onChange={e => updateOutreachStatus(d.id, "status", e.target.value)}
                                    style={{ ...selS, color: statusColors[st], borderColor: statusColors[st] + "40" }}>
                                    <option value="NOT_STARTED">Not Started</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="DONE">Done</option>
                                    <option value="BLOCKED">Blocked</option>
                                  </select>
                                </td>
                                <td style={{ ...tdS, fontSize: 9, color: T.muted }}>{outreachEntry?.label || d.difficulty}</td>
                                <td style={{ ...tdS, textAlign: "right", fontFamily: T.m, fontSize: 10 }}>${(d.estCostLow/1000).toFixed(1)}K-${(d.estCostHigh/1000).toFixed(1)}K</td>
                                <td style={{ ...tdS, textAlign: "center" }}><DifficultyBadge d={d.difficulty} /></td>
                                <td style={{ ...tdS, fontSize: 10, color: T.dim, fontFamily: T.m }}>{outreachEntry?.timeline || "--"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* ═══ TAB: COST MODEL ═══ */}
        {nav === "cost" && (() => {
          const cmThS = { padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" };
          const cmTdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
          const retainerItems = [
            { service: "Authority Ring Intelligence", cost: "$2,000–$3,000", freq: "Monthly", desc: "Competitor backlink research, gap identification, domain verification" },
            { service: "AI Perception Monitoring", cost: "$1,500–$2,500", freq: "Monthly", desc: "Track ChatGPT/Gemini/Claude responses to buyer questions" },
            { service: "Question Bank Refresh", cost: "$500", freq: "Quarterly", desc: "Persona-driven question generation, not keyword-based" },
            { service: "Narrative Audit", cost: "$500", freq: "Quarterly", desc: "Flag content reinforcing post-signature bias" },
          ];
          const placementTiers = [
            { tier: "Quick Wins (Fiverr/Self-Publish)", count: stats.fiverrable, costEach: "$0–$500", total: `$0–$${(stats.fiverrable * 500).toLocaleString()}` },
            { tier: "Medium (PR/Sponsored)", count: DOMAINS.filter(d => d.difficulty === "medium" && d.sirionStatus === "verified_zero").length, costEach: "$2,500–$8,000", total: "$10K–$32K" },
            { tier: "High-Impact (HBR/Forbes/Bloomberg)", count: 3, costEach: "$5,000–$25,000", total: "$15K–$75K" },
            { tier: "Partner Co-Creation", count: DOMAINS.filter(d => d.category?.includes("Partner") || d.category?.includes("Big 4")).length, costEach: "$2,000–$12,000", total: "$12K–$72K" },
          ];
          const zeroDomains = DOMAINS.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore);
          return (
          <>
            {/* Insight Banner */}
            <InsightBanner color={T.gold}
              insight={<>Top 5 priority gaps ({insights.cost.top5Gaps.map(d => d.domain).join(", ")}) would cost <span style={{ fontWeight: 800, color: T.teal }}>${(insights.cost.top5CostLow / 1000).toFixed(0)}K-${(insights.cost.top5CostHigh / 1000).toFixed(0)}K</span> in placement spend. These domains serve <span style={{ fontWeight: 800 }}>{insights.cost.top5Personas.length}</span> buyer personas ({insights.cost.top5Personas.join(", ")}).</>}
              action={<>Recommended approach: start with quick wins ($0-$500 each) while negotiating high-impact placements. Monthly retainer of $4K-$6K covers research, monitoring, and strategy.</>}
            />

            {/* ── 90-DAY BUDGET RECOMMENDATION ── */}
            {(() => {
              const easyCount = zeroDomains.filter(d => d.difficulty === "easy" || d.fiverr).length;
              const medCount = zeroDomains.filter(d => d.difficulty === "medium" && !d.fiverr).length;
              const hardCount = zeroDomains.filter(d => d.difficulty === "hard" || d.difficulty === "very_hard").length;
              const qw90Cost = zeroDomains.filter(d => d.difficulty === "easy" || d.fiverr).reduce((s, d) => s + (d.estCostHigh || 0), 0);
              const med90Cost = zeroDomains.filter(d => d.difficulty === "medium" && !d.fiverr).slice(0, 3).reduce((s, d) => s + (d.estCostHigh || 0), 0);
              const total90Low = Math.round((zeroDomains.filter(d => d.difficulty === "easy" || d.fiverr).reduce((s, d) => s + (d.estCostLow || 0), 0) + zeroDomains.filter(d => d.difficulty === "medium" && !d.fiverr).slice(0, 3).reduce((s, d) => s + (d.estCostLow || 0), 0)) / 1000);
              const total90High = Math.round((qw90Cost + med90Cost) / 1000);
              const retainer90 = 15; // $5K/mo * 3
              return (
                <Panel glow={T.teal} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 9, fontFamily: T.m, letterSpacing: "0.12em", color: T.teal, fontWeight: 700 }}>RECOMMENDED 90-DAY BUDGET</span>
                    <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>Based on difficulty distribution + quick-win priority</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.green }}>{easyCount}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>QUICK WINS</div>
                      <div style={{ fontSize: 10, fontFamily: T.m, color: T.muted, marginTop: 1 }}>Month 1-2</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.gold }}>{Math.min(medCount, 3)}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>MEDIUM TARGETS</div>
                      <div style={{ fontSize: 10, fontFamily: T.m, color: T.muted, marginTop: 1 }}>Month 2-3</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.accent }}>${total90Low}K-${total90High}K</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>PLACEMENT SPEND</div>
                      <div style={{ fontSize: 10, fontFamily: T.m, color: T.muted, marginTop: 1 }}>90-day total</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.teal }}>${total90Low + retainer90}K-${total90High + retainer90}K</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>ALL-IN (incl. retainer)</div>
                      <div style={{ fontSize: 10, fontFamily: T.m, color: T.muted, marginTop: 1 }}>+$5K/mo retainer</div>
                    </div>
                  </div>
                </Panel>
              );
            })()}

            {/* ── COST BY PRIORITY TIER — Horizontal Bar Chart ── */}
            {(() => {
              const tiers = [
                { name: "Quick Wins", domains: zeroDomains.filter(d => d.difficulty === "easy" || d.fiverr), color: T.green },
                { name: "Medium", domains: zeroDomains.filter(d => d.difficulty === "medium" && !d.fiverr), color: T.gold },
                { name: "Hard", domains: zeroDomains.filter(d => d.difficulty === "hard"), color: T.orange },
                { name: "Very Hard", domains: zeroDomains.filter(d => d.difficulty === "very_hard"), color: T.red },
              ].filter(t => t.domains.length > 0).map(t => ({
                name: t.name,
                count: t.domains.length,
                costLow: Math.round(t.domains.reduce((s, d) => s + (d.estCostLow || 0), 0) / 1000),
                costHigh: Math.round(t.domains.reduce((s, d) => s + (d.estCostHigh || 0), 0) / 1000),
                fill: t.color,
                avgDA: Math.round(t.domains.reduce((s, d) => s + d.da, 0) / t.domains.length),
              }));
              return (
                <div style={{ marginBottom: 18 }}>
                  <Label color={T.dim}>COST DISTRIBUTION BY DIFFICULTY TIER</Label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: "14px 16px" }}>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, letterSpacing: "0.1em", marginBottom: 10 }}>COST RANGE ($K)</div>
                      <ResponsiveContainer width="100%" height={tiers.length * 44 + 10}>
                        <BarChart data={tiers} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 60 }}>
                          <XAxis type="number" tick={{ fill: T.dim, fontSize: 10, fontFamily: T.m }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: T.muted, fontSize: 10, fontFamily: T.m }} axisLine={false} tickLine={false} width={55} />
                          <Tooltip contentStyle={tipStyle} formatter={(v, n) => [`$${v}K`, n === "costLow" ? "Low Est." : "High Est."]} />
                          <Bar dataKey="costLow" fill={T.accent + "60"} radius={[0, 4, 4, 0]} barSize={14} name="Low Est." />
                          <Bar dataKey="costHigh" fill={T.accent} radius={[0, 4, 4, 0]} barSize={14} name="High Est." />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: "14px 16px" }}>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, letterSpacing: "0.1em", marginBottom: 10 }}>DOMAINS PER TIER</div>
                      <ResponsiveContainer width="100%" height={tiers.length * 44 + 10}>
                        <BarChart data={tiers} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 60 }}>
                          <XAxis type="number" tick={{ fill: T.dim, fontSize: 10, fontFamily: T.m }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: T.muted, fontSize: 10, fontFamily: T.m }} axisLine={false} tickLine={false} width={55} />
                          <Tooltip contentStyle={tipStyle} formatter={(v) => [v, "Domains"]} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                            {tiers.map((t, i) => <Cell key={i} fill={t.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── ROI PROJECTION ── */}
            {(() => {
              const top5 = insights.cost.top5Gaps;
              const top5DA = top5.map(d => d.da);
              const avgDA = top5DA.length ? Math.round(top5DA.reduce((a, b) => a + b, 0) / top5DA.length) : 0;
              const visibilityBoost = Math.round(top5.length * 3.2); // ~3.2 pts per high-DA domain
              const personasReached = insights.cost.top5Personas.length;
              return (
                <Panel glow={T.green} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 9, fontFamily: T.m, letterSpacing: "0.12em", color: T.green, fontWeight: 700 }}>ROI PROJECTION — TOP 5 GAPS</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.green }}>+{visibilityBoost}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>EST. VISIBILITY PTS</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.accent }}>{personasReached}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>PERSONAS REACHED</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.teal }}>{avgDA}</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>AVG DOMAIN AUTH</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: T.gold }}>${(insights.cost.top5CostLow / 1000).toFixed(0)}K-${(insights.cost.top5CostHigh / 1000).toFixed(0)}K</div>
                      <div style={{ fontSize: 9, fontFamily: T.m, color: T.dim, marginTop: 2 }}>COST FOR TOP 5</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10, color: T.muted, fontFamily: T.m, lineHeight: 1.5 }}>
                    Domains: {top5.map(d => d.domain).join(", ")}
                  </div>
                </Panel>
              );
            })()}

            <Label color={T.accent}>COST MODEL — XTRUSIO RETAINER vs OUTREACH SPEND</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Two separate line items: (1) Xtrusio software retainer for research, monitoring & strategy. (2) Actual outreach/placement spend per domain.
            </p>

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "MONTHLY RETAINER", value: "$4,000–$6,000", color: T.accent, sub: "Annual: $48K–$72K" },
                { label: "PLACEMENT BUDGET", value: "$37K–$179K", color: T.teal, sub: "Phased over 6-12 months" },
                { label: "TOTAL ANNUAL", value: "$85K–$251K", color: T.gold, sub: `${zeroDomains.length} zero-presence targets` },
              ].map(c => (
                <div key={c.label} style={{ background: T.surface, borderRadius: 8, padding: "14px 16px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontFamily: T.m, letterSpacing: "0.1em", color: T.dim, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: T.h, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 10, color: T.dim, fontFamily: T.m, marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* Retainer Table */}
            <Label color={T.accent}>XTRUSIO RETAINER SERVICES</Label>
            <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                <thead>
                  <tr>
                    <th style={{ ...cmThS }}>SERVICE</th>
                    <th style={{ ...cmThS }}>DESCRIPTION</th>
                    <th style={{ ...cmThS, width: 80, textAlign: "center" }}>FREQUENCY</th>
                    <th style={{ ...cmThS, width: 120, textAlign: "right" }}>COST</th>
                  </tr>
                </thead>
                <tbody>
                  {retainerItems.map((s, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.bg + "80" }}>
                      <td style={{ ...cmTdS, fontWeight: 600, color: T.text }}>{s.service}</td>
                      <td style={{ ...cmTdS, fontSize: 10, color: T.muted }}>{s.desc}</td>
                      <td style={{ ...cmTdS, textAlign: "center", fontSize: 10, fontFamily: T.m, color: T.dim }}>{s.freq}</td>
                      <td style={{ ...cmTdS, textAlign: "right", fontFamily: T.m, fontWeight: 700, color: T.accent }}>{s.cost}</td>
                    </tr>
                  ))}
                  <tr style={{ background: T.accent + "08" }}>
                    <td colSpan={3} style={{ ...cmTdS, fontWeight: 800, fontFamily: T.h, borderBottom: "none" }}>MONTHLY TOTAL</td>
                    <td style={{ ...cmTdS, textAlign: "right", fontWeight: 800, fontFamily: T.h, color: T.accent, fontSize: 13, borderBottom: "none" }}>$4,000–$6,000</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Placement Spend Table */}
            <Label color={T.teal}>OUTREACH PLACEMENT SPEND</Label>
            <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                <thead>
                  <tr>
                    <th style={{ ...cmThS }}>TIER</th>
                    <th style={{ ...cmThS, width: 70, textAlign: "center" }}>DOMAINS</th>
                    <th style={{ ...cmThS, width: 120, textAlign: "right" }}>COST / EACH</th>
                    <th style={{ ...cmThS, width: 120, textAlign: "right" }}>TOTAL RANGE</th>
                  </tr>
                </thead>
                <tbody>
                  {placementTiers.map((t, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.bg + "80" }}>
                      <td style={{ ...cmTdS, fontWeight: 600, color: T.text }}>{t.tier}</td>
                      <td style={{ ...cmTdS, textAlign: "center", fontFamily: T.m, fontWeight: 700 }}>{t.count}</td>
                      <td style={{ ...cmTdS, textAlign: "right", fontFamily: T.m, color: T.dim }}>{t.costEach}</td>
                      <td style={{ ...cmTdS, textAlign: "right", fontFamily: T.m, fontWeight: 700, color: T.teal }}>{t.total}</td>
                    </tr>
                  ))}
                  <tr style={{ background: T.teal + "08" }}>
                    <td colSpan={3} style={{ ...cmTdS, fontWeight: 800, fontFamily: T.h, borderBottom: "none" }}>TOTAL PLACEMENT BUDGET</td>
                    <td style={{ ...cmTdS, textAlign: "right", fontWeight: 800, fontFamily: T.h, color: T.teal, fontSize: 13, borderBottom: "none" }}>$37K–$179K</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Per-Domain Cost Table */}
            <Label color={T.dim}>COST BY DOMAIN — ZERO-PRESENCE TARGETS ({zeroDomains.length})</Label>
            <p style={{ fontSize: 10, color: T.dim, marginBottom: 8 }}>Sorted by priority score. These are domains where Sirion has zero presence and needs placement.</p>
            <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface, minWidth: 700 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...cmThS, width: 55, textAlign: "center" }}>SCORE</th>
                    <th style={{ ...cmThS }}>DOMAIN</th>
                    <th style={{ ...cmThS, width: 44, textAlign: "center" }}>DA</th>
                    <th style={{ ...cmThS }}>CATEGORY</th>
                    <th style={{ ...cmThS }}>METHOD</th>
                    <th style={{ ...cmThS, width: 110, textAlign: "right" }}>COST RANGE</th>
                    <th style={{ ...cmThS, width: 65, textAlign: "center" }}>DIFF</th>
                    <th style={{ ...cmThS, width: 90, textAlign: "center" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroDomains.map((d, idx) => {
                    const tracked = outreachTracker[d.id]?.status && outreachTracker[d.id].status !== "NOT_STARTED";
                    return (
                    <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                      <td style={{ ...cmTdS, textAlign: "center", fontFamily: T.h, fontWeight: 800, color: d.priorityScore >= 90 ? T.red : d.priorityScore >= 75 ? T.gold : T.dim }}>{d.priorityScore}</td>
                      <td style={{ ...cmTdS, fontWeight: 600, color: T.text }}>
                        {d.domain}
                        {d.fiverr && <span style={{ marginLeft: 6, fontSize: 8, padding: "1px 5px", borderRadius: 3, background: T.green + "22", color: T.green, fontFamily: T.m, fontWeight: 700 }}>FIVERR</span>}
                      </td>
                      <td style={{ ...cmTdS, textAlign: "center", fontFamily: T.m, fontWeight: 600, color: d.da >= 85 ? T.green : T.muted }}>{d.da}</td>
                      <td style={{ ...cmTdS, fontSize: 10, color: T.muted }}>{d.category}</td>
                      <td style={{ ...cmTdS, fontSize: 10, color: T.accent }}>{d.approach || "--"}</td>
                      <td style={{ ...cmTdS, textAlign: "right", fontFamily: T.m, fontWeight: 600, color: T.text }}>${(d.estCostLow / 1000).toFixed(1)}K–${(d.estCostHigh / 1000).toFixed(1)}K</td>
                      <td style={{ ...cmTdS, textAlign: "center" }}><DifficultyBadge d={d.difficulty} /></td>
                      <td style={{ ...cmTdS, textAlign: "center" }}>
                        {tracked ? (
                          <span style={{ fontSize: 9, fontFamily: T.m, color: T.green, fontWeight: 700 }}>TRACKED</span>
                        ) : (
                          <button onClick={() => { setNav("outreach"); setOutreachFilter("all"); }}
                            style={{ fontSize: 9, fontFamily: T.m, fontWeight: 700, color: T.accent, background: T.accentDim, border: `1px solid ${T.borderActive}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Add to Outreach
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
          );
        })()}

        {/* ═══ TAB: PERSONA MAP ═══ */}
        {nav === "persona" && (
          <>
            {/* Insight Banner */}
            {insights.persona.weakest && insights.persona.strongest && (
              <InsightBanner color={T.accent}
                insight={<><span style={{ fontWeight: 800, color: insights.persona.strongest.color }}>{insights.persona.strongest.id}</span> coverage is {insights.persona.strongest.pct}% (strongest). <span style={{ fontWeight: 800, color: T.red }}>{insights.persona.weakest.id}</span> coverage is only {insights.persona.weakest.pct}% — {insights.persona.weakest.present}/{insights.persona.weakest.total} domains covered.</>}
                action={<>Prioritize {insights.persona.weakest.label}-relevant domains{insights.persona.weakest.topUncovered.length > 0 && <>: {insights.persona.weakest.topUncovered.map((d, i) => <span key={d.id}>{i > 0 && ", "}<span style={{ color: T.text }}>{d.domain}</span> (DA {d.da})</span>)}</>} to improve the weakest persona coverage.</>}
              />
            )}

            <Label color={T.accent}>BUYER PERSONA → DOMAIN INFLUENCE MAP</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Which domains matter most for each decision-maker. Coverage = % of persona-relevant domains where Sirion has presence. Target: 50%.</p>

            {/* Summary Grid */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${PERSONAS.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
              {PERSONAS.map(p => {
                const doms = DOMAINS.filter(d => d.buyerPersonas?.includes(p.id));
                const present = doms.filter(d => d.sirionStatus !== "verified_zero").length;
                const pct = doms.length ? Math.round((present / doms.length) * 100) : 0;
                const targetPct = 50;
                const topUncovered = doms.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 2);
                return (
                  <Panel key={p.id} glow={p.color} style={{ padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{p.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: p.color, fontFamily: T.h, marginBottom: 2 }}>{p.id}</div>
                    <div style={{ fontSize: 9, color: T.dim, fontFamily: T.m, marginBottom: 8 }}>{p.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: T.h, color: pct >= 60 ? T.green : pct >= 30 ? T.gold : T.red }}>{pct}%</div>
                    {/* Progress bar with 50% target marker */}
                    <div style={{ height: 4, borderRadius: 2, background: T.border, marginTop: 6, overflow: "visible", position: "relative" }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 2, background: pct >= 60 ? T.green : pct >= 30 ? T.gold : T.red, transition: "width 0.3s" }} />
                      <div style={{ position: "absolute", left: `${targetPct}%`, top: -2, width: 1, height: 8, background: T.text, opacity: 0.5 }} />
                      <div style={{ position: "absolute", left: `${targetPct}%`, top: -10, transform: "translateX(-50%)", fontSize: 7, fontFamily: T.m, color: T.dim }}>50%</div>
                    </div>
                    <div style={{ fontSize: 9, color: T.dim, fontFamily: T.m, marginTop: 6 }}>{present}/{doms.length} covered</div>
                    {/* Top action */}
                    {topUncovered.length > 0 && (
                      <div style={{ marginTop: 8, padding: "5px 6px", borderRadius: 5, background: T.bg, border: `1px solid ${T.border}`, fontSize: 9, color: T.muted, lineHeight: 1.3, textAlign: "left" }}>
                        Publish on <span style={{ color: T.text, fontWeight: 600 }}>{topUncovered.map(d => d.domain).join(", ")}</span> to reach {Math.round(((present + topUncovered.length) / doms.length) * 100)}%
                      </div>
                    )}
                  </Panel>
                );
              })}
            </div>

            {/* ── CROSS-PERSONA PRIORITY — Domains serving multiple personas ── */}
            {(() => {
              const multiPersonaDomains = DOMAINS
                .filter(d => d.sirionStatus === "verified_zero" && d.buyerPersonas && d.buyerPersonas.length >= 2)
                .sort((a, b) => b.buyerPersonas.length - a.buyerPersonas.length || b.priorityScore - a.priorityScore);
              if (multiPersonaDomains.length === 0) return null;
              return (
                <div style={{ marginBottom: 18 }}>
                  <Label color={T.teal}>CROSS-PERSONA PRIORITY — HIGHEST ROI DOMAINS</Label>
                  <p style={{ fontSize: 10, color: T.dim, marginBottom: 8 }}>Zero-presence domains that serve 2+ personas. Closing these gaps gives the most coverage per dollar spent.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {multiPersonaDomains.slice(0, 6).map(d => (
                      <Panel key={d.id} glow={T.teal} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.h }}>{d.domain}</span>
                          <span style={{ fontSize: 10, fontFamily: T.m, color: T.dim }}>DA {d.da} · Score {d.priorityScore}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                          {d.buyerPersonas.map(pid => {
                            const persona = PERSONAS.find(p => p.id === pid);
                            return <Chip key={pid} text={pid} color={persona?.color || T.accent} small />;
                          })}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>{d.approach}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, fontFamily: T.m, color: T.dim }}>${(d.estCostLow / 1000).toFixed(1)}K-${(d.estCostHigh / 1000).toFixed(1)}K · <DifficultyBadge d={d.difficulty} /></span>
                          <button onClick={() => { setNav("outreach"); setOutreachFilter("all"); }}
                            style={{ fontSize: 9, fontFamily: T.m, fontWeight: 700, color: T.teal, background: T.teal + "12", border: `1px solid ${T.teal}25`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                            Close Gap
                          </button>
                        </div>
                      </Panel>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Per-Persona Domain Tables */}
            {PERSONAS.map(p => {
              const doms = DOMAINS.filter(d => d.buyerPersonas?.includes(p.id)).sort((a, b) => b.priorityScore - a.priorityScore);
              const present = doms.filter(d => d.sirionStatus !== "verified_zero").length;
              const pct = doms.length ? Math.round((present / doms.length) * 100) : 0;
              const thS = { padding: "6px 10px", fontSize: 10, fontWeight: 700, fontFamily: T.m, letterSpacing: "0.05em", color: T.dim, borderBottom: `2px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" };
              const tdS = { padding: "7px 10px", fontSize: 11, fontFamily: T.b, borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
              return (
                <div key={p.id} style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${p.color}15`, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", background: p.color + "08", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.color, fontFamily: T.h }}>{p.label}</span>
                    <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>({p.id})</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: T.m, fontWeight: 700, color: pct >= 60 ? T.green : pct >= 30 ? T.gold : T.red }}>{pct}% coverage</span>
                    <span style={{ fontSize: 10, fontFamily: T.m, color: T.dim }}>{present}/{doms.length}</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface }}>
                    <thead>
                      <tr>
                        <th style={{ ...thS }}>DOMAIN</th>
                        <th style={{ ...thS, width: 70, textAlign: "center" }}>STATUS</th>
                        <th style={{ ...thS, width: 44, textAlign: "center" }}>DA</th>
                        <th style={{ ...thS, width: 55, textAlign: "center" }}>SCORE</th>
                        <th style={{ ...thS }}>CATEGORY</th>
                        <th style={{ ...thS }}>CONTENT NEEDED</th>
                        <th style={{ ...thS, width: 65, textAlign: "center" }}>DIFF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doms.map((d, idx) => (
                        <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : T.bg + "80" }}>
                          <td style={{ ...tdS, fontWeight: 600, color: T.text }}>{d.domain}</td>
                          <td style={{ ...tdS, textAlign: "center" }}><StatusBadge status={d.sirionStatus} /></td>
                          <td style={{ ...tdS, textAlign: "center", fontFamily: T.m, fontWeight: 600, color: d.da >= 85 ? T.green : T.muted }}>{d.da}</td>
                          <td style={{ ...tdS, textAlign: "center", fontFamily: T.h, fontWeight: 800, color: d.priorityScore >= 90 ? T.red : d.priorityScore >= 75 ? T.gold : T.dim }}>{d.priorityScore}</td>
                          <td style={{ ...tdS, fontSize: 10, color: T.muted }}>{d.category}</td>
                          <td style={{ ...tdS, fontSize: 10, color: T.accent }}>{d.approach || "--"}</td>
                          <td style={{ ...tdS, textAlign: "center" }}><DifficultyBadge d={d.difficulty} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, textAlign: "center" }}>
        <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim, letterSpacing: "0.1em" }}>
          AUTHORITY RING · {DOMAINS.length} DOMAINS VERIFIED · {stats.zeros} GAPS IDENTIFIED · LAST VERIFIED 2026-02-18
          {perceptionData && ` · PERCEPTION INTEL ACTIVE (${perceptionData.scores?.overall}/100)`}
        </span>
      </div>
    </div>
  );
}
