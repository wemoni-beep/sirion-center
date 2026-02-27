import { useState, useMemo, useCallback, useEffect } from "react";
import { FONT } from "./typography";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Cell, Treemap, CartesianGrid } from "recharts";
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { buildExportPayload } from "./scanEngine";
import { db } from "./firebase";

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
  const [view, setView] = useState("list");

  // ═══ M2→M3 BRIDGE: Auto-load perception data ═══
  const [perceptionData, setPerceptionData] = useState(null);
  const [perceptionImportText, setPerceptionImportText] = useState("");
  const [perceptionStatus, setPerceptionStatus] = useState(null);
  const [pipelineM2Loaded, setPipelineM2Loaded] = useState(false);
  const [aiCitedDomains, setAiCitedDomains] = useState([]);

  // Auto-load M2 perception data from pipeline (exportPayload OR fallback to scanResults)
  useEffect(() => {
    if (pipelineM2Loaded) return;

    // Priority 1: exportPayload already built by M2
    if (pipeline.m2.exportPayload) {
      setPerceptionData(pipeline.m2.exportPayload);
      setPipelineM2Loaded(true);
      setPerceptionStatus({ type: "success", msg: `Auto-loaded perception data from M2 (${pipeline.m2.scores?.overall || 0}/100 overall score).` });
      return;
    }

    // Priority 2: Fallback — construct perception data from raw scanResults
    const rawSR = pipeline.m2.scanResults;
    const srResults = rawSR?.results;
    // Normalize: Firebase may store arrays as objects with numeric keys
    const srArr = Array.isArray(srResults) ? srResults : (srResults && typeof srResults === "object" ? Object.values(srResults) : []);
    if (srArr.length > 0) {
      try {
        // Normalize the scanResults before passing to buildExportPayload
        const normalizedSR = {
          ...rawSR,
          results: srArr,
          llms: Array.isArray(rawSR.llms) ? rawSR.llms : (rawSR.llms && typeof rawSR.llms === "object" ? Object.values(rawSR.llms) : []),
        };
        const payload = buildExportPayload(normalizedSR);
        setPerceptionData(payload);
        setPipelineM2Loaded(true);
        // Also save the constructed payload back to pipeline so M3 doesn't rebuild next time
        updateModule("m2", { exportPayload: payload });
        setPerceptionStatus({ type: "success", msg: `Auto-constructed perception data from ${srArr.length} scan results (${pipeline.m2.scores?.overall || 0}/100).` });
      } catch (e) {
        console.warn("[M3] Failed to build perception data from scanResults:", e);
      }
    }
  }, [pipeline.m2.exportPayload, pipeline.m2.scanResults, pipelineM2Loaded]);

  // Cross-reference AI-cited domains with Authority Ring domain list
  useEffect(() => {
    const scanResults = pipeline.m2.scanResults;
    // Normalize results: Firebase may store arrays as objects with numeric keys
    const rawResults = scanResults?.results;
    const resultsArr = Array.isArray(rawResults) ? rawResults : (rawResults && typeof rawResults === "object" ? Object.values(rawResults) : []);
    const llmsArr = Array.isArray(scanResults?.llms) ? scanResults.llms : (scanResults?.llms && typeof scanResults.llms === "object" ? Object.values(scanResults.llms) : []);
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
    const weakPersonas = perceptionData?.personaBreakdown?.filter(p => p.mentionRate < 70).map(p => p.persona) || [];
    const weakStages = perceptionData?.stageBreakdown?.filter(s => s.mentionRate < 70).map(s => s.stage.toLowerCase()) || [];
    const weakest = perceptionData?.personaBreakdown?.length > 0 ? perceptionData.personaBreakdown.reduce((a, b) => a.mentionRate < b.mentionRate ? a : b) : null;

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
        (perceptionData.allContentGaps || []).forEach(gap => {
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

  const filtered = useMemo(() => {
    let d = [...enhancedDomains];
    if (filterStatus) d = d.filter(x => x.sirionStatus === filterStatus);
    if (filterCategory) d = d.filter(x => x.category === filterCategory);
    if (filterPersona) d = d.filter(x => x.buyerPersonas?.includes(filterPersona));
    const sortKey = perceptionData && sortBy === "priorityScore" ? "enhancedPriority" : sortBy;
    d.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    return d;
  }, [filterStatus, filterCategory, filterPersona, sortBy, enhancedDomains, perceptionData]);

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
      analyzedAt: new Date().toISOString(),
    };
    updateModule("m3", m3Data);

    // Hard save M3 state to Firebase (fire-and-forget)
    db.saveWithId("m3_authority_ring", "latest", {
      ...m3Data,
      allDomains: enhancedDomains.map(d => ({
        id: d.id, domain: d.domain, da: d.da, status: d.sirionStatus,
        priority: d.enhancedPriority || d.priorityScore,
        aiCitations: d.aiCitations || 0,
        category: d.category,
      })),
      savedAt: new Date().toISOString(),
    }).catch(e => console.warn("[M3] Firebase save failed:", e));
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
              <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m, marginLeft: 10, marginRight: 4 }}>SORT:</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontSize: 11, fontFamily: T.m, background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, padding: "4px 8px" }}>
                <option value="priorityScore">Priority Score</option>
                <option value="da">Domain Authority</option>
                <option value="aiCitationWeight">AI Citation Weight</option>
                <option value="estCostLow">Cost (Low→High)</option>
              </select>
            </div>

            {/* Domain List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map(d => (
                <Panel key={d.id} onClick={() => setSelectedDomain(selectedDomain === d.id ? null : d.id)} active={selectedDomain === d.id}
                  style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Priority Score */}
                    <div style={{ position: "relative", width: 38, height: 38, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, fontFamily: T.h, color: (d.enhancedPriority || d.priorityScore) >= 90 ? T.red : (d.enhancedPriority || d.priorityScore) >= 75 ? T.gold : T.dim, background: (d.enhancedPriority || d.priorityScore) >= 90 ? "rgba(248,113,113,0.08)" : (d.enhancedPriority || d.priorityScore) >= 75 ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${(d.enhancedPriority || d.priorityScore) >= 90 ? "rgba(248,113,113,0.15)" : (d.enhancedPriority || d.priorityScore) >= 75 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)"}`, flexShrink: 0 }}>
                      {d.enhancedPriority || d.priorityScore}
                      {d.perceptionBoost > 0 && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 11, fontWeight: 800, color: "#000", background: T.teal, borderRadius: 6, padding: "1px 3px", fontFamily: T.m }}>+{d.perceptionBoost}</span>}
                    </div>

                    {/* Domain Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.b }}>{d.domain}</span>
                        <StatusBadge status={d.sirionStatus} />
                        <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>DA {d.da}</span>
                        <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>AI {d.aiCitationWeight}</span>
                        {d.icertisPresent && (
                          d.sirionStatus === "verified_zero"
                            ? <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.m, color: "#fff", background: "linear-gradient(135deg, #DC2626, #EA580C)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>ICERTIS PRESENT</span>
                            : <span style={{ fontSize: 11, color: T.red, fontFamily: T.m, opacity: 0.7 }}>ICERTIS ✓</span>
                        )}
                        {d.aiCitations > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.m, color: "#000", background: "linear-gradient(135deg, #22D3EE, #3B82F6)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>AI CITED ×{d.aiCitations}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
                        <span style={{ color: T.dim }}>{d.category}</span>
                        {d.approach && <span style={{ color: T.accent, marginLeft: 8 }}>→ {d.approach}</span>}
                      </div>
                    </div>

                    {/* Cost + Difficulty */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontFamily: T.m, color: T.text }}>${(d.estCostLow/1000).toFixed(1)}K–${(d.estCostHigh/1000).toFixed(1)}K</div>
                      <DifficultyBadge d={d.difficulty} />
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {selectedDomain === d.id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
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
                              {d.searchQueries?.map((q, i) => <div key={i} style={{ marginBottom: 2 }}>→ {q}</div>)}
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

                      {/* Perception Intelligence (when M2 data is imported) */}
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

                      {/* AI Citation Intelligence (cross-referenced from M2 scan results) */}
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
                  )}
                </Panel>
              ))}
            </div>
          </>
        )}

        {/* ═══ TAB: PERCEPTION INTEL (M2→M3 Bridge) ═══ */}
        {nav === "perception" && (
          <>
            <Label color={T.teal}>PERCEPTION INTELLIGENCE — M2→M3 AUTO-BRIDGE</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
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

                {/* Persona Weakness → Domain Mapping */}
                <Panel glow={T.accent} style={{ marginBottom: 16 }}>
                  <Label color={T.accent}>WEAK PERSONAS → PRIORITY DOMAINS</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
                    Personas with {"<"}70% AI mention rate need the most authority building. Domains below directly serve these weak personas.
                  </p>
                  {(perceptionData.personaBreakdown || [])
                    .sort((a, b) => a.mentionRate - b.mentionRate)
                    .map(p => {
                      const domainsForPersona = enhancedDomains
                        .filter(d => (d.buyerPersonas || []).includes(p.persona) && d.sirionStatus === "verified_zero")
                        .sort((a, b) => (b.enhancedPriority || b.priorityScore) - (a.enhancedPriority || a.priorityScore))
                        .slice(0, 5);
                      const isWeak = p.mentionRate < 70;
                      return (
                        <div key={p.persona} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isWeak ? T.red : T.green, fontFamily: T.h }}>{p.persona}</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: isWeak ? T.red : T.green, fontFamily: T.m }}>{p.mentionRate}%</span>
                            <span style={{ fontSize: 11, color: T.dim }}>{p.total} queries</span>
                            {isWeak && <Chip text="PRIORITY" color={T.red} small />}
                          </div>
                          {isWeak && domainsForPersona.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 8 }}>
                              {domainsForPersona.map(d => (
                                <div key={d.id} style={{ padding: "4px 8px", borderRadius: 6, background: T.surface, border: `1px solid ${T.red}15`, fontSize: 11 }}>
                                  <span style={{ fontWeight: 600, fontFamily: T.m }}>{d.domain}</span>
                                  <span style={{ fontSize: 11, color: T.dim, marginLeft: 4 }}>DA {d.da}</span>
                                  <DifficultyBadge d={d.difficulty} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </Panel>

                {/* Stage Weakness → Domain Mapping */}
                <Panel glow={T.gold} style={{ marginBottom: 16 }}>
                  <Label color={T.gold}>WEAK STAGES → CONTENT TYPE NEEDED</Label>
                  {(perceptionData.stageBreakdown || [])
                    .sort((a, b) => a.mentionRate - b.mentionRate)
                    .map(s => {
                      const stageConfig = STAGES.find(st => st.label.toLowerCase() === s.stage.toLowerCase());
                      const isWeak = s.mentionRate < 70;
                      return (
                        <div key={s.stage} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isWeak ? T.gold : T.green }}>{s.stage}</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: isWeak ? T.gold : T.green, fontFamily: T.m }}>{s.mentionRate}%</span>
                            {isWeak && stageConfig && (
                              <span style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>Needs: {stageConfig.contentNeeded}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </Panel>

                {/* Priority Content Gaps → Domain Recommendations */}
                <Panel glow={T.red} style={{ marginBottom: 16 }}>
                  <Label color={T.red}>TOP CONTENT GAPS → DOMAIN MATCHES</Label>
                  <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                    Content gaps identified by the Perception Monitor, matched to domains that can address them.
                  </p>
                  {(perceptionData.allContentGaps || []).slice(0, 10).map((gap, i) => {
                    const matchingDoms = enhancedDomains.filter(d =>
                      (d.matchingGaps || []).includes(gap)
                    ).slice(0, 3);
                    return (
                      <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, fontSize: 11, color: T.muted }}>{gap}</div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {matchingDoms.length > 0
                            ? matchingDoms.map(d => <Chip key={d.id} text={d.domain} color={T.teal} small />)
                            : <span style={{ fontSize: 11, color: T.dim, fontFamily: T.m }}>No direct match</span>
                          }
                        </div>
                      </div>
                    );
                  })}
                </Panel>

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
            <Label color={T.accent}>AUTHORITY GAP MATRIX — SIRION vs ICERTIS</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>Domains where Icertis has presence but Sirion doesn't. These are the gaps driving AI citation losses.</p>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <Panel glow={T.red}>
                <Label color={T.red}>ICERTIS HAS, SIRION DOESN'T</Label>
                {DOMAINS.filter(d => d.sirionStatus === "verified_zero" && d.icertisPresent).map(d => (
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
                {DOMAINS.filter(d => d.sirionStatus === "verified_zero" && !d.icertisPresent).map(d => (
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
            {DOMAINS.filter(d => d.narrativeGap).map(d => (
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
        )}

        {/* ═══ TAB: OUTREACH PLAN ═══ */}
        {nav === "outreach" && (
          <>
            <Label color={T.accent}>OUTREACH EXECUTION PLAN</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Prioritized by impact. Grouped by execution method so you can batch similar outreach together.</p>

            {Object.entries(OUTREACH_METHODS).map(([key, method]) => {
              const matchingDomains = DOMAINS.filter(d => method.domains.includes(d.id));
              if (matchingDomains.length === 0) return null;
              return (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{method.label}</span>
                    <span style={{ fontSize: 11, fontFamily: T.m, color: T.accent }}>{method.costRange}</span>
                    <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>{method.timeline}</span>
                    <Chip text={method.quality.toUpperCase()} color={method.quality.includes("high") ? T.green : T.gold} small />
                  </div>
                  {matchingDomains.sort((a, b) => b.priorityScore - a.priorityScore).map(d => (
                    <Panel key={d.id} style={{ padding: "10px 14px", marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.m, color: d.priorityScore >= 90 ? T.red : T.text }}>{d.priorityScore}</span>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{d.domain}</span>
                          <StatusBadge status={d.sirionStatus} />
                        </div>
                        <div style={{ fontSize: 11, fontFamily: T.m, color: T.accent }}>${(d.estCostLow/1000).toFixed(1)}K–${(d.estCostHigh/1000).toFixed(1)}K</div>
                      </div>
                      <p style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{d.method}</p>
                    </Panel>
                  ))}
                </div>
              );
            })}
          </>
        )}

        {/* ═══ TAB: COST MODEL ═══ */}
        {nav === "cost" && (
          <>
            <Label color={T.accent}>COST MODEL — XTRUSIO RETAINER vs OUTREACH SPEND</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Two separate line items: (1) Xtrusio software retainer for research, monitoring & strategy. (2) Actual outreach/placement spend per domain.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <Panel glow={T.accent} style={{ borderLeft: `3px solid ${T.accent}` }}>
                <Label color={T.accent}>XTRUSIO RETAINER (MONTHLY)</Label>
                <div style={{ marginBottom: 12 }}>
                  {[
                    { service: "Authority Ring Intelligence", cost: "$2,000–$3,000", desc: "Competitor backlink research, gap identification, domain verification" },
                    { service: "AI Perception Monitoring", cost: "$1,500–$2,500", desc: "Track ChatGPT/Gemini/Claude responses to buyer questions" },
                    { service: "Question Bank Refresh", cost: "$500/quarter", desc: "Persona-driven question generation, not keyword-based" },
                    { service: "Narrative Audit", cost: "$500/quarter", desc: "Flag content reinforcing post-signature bias" },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{s.service}</span>
                        <span style={{ fontSize: 11, fontFamily: T.m, color: T.accent }}>{s.cost}</span>
                      </div>
                      <p style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{s.desc}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 0", borderTop: `2px solid ${T.accent}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.h }}>Monthly Retainer</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.h, color: T.accent }}>$4,000–$6,000</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.dim }}>Annual</span>
                    <span style={{ fontSize: 11, fontFamily: T.m, color: T.accent }}>$48K–$72K</span>
                  </div>
                </div>
              </Panel>

              <Panel glow={T.teal} style={{ borderLeft: `3px solid ${T.teal}` }}>
                <Label color={T.teal}>OUTREACH PLACEMENT SPEND</Label>
                <div style={{ marginBottom: 12 }}>
                  {[
                    { tier: "Quick Wins (Fiverr/Self-Publish)", count: stats.fiverrable, costRange: "$0–$500 each", total: `$0–$${(stats.fiverrable * 500).toLocaleString()}` },
                    { tier: "Medium (PR/Sponsored)", count: DOMAINS.filter(d => d.difficulty === "medium" && d.sirionStatus === "verified_zero").length, costRange: "$2,500–$8,000 each", total: "$10K–$32K" },
                    { tier: "High-Impact (HBR/Forbes/Bloomberg)", count: 3, costRange: "$5,000–$25,000 each", total: "$15K–$75K" },
                    { tier: "Partner Co-Creation", count: DOMAINS.filter(d => d.category?.includes("Partner") || d.category?.includes("Big 4")).length, costRange: "$2,000–$12,000 each", total: "$12K–$72K" },
                  ].map((t, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{t.tier}</span>
                        <span style={{ fontSize: 11, fontFamily: T.m, color: T.teal }}>{t.total}</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{t.count} domains · {t.costRange}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 0", borderTop: `2px solid ${T.teal}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.h }}>Total Placement Budget</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.h, color: T.teal }}>$37K–$179K</span>
                  </div>
                  <p style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Phased over 6-12 months. Not all at once. Quick wins first.</p>
                </div>
              </Panel>
            </div>

            {/* Bar Chart — Cost by Domain */}
            <Label color={T.dim}>COST BY DOMAIN (ZERO-PRESENCE TARGETS)</Label>
            <Panel style={{ padding: "14px", marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={DOMAINS.filter(d => d.sirionStatus === "verified_zero").sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 12).map(d => ({ name: d.domain.replace(".com", "").replace(".org", ""), low: d.estCostLow / 1000, high: (d.estCostHigh - d.estCostLow) / 1000, priority: d.priorityScore }))} margin={{ top: 5, right: 5, bottom: 40, left: 5 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.dim, fontFamily: T.m }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: T.dim, fontFamily: T.m }} tickFormatter={v => `$${v}K`} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => `$${v.toFixed(1)}K`} />
                  <Bar dataKey="low" stackId="cost" fill={T.accent} radius={[0, 0, 0, 0]} name="Base Cost" />
                  <Bar dataKey="high" stackId="cost" fill="rgba(167,139,250,0.3)" radius={[4, 4, 0, 0]} name="Upper Range" />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </>
        )}

        {/* ═══ TAB: PERSONA MAP ═══ */}
        {nav === "persona" && (
          <>
            <Label color={T.accent}>BUYER PERSONA → DOMAIN INFLUENCE MAP</Label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Which domains matter most for each decision-maker. Used to prioritize outreach by target persona.</p>

            {PERSONAS.map(p => (
              <Panel key={p.id} style={{ marginBottom: 12, padding: "14px 18px" }} glow={p.color}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: p.color, fontFamily: T.h }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontFamily: T.m, color: T.dim }}>({p.id})</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DOMAINS.filter(d => d.buyerPersonas?.includes(p.id)).sort((a, b) => b.priorityScore - a.priorityScore).map(d => (
                    <div key={d.id} style={{ padding: "6px 10px", background: T.surface, borderRadius: 8, border: `1px solid ${d.sirionStatus === "verified_zero" ? "rgba(248,113,113,0.15)" : d.sirionStatus === "verified_present" ? "rgba(251,191,36,0.15)" : "rgba(52,211,153,0.15)"}`, fontSize: 11 }}>
                      <span style={{ fontWeight: 600 }}>{d.domain}</span>
                      <span style={{ marginLeft: 6 }}><StatusBadge status={d.sirionStatus} /></span>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
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
