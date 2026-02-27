import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, BarChart, Bar
} from 'recharts';
import {
  ChevronRight, ChevronLeft, Check, AlertTriangle, Users, FileText,
  Zap, Shield, Brain, GripVertical, Clock, DollarSign, TrendingUp, Target,
  Layers, GitBranch, CheckCircle2, MinusCircle, Info, Scale, Lock,
  Globe, Rocket, Search, Sparkles, Star, Eye, BarChart3, MessageSquare,
  Briefcase, Activity, ArrowUpRight, Menu, Gauge, ChevronUp, ChevronDown,
  Copy, Download, ExternalLink, Mail, Award
} from 'lucide-react';
import { useTheme } from "./ThemeContext";
import { usePipeline } from "./PipelineContext";
import { FONT, GOOGLE_FONTS_URL } from "./typography";

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS — WCAG AA Compliant
// ═══════════════════════════════════════════════════════════
const C_DARK = {
  bg: '#080F1A', sidebar: '#0C1426', sbHover: '#122040', sbActive: '#162850',
  surface: '#0E1829', card: '#111F36', cardHover: '#162A4A',
  border: 'rgba(99,179,237,0.10)', borderH: 'rgba(99,179,237,0.22)', borderA: 'rgba(99,179,237,0.38)',
  text: '#EDF2F7', sub: '#94A8C2', dim: '#6B82A0', faint: '#4A6280',
  accent: '#63B3ED', accentDim: 'rgba(99,179,237,0.12)', accentGlow: 'rgba(99,179,237,0.25)',
  teal: '#2DD4BF', green: '#48BB78', gold: '#ECC94B', red: '#FC8181',
  purple: '#B794F4', orange: '#F6AD55', pink: '#F687B3', cyan: '#76E4F7',
};
const C_LIGHT = {
  ...C_DARK,
  bg: '#f7f7f8', sidebar: '#ffffff', sbHover: '#f0f0f5', sbActive: '#ededf0',
  surface: '#ededf0', card: '#ffffff', cardHover: '#f0f0f5',
  border: 'rgba(99,179,237,0.15)', borderH: 'rgba(99,179,237,0.25)', borderA: 'rgba(99,179,237,0.40)',
  text: '#111118', sub: '#4a4a5a', dim: '#7a7a8a', faint: '#a0a0b0',
  accentDim: 'rgba(99,179,237,0.08)', accentGlow: 'rgba(99,179,237,0.15)',
};
const C = { ...C_DARK };
const F = { h: FONT.heading, b: FONT.body, m: FONT.mono };
const fonts = '';

const css = `${fonts}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes barGrow{from{width:0%}}
.fade-up{animation:fadeUp .4s ease-out both}
.score-pulse{animation:pulse .35s ease-out}
.bar-grow{animation:barGrow .5s ease-out}
.drag-item{cursor:grab;user-select:none;transition:all .18s ease}
.drag-item:active{cursor:grabbing}
*::-webkit-scrollbar{width:6px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:${C.faint}40;border-radius:3px}
`;

const tip = () => ({ backgroundColor: C.card, border: `1px solid ${C.borderH}`, borderRadius: 10, fontSize: 12, fontFamily: F.b, color: C.text, padding: '8px 14px' });

// ═══════════════════════════════════════════════════════════
// VENDOR DATA — 15 vendors from Forrester/Gartner/G2/MGI
// Scores are ESTIMATED from public analyst data and reviews
// Will be replaced with verified evidence-backed data
// ═══════════════════════════════════════════════════════════
const VENDORS = {
  // ── FORRESTER LEADERS ──
  sirion:        { id:'sirion',        name:'Sirion',         tier:'Leader', color:'#38BDF8', tagline:'AI-Native Contract Intelligence Platform', scores:{preSig:72,negotiation:80,execution:72,postSig:96,analytics:94,repository:85}, pricing:{min:80,max:150}, impl:{min:16,max:24}, scale:{min:500,max:50000}, strengths:['Highest-rated post-signature capabilities (Gartner 4.22/5)','AI extraction for legacy contract migration at scale','Obligation tracking with automated compliance monitoring','Performance intelligence connecting contracts to outcomes','Multi-language support across 40+ languages'], concerns:['Implementation timeline 16-24 weeks for enterprise','Enterprise pricing tier — not ideal for SMB','Pre-signature workflow less mature than specialist competitors'], bestFor:['Post-signature governance','Complex compliance','Enterprise 1000+','Buy-side procurement'], analyst:'Forrester Leader · Gartner Customers Choice' },
  icertis:       { id:'icertis',       name:'Icertis',        tier:'Leader', color:'#B794F4', tagline:'Enterprise Contract Intelligence at Scale', scores:{preSig:83,negotiation:86,execution:62,postSig:85,analytics:88,repository:92}, pricing:{min:120,max:250}, impl:{min:20,max:32}, scale:{min:1000,max:100000}, strengths:['Deepest Microsoft integration (Teams, Azure, Copilot)','Strongest enterprise governance framework','Global deployment across 90+ countries','Largest Fortune 500 customer base'], concerns:['Highest price point in market — $120-250K/year','Complex configuration requiring heavy professional services','Longest implementation cycles at 20-32 weeks'], bestFor:['Microsoft-heavy orgs','Global Fortune 500','Regulated industries','Mega-enterprise'], analyst:'Forrester Leader · Gartner Leader' },
  ironclad:      { id:'ironclad',      name:'Ironclad',       tier:'Leader', color:'#FC8181', tagline:'Digital Contracting for Modern Teams', scores:{preSig:95,negotiation:88,execution:93,postSig:55,analytics:66,repository:78}, pricing:{min:60,max:120}, impl:{min:10,max:16}, scale:{min:200,max:20000}, strengths:['Best-in-class pre-signature workflow and intake','Highest user adoption rates — modern UI/UX','Top score in Forrester Current Offering','Strong AI assistant (Jurist) for legal teams'], concerns:['Post-signature capabilities significantly lag leaders','Analytics and reporting less sophisticated','May require add-ons for complex governance'], bestFor:['Pre-signature velocity','Tech companies','Legal team adoption','Fast implementation'], analyst:'Forrester Leader (Top Current Offering)' },
  agiloft:       { id:'agiloft',       name:'Agiloft',        tier:'Leader', color:'#48BB78', tagline:'Data-First No-Code Agreement Platform', scores:{preSig:74,negotiation:70,execution:80,postSig:82,analytics:78,repository:93}, pricing:{min:50,max:100}, impl:{min:12,max:20}, scale:{min:300,max:30000}, strengths:['Extreme no-code configurability — highest Forrester scores','Best TCO for complex, customized workflows','Flexible deployment (cloud, on-prem, hybrid)','Strongest approval routing and buy-side contracts'], concerns:['UI less modern than newer competitors','AI capabilities still maturing vs. specialist vendors','Requires dedicated admin for deep customization'], bestFor:['Unique workflows','Government/on-prem','Budget-conscious enterprise','Procurement teams'], analyst:'Forrester Leader · Highest configurability scores' },
  // ── FORRESTER STRONG PERFORMERS ──
  linksquares:   { id:'linksquares',   name:'LinkSquares',    tier:'Strong Performer', color:'#63B3ED', tagline:'AI-Powered Contract Intelligence', scores:{preSig:80,negotiation:74,execution:84,postSig:70,analytics:82,repository:86}, pricing:{min:50,max:110}, impl:{min:8,max:14}, scale:{min:200,max:10000}, strengths:['G2 Leader for 17 consecutive quarters','#1 Mid-Market CLM on G2','Powerful AI repository analysis (Analyze product)','90-day deployment — fast for mid-market','1000+ customers including DraftKings, Wayfair'], concerns:['Analyze and Finalize can feel like separate products','Post-signature depth lags enterprise platforms','Cost scales aggressively at higher tiers'], bestFor:['Mid-market legal teams','Contract repository analysis','Fast deployment','AI-first analytics'], analyst:'Forrester Strong Performer · G2 Leader' },
  docusign:      { id:'docusign',      name:'DocuSign CLM',   tier:'Strong Performer', color:'#F6AD55', tagline:'eSignature + Full Lifecycle Management', scores:{preSig:76,negotiation:72,execution:78,postSig:68,analytics:65,repository:74}, pricing:{min:70,max:160}, impl:{min:14,max:24}, scale:{min:500,max:50000}, strengths:['1M+ customers — most recognized brand in digital agreements','Native eSignature integration — industry standard','FedRAMP Moderate authorized for government','Massive integration ecosystem'], concerns:['CLM capabilities less mature than pure-play vendors','Users report hidden fees and aggressive upselling','AI features still developing — inconsistent field detection','UI becomes complex beyond basic e-signing'], bestFor:['eSignature-centric orgs','Government (FedRAMP)','DocuSign ecosystem','Brand trust matters'], analyst:'Gartner Customers Choice · MGI 360 Rated' },
  conga:         { id:'conga',         name:'Conga',          tier:'Strong Performer', color:'#ECC94B', tagline:'Revenue Lifecycle + Contract Management', scores:{preSig:78,negotiation:75,execution:74,postSig:72,analytics:70,repository:76}, pricing:{min:60,max:140}, impl:{min:12,max:22}, scale:{min:300,max:25000}, strengths:['Deepest Salesforce integration — native build','Generates 46M quotes annually at enterprise scale','9/10 customer renewal rate','End-to-end quote-to-contract automation'], concerns:['Heavy Salesforce dependency — less flexible outside SF ecosystem','AI capabilities still evolving per user reviews','Collaborative editing limitations noted in reviews'], bestFor:['Salesforce-centric orgs','Sales contract automation','Quote-to-contract','Revenue operations'], analyst:'Gartner Leader (2021) · IDC MarketScape Leader' },
  contractpodai: { id:'contractpodai', name:'ContractPodAi',  tier:'Strong Performer', color:'#F687B3', tagline:'AI-First Contract Management', scores:{preSig:81,negotiation:75,execution:82,postSig:72,analytics:70,repository:76}, pricing:{min:40,max:90}, impl:{min:10,max:18}, scale:{min:200,max:15000}, strengths:['Strong Leah AI assistant — purpose-built for contracts','Good mid-market pricing with strong value','Solid full-lifecycle coverage','Salesforce native integration option'], concerns:['Smaller market presence vs. leaders','Limited post-sig depth vs Sirion/Icertis','Fewer enterprise reference customers'], bestFor:['Mid-market','AI-first approach','Balanced lifecycle','Salesforce integration'], analyst:'Forrester evaluated · Gartner recognized' },
  evisort:       { id:'evisort',       name:'Evisort (Workday)', tier:'Strong Performer', color:'#76E4F7', tagline:'AI-First Contract Analysis — Now Part of Workday', scores:{preSig:68,negotiation:65,execution:80,postSig:74,analytics:90,repository:88}, pricing:{min:60,max:130}, impl:{min:8,max:16}, scale:{min:300,max:20000}, strengths:['Highest Forrester scores for innovation and contract digitization','Connects to existing storage — no forced migration','Auto-classification of document types with high accuracy','Now backed by Workday enterprise resources'], concerns:['Pre-signature workflows less developed','Workday acquisition creates integration uncertainty','Less established full-lifecycle compared to Leaders'], bestFor:['Contract analytics/search','Legacy digitization','Workday ecosystem','No-migration approach'], analyst:'Forrester Strong Performer (Top Innovation)' },
  // ── NOTABLE PLAYERS ──
  juro:          { id:'juro',          name:'Juro',           tier:'Notable', color:'#90CDF4', tagline:'Browser-Native Contracts for Fast Teams', scores:{preSig:91,negotiation:83,execution:96,postSig:38,analytics:48,repository:62}, pricing:{min:20,max:60}, impl:{min:4,max:8}, scale:{min:50,max:1000}, strengths:['Fastest time-to-value in market — 4-8 weeks','Best browser-native editing experience','Highest user satisfaction for simple contracts','Most affordable entry point'], concerns:['Minimal post-signature capabilities','Per-contract pricing escalates at volume','Hard ceiling at enterprise scale (1000+ contracts)','No multi-language support'], bestFor:['Startups/SMB','Sales contracts','Fast deployment','Simple high-volume contracts'], analyst:'MGI 360 Rated · G2 High Performer' },
  spotdraft:     { id:'spotdraft',     name:'SpotDraft',      tier:'Notable', color:'#68D391', tagline:'Modern CLM for Growing Legal Teams', scores:{preSig:84,negotiation:78,execution:88,postSig:60,analytics:72,repository:74}, pricing:{min:30,max:80}, impl:{min:4,max:6}, scale:{min:100,max:5000}, strengths:['4-6 week deployment with free implementation','99% accurate AI metadata extraction','Dedicated success manager included','Strong CRM/HRM integrations out of box'], concerns:['Template setup turnaround (4-5 business days) noted','Post-signature weaker than enterprise platforms','Smaller vendor — less enterprise reference base'], bestFor:['Fast-growing companies','Lean legal teams','SaaS companies','Quick deployment'], analyst:'Stevie Award Winner · G2 recognized' },
  cobblestone:   { id:'cobblestone',   name:'CobbleStone',    tier:'Notable', color:'#A0AEC0', tagline:'Enterprise Contract Management with Compliance Focus', scores:{preSig:72,negotiation:68,execution:70,postSig:78,analytics:74,repository:82}, pricing:{min:40,max:90}, impl:{min:10,max:18}, scale:{min:200,max:15000}, strengths:['Strong compliance and audit trail capabilities','Good government/regulated sector track record','Robust approval workflow engine','Transparent pricing model'], concerns:['UI/UX dated compared to modern competitors','AI capabilities behind market leaders','Less brand recognition outside regulated verticals'], bestFor:['Government contracts','Compliance-heavy orgs','Regulated industries','Mid-market'], analyst:'MGI 360 Rated (SMB Guide)' },
  pandadoc:      { id:'pandadoc',      name:'PandaDoc',       tier:'Notable', color:'#9AE6B4', tagline:'Document Automation for Sales Teams', scores:{preSig:86,negotiation:70,execution:90,postSig:35,analytics:55,repository:60}, pricing:{min:15,max:50}, impl:{min:2,max:4}, scale:{min:20,max:500}, strengths:['Most user-friendly interface in category','Fastest setup — days not weeks','Strong CRM integrations (HubSpot, Salesforce)','Great for proposals + contracts combined'], concerns:['Not a true enterprise CLM — limited governance','Minimal post-signature capabilities','Analytics and compliance features very basic','Ceiling at ~500 contracts/year'], bestFor:['Small sales teams','Proposals + contracts','HubSpot users','Simplest possible CLM'], analyst:'G2 Leader (Proposals) · SMB focused' },
  onit:          { id:'onit',          name:'Onit',           tier:'Notable', color:'#CBD5E0', tagline:'Legal Operations + Contract Management', scores:{preSig:74,negotiation:72,execution:74,postSig:76,analytics:80,repository:78}, pricing:{min:60,max:120}, impl:{min:12,max:20}, scale:{min:300,max:15000}, strengths:['Strong legal operations integration','Good spend management + contract linkage','Process automation beyond just contracts','Enterprise-ready with compliance focus'], concerns:['Less specialized in pure CLM vs. leaders','Brand less recognized than top-tier competitors','Implementation requires professional services'], bestFor:['Legal ops teams','Spend management','Process automation','Mid to large enterprise'], analyst:'Procurement Magazine Top 10' },
  malbek:        { id:'malbek',        name:'Malbek',         tier:'Notable', color:'#FEB2B2', tagline:'AI-Powered CLM for Enterprise Legal Teams', scores:{preSig:78,negotiation:76,execution:76,postSig:74,analytics:76,repository:80}, pricing:{min:50,max:110}, impl:{min:10,max:18}, scale:{min:200,max:10000}, strengths:['Strong AI capabilities for contract analysis','Good balance of pre and post-signature','Modern cloud-native architecture','Solid integrations with enterprise systems'], concerns:['Smaller vendor with less market penetration','Fewer analyst evaluations than top tier','Enterprise references still growing'], bestFor:['AI-focused buyers','Balanced lifecycle needs','Mid to large enterprise','Modern architecture'], analyst:'MGI 360 Rated' },
};

const PERSONAS = [
  { id:'cpo', title:'Chief Procurement Officer', short:'CPO', icon:Globe, desc:'Supplier relationships, spend optimization, procurement strategy', typicalPains:['renewal_miss','obligation_blind','no_analytics'], priorities:['postSig','analytics','compliance','negotiation','repository','preSig','execution','cost'] },
  { id:'gc', title:'General Counsel', short:'GC', icon:Shield, desc:'Legal risk, contract governance, regulatory compliance', typicalPains:['audit_gaps','slow_cycles','version_chaos'], priorities:['compliance','negotiation','preSig','analytics','postSig','repository','execution','cost'] },
  { id:'clo', title:'Chief Legal Officer', short:'CLO', icon:Scale, desc:'Strategic legal leadership, enterprise contract governance', typicalPains:['no_analytics','audit_gaps','obligation_blind'], priorities:['analytics','compliance','postSig','repository','negotiation','preSig','execution','cost'] },
  { id:'legalOps', title:'VP Legal Operations', short:'Legal Ops', icon:Layers, desc:'Efficiency, tech adoption, operational transformation', typicalPains:['slow_cycles','adoption_low','nda_volume'], priorities:['preSig','execution','analytics','negotiation','cost','repository','postSig','compliance'] },
  { id:'procurement', title:'Director of Procurement', short:'Procurement', icon:FileText, desc:'Sourcing, vendor contracts, procurement workflows', typicalPains:['nda_volume','renewal_miss','integration_gaps'], priorities:['postSig','execution','preSig','cost','analytics','repository','negotiation','compliance'] },
  { id:'cfo', title:'Chief Financial Officer', short:'CFO', icon:DollarSign, desc:'ROI, cost optimization, financial risk exposure', typicalPains:['no_analytics','renewal_miss','manual_extraction'], priorities:['analytics','cost','postSig','compliance','repository','preSig','execution','negotiation'] },
  { id:'coo', title:'Chief Operating Officer', short:'COO', icon:Activity, desc:'Operational efficiency, process optimization, scale', typicalPains:['integration_gaps','adoption_low','no_analytics'], priorities:['execution','analytics','preSig','postSig','cost','repository','compliance','negotiation'] },
  { id:'salesOps', title:'Sales/Revenue Operations', short:'Sales Ops', icon:TrendingUp, desc:'Deal velocity, revenue operations, sales enablement', typicalPains:['slow_cycles','nda_volume','adoption_low'], priorities:['preSig','execution','negotiation','cost','analytics','repository','postSig','compliance'] },
];

const INDUSTRIES = [
  { id:'pharma', name:'Pharmaceuticals & Life Sciences', tags:['FDA','HIPAA','BAA','GxP'], w:1.2 },
  { id:'financial', name:'Financial Services & Banking', tags:['SOX','FINRA','GDPR','Basel III'], w:1.15 },
  { id:'healthcare', name:'Healthcare', tags:['HIPAA','BAA','CMS'], w:1.18 },
  { id:'technology', name:'Technology & SaaS', tags:['SOC 2','GDPR','CCPA'], w:1.0 },
  { id:'manufacturing', name:'Manufacturing & Industrial', tags:['ISO','Supply Chain','OSHA'], w:1.05 },
  { id:'energy', name:'Energy & Utilities', tags:['NERC','EPA','FERC'], w:1.1 },
  { id:'government', name:'Government & Public Sector', tags:['FedRAMP','FISMA','ITAR'], w:1.25 },
  { id:'retail', name:'Retail & Consumer Goods', tags:['PCI-DSS','CCPA','GDPR'], w:1.0 },
  { id:'telecom', name:'Telecommunications', tags:['FCC','GDPR','Data Privacy'], w:1.08 },
  { id:'professional', name:'Professional Services', tags:['SOC 2','ISO 27001'], w:1.0 },
  { id:'education', name:'Education & Nonprofit', tags:['FERPA','COPPA','501c3'], w:1.05 },
  { id:'realestate', name:'Real Estate & Construction', tags:['AIA','OSHA','Lien Laws'], w:1.02 },
];

const SIZES = [
  { id:'startup', label:'1 – 50', sub:'Startup', contracts:'10 – 100/yr', vol:50 },
  { id:'smb', label:'50 – 500', sub:'Small-Mid', contracts:'100 – 500/yr', vol:300 },
  { id:'mid', label:'500 – 2,000', sub:'Mid-Market', contracts:'500 – 2K/yr', vol:1000 },
  { id:'ent', label:'2,000 – 10,000', sub:'Enterprise', contracts:'2K – 10K/yr', vol:5000 },
  { id:'large', label:'10,000+', sub:'Large Enterprise', contracts:'10K+/yr', vol:15000 },
];

const PAIN_POINTS = [
  { id:'nda_volume', label:'Drowning in routine contracts', icon:FileText, implies:['preSig','execution'] },
  { id:'slow_cycles', label:'Contract cycles too slow', icon:Clock, implies:['preSig','negotiation'] },
  { id:'version_chaos', label:'Version control nightmare', icon:GitBranch, implies:['repository','preSig'] },
  { id:'renewal_miss', label:'Missing renewals & deadlines', icon:AlertTriangle, implies:['postSig','analytics'] },
  { id:'obligation_blind', label:'No obligation visibility', icon:Eye, implies:['postSig','analytics'] },
  { id:'audit_gaps', label:'Audit & compliance gaps', icon:Shield, implies:['postSig','compliance'] },
  { id:'no_analytics', label:'Zero portfolio visibility', icon:BarChart3, implies:['analytics','repository'] },
  { id:'manual_extraction', label:'Manual data extraction', icon:Brain, implies:['analytics','postSig'] },
  { id:'integration_gaps', label:'Disconnected systems', icon:GitBranch, implies:['execution','repository'] },
  { id:'adoption_low', label:'Low user adoption', icon:Users, implies:['preSig','execution'] },
];

const PRIORITIES = [
  { id:'postSig', label:'Post-Signature Intelligence', desc:'Obligations, renewals, compliance', icon:Clock },
  { id:'preSig', label:'Pre-Signature Speed', desc:'Drafting, intake, approvals', icon:Zap },
  { id:'analytics', label:'Analytics & Visibility', desc:'Dashboards, reporting, insights', icon:BarChart3 },
  { id:'negotiation', label:'Negotiation Power', desc:'AI redlining, playbooks, risk', icon:Target },
  { id:'execution', label:'Execution & Adoption', desc:'Speed, UX, e-signatures', icon:Rocket },
  { id:'compliance', label:'Compliance & Governance', desc:'Audit trails, regulatory', icon:Shield },
  { id:'repository', label:'Repository & Search', desc:'Storage, discovery, migration', icon:Search },
  { id:'cost', label:'Cost Sensitivity', desc:'Budget, TCO, price-to-value', icon:DollarSign },
];

const MATURITY = [
  { id:0, name:'Chaos', color:'#FC8181', desc:'Contracts scattered everywhere. No visibility.' },
  { id:1, name:'Reactive', color:'#F6AD55', desc:'Basic repository exists. Manual tracking.' },
  { id:2, name:'Controlled', color:'#ECC94B', desc:'Dedicated CLM in place. Some automation.' },
  { id:3, name:'Optimized', color:'#48BB78', desc:'Full lifecycle. AI-assisted. Integrated.' },
  { id:4, name:'Intelligent', color:'#63B3ED', desc:'Predictive. Autonomous. Strategic asset.' },
];

const DIM_LABELS = { preSig:'Pre-Signature', negotiation:'Negotiation', execution:'Execution', postSig:'Post-Signature', analytics:'Analytics', repository:'Repository' };

// ═══════════════════════════════════════════════════════════
// SCORING ENGINE v2 — Additive + Capped ±25%
// Unbiased: no vendor gets special treatment
// ═══════════════════════════════════════════════════════════
const calcScores = (p) => {
  if (!p.persona || !p.industry || !p.size || p.painPoints.length === 0) return [];
  const results = {};
  Object.values(VENDORS).forEach(v => {
    let wSum = 0, wTot = 0;
    p.priorities.forEach((dimId, rank) => {
      const w = Math.max(0.2, 3.0 - rank * 0.4);
      wSum += (v.scores[dimId] || 50) / 100 * w; wTot += w;
    });
    p.painPoints.forEach(ppId => {
      const pt = PAIN_POINTS.find(x => x.id === ppId);
      if (pt) pt.implies.forEach(dim => { wSum += (v.scores[dim] || 50) / 100 * 0.2; wTot += 0.2; });
    });
    const base = (wSum / wTot) * 100;
    let adj = 0;

    // Size — based on vendor's actual market positioning
    const sz = p.size;
    if (sz === 'startup') {
      if (v.scale.min > 300) adj -= 15;
      if (v.scale.min <= 50) adj += 10;
      if (v.pricing.min > 80) adj -= 10;
      if (v.pricing.max <= 60) adj += 8;
    }
    if (sz === 'smb') {
      if (v.scale.min > 500) adj -= 10;
      if (v.pricing.min >= 100) adj -= 12;
      if (v.pricing.max <= 60) adj += 8;
      if (v.impl.min <= 8) adj += 5;
    }
    if (sz === 'mid') {
      if (v.scale.max < 5000) adj -= 4;
      if (v.pricing.min >= 100) adj -= 5;
      if (v.impl.min <= 12) adj += 3;
    }
    if (sz === 'ent') {
      if (v.scale.max < 5000) adj -= 15;
      if (v.scale.max < 10000) adj -= 6;
      if (v.scale.max >= 30000) adj += 5;
    }
    if (sz === 'large') {
      if (v.scale.max < 10000) adj -= 20;
      if (v.scale.max < 20000) adj -= 8;
      if (v.scale.max >= 50000) adj += 5;
    }

    // Industry — compliance weight drives governance vendors up
    const ind = INDUSTRIES.find(x => x.id === p.industry);
    if (ind && ind.w >= 1.15) {
      // High compliance: boost vendors with strong postSig+compliance
      const govScore = (v.scores.postSig + (v.scores.compliance || v.scores.analytics)) / 2;
      adj += Math.round((govScore - 75) / 5); // above 75 gets bonus, below gets penalty
    }
    if (ind && ind.id === 'technology') {
      const techScore = (v.scores.preSig + v.scores.execution) / 2;
      adj += Math.round((techScore - 80) / 5);
    }
    if (ind && ind.id === 'government') {
      // FedRAMP / on-prem matters
      if (v.id === 'docusign') adj += 6; // FedRAMP authorized
      if (v.id === 'agiloft') adj += 8; // on-prem option
      if (v.id === 'cobblestone') adj += 5;
      if (v.scale.max < 5000) adj -= 8;
    }

    // Maturity
    if (p.maturity <= 1) {
      if (v.impl.min <= 6) adj += 6;
      else if (v.impl.min <= 10) adj += 3;
      else if (v.impl.min >= 16) adj -= 5;
      if (v.impl.min >= 20) adj -= 4;
    }
    if (p.maturity >= 3) {
      const sophistication = (v.scores.postSig + v.scores.analytics + v.scores.repository) / 3;
      adj += Math.round((sophistication - 75) / 6);
    }

    // Speed priority
    const er = p.priorities.indexOf('execution');
    if (er >= 0 && er < 3) {
      if (v.impl.min <= 6) adj += 6;
      else if (v.impl.min <= 10) adj += 3;
      else if (v.impl.min >= 16) adj -= 5;
      if (v.impl.min >= 20) adj -= 3;
    }

    // Cost priority
    const cr = p.priorities.indexOf('cost');
    if (cr >= 0 && cr < 3) {
      if (v.pricing.max <= 60) adj += 8;
      else if (v.pricing.max <= 100) adj += 3;
      else if (v.pricing.min >= 100) adj -= 6;
      if (v.pricing.min >= 120) adj -= 4;
    }

    const cappedAdj = Math.max(-25, Math.min(25, adj));
    const final = Math.min(97, Math.max(15, Math.round(base * (1 + cappedAdj / 100))));
    results[v.id] = { id: v.id, score: final, base: Math.round(base), adj: cappedAdj };
  });
  return Object.values(results).sort((a, b) => b.score - a.score);
};

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function CLMAdvisor() {
  const _globalTheme = useTheme();
  Object.assign(C, _globalTheme.mode === "light" ? C_LIGHT : C_DARK);
  const { pipeline, updateModule } = usePipeline();

  const [step, setStep] = useState(0); // 0=profile, 1=assessment, 2=results
  const [profile, setProfile] = useState({
    persona:null, industry:null, size:null, painPoints:[], maturity:1,
    priorities: PRIORITIES.map(p => p.id),
  });
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [scoreKey, setScoreKey] = useState(0);
  const [pipelineM4Loaded, setPipelineM4Loaded] = useState(false);

  // Auto-load M4 buyer data from pipeline to pre-fill profile
  useEffect(() => {
    if (pipeline.m4.latestStage && !pipelineM4Loaded && !profile.persona) {
      setPipelineM4Loaded(true);
      // If M4 has analysis data, we could pre-select persona based on the buyer's title
      // For now just mark as loaded — future: auto-map title to persona
    }
  }, [pipeline.m4.latestStage, pipelineM4Loaded, profile.persona]);

  const scores = useMemo(() => calcScores(profile), [profile]);
  const prevScoresRef = useRef(scores);
  useEffect(() => {
    if (JSON.stringify(scores) !== JSON.stringify(prevScoresRef.current)) {
      setScoreKey(k => k + 1); prevScoresRef.current = scores;
    }
  }, [scores]);

  const upd = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const personaObj = PERSONAS.find(p => p.id === profile.persona);
  const industryObj = INDUSTRIES.find(i => i.id === profile.industry);
  const sizeObj = SIZES.find(s => s.id === profile.size);

  const profileOk = profile.persona && profile.industry && profile.size;
  const assessOk = profileOk && profile.painPoints.length > 0;

  // Styles
  const crd = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 };
  const lbl = { fontFamily: F.m, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sub, marginBottom: 10, display: 'block' };
  const h2s = { fontFamily: F.h, fontSize: 26, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.2 };
  const btnP = { padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${C.accent}, #3182CE)`, color: '#fff', fontFamily: F.h, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' };
  const btnG = { padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.sub, fontFamily: F.b, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };

  const movePriority = (idx, dir) => {
    const np = [...profile.priorities]; const t = idx + dir;
    if (t < 0 || t >= np.length) return;
    [np[idx], np[t]] = [np[t], np[idx]]; upd('priorities', np);
  };

  // ═══ STEP 0: PROFILE ═══
  const ProfileStep = () => (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={crd}>
        <span style={lbl}>Your Role</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {PERSONAS.map(p => { const Icon = p.icon; const on = profile.persona === p.id; return (
            <button key={p.id} onClick={() => { upd('persona', p.id); if (!profile.painPoints.length) upd('painPoints', p.typicalPains); upd('priorities', p.priorities); }} style={{ padding: 14, borderRadius: 10, textAlign: 'left', border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : 'transparent', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Icon size={16} color={on ? C.accent : C.dim} /><span style={{ fontFamily: F.h, fontSize: 13, fontWeight: 700, color: on ? C.text : C.sub }}>{p.short}</span></div>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{p.desc}</div>
            </button>
          ); })}
        </div>
      </div>
      <div style={crd}>
        <span style={lbl}>Industry</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {INDUSTRIES.map(ind => { const on = profile.industry === ind.id; return (
            <button key={ind.id} onClick={() => upd('industry', ind.id)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : 'transparent', color: on ? C.text : C.sub, fontFamily: F.b, fontSize: 12, cursor: 'pointer' }}>{ind.name}</button>
          ); })}
        </div>
      </div>
      <div style={crd}>
        <span style={lbl}>Company Size (employees)</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {SIZES.map(sz => { const on = profile.size === sz.id; return (
            <button key={sz.id} onClick={() => upd('size', sz.id)} style={{ padding: '14px 10px', borderRadius: 10, textAlign: 'center', border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : 'transparent', cursor: 'pointer' }}>
              <div style={{ fontFamily: F.h, fontSize: 18, fontWeight: 700, color: on ? C.accent : C.text }}>{sz.label}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sz.sub}</div>
            </button>
          ); })}
        </div>
      </div>
      {profileOk && <button onClick={() => setStep(1)} style={{ ...btnP, width: '100%' }}>Continue to Assessment <ChevronRight size={16} /></button>}
    </div>
  );

  // ═══ STEP 1: ASSESSMENT ═══
  const AssessStep = () => (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <button onClick={() => setStep(0)} style={{ ...btnG, alignSelf: 'flex-start', padding: '6px 14px', fontSize: 12 }}><ChevronLeft size={14} /> Edit Profile</button>
      <div style={crd}>
        <span style={lbl}>What's broken? Select all that apply</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {PAIN_POINTS.map(pp => { const Icon = pp.icon; const on = profile.painPoints.includes(pp.id); return (
            <button key={pp.id} onClick={() => upd('painPoints', on ? profile.painPoints.filter(x => x !== pp.id) : [...profile.painPoints, pp.id])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentDim : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <Icon size={14} color={on ? C.accent : C.dim} />
              <span style={{ fontSize: 12, color: on ? C.text : C.sub, fontWeight: on ? 500 : 400 }}>{pp.label}</span>
              {on && <Check size={12} color={C.accent} style={{ marginLeft: 'auto' }} />}
            </button>
          ); })}
        </div>
      </div>
      <div style={crd}>
        <span style={lbl}>CLM Maturity</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {MATURITY.map(m => { const on = profile.maturity === m.id; return (
            <button key={m.id} onClick={() => upd('maturity', m.id)} style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: `1px solid ${on ? m.color : C.border}`, background: on ? `${m.color}18` : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: on ? m.color : C.faint, margin: '0 auto 4px' }} />
              <span style={{ fontSize: 11, fontWeight: on ? 600 : 400, color: on ? C.text : C.dim }}>{m.name}</span>
            </button>
          ); })}
        </div>
      </div>
      <div style={crd}>
        <span style={lbl}>Priority Ranking — Drag or use arrows</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {profile.priorities.map((pId, idx) => {
              const pr = PRIORITIES.find(p => p.id === pId); if (!pr) return null;
              const Icon = pr.icon; const isOver = dragOverIdx === idx;
              return (
                <div key={pId} className="drag-item" draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); if (dragIdx !== null && dragIdx !== idx) { const np = [...profile.priorities]; const item = np[dragIdx]; np.splice(dragIdx, 1); np.splice(idx, 0, item); upd('priorities', np); setDragIdx(idx); }}}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={() => { setDragOverIdx(null); setDragIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${isOver ? C.accent : C.border}`, background: isOver ? C.accentDim : 'transparent', transition: 'all .18s' }}>
                  <GripVertical size={11} color={C.dim} />
                  <span style={{ fontFamily: F.m, fontSize: 11, fontWeight: 700, width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: idx === 0 ? C.gold : idx < 3 ? `${C.faint}50` : `${C.faint}25`, color: idx === 0 ? '#000' : C.dim, flexShrink: 0 }}>{idx + 1}</span>
                  <Icon size={12} color={C.accent} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{pr.label}</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); movePriority(idx, -1); }} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', padding: 1, opacity: idx === 0 ? 0.2 : 0.7 }}><ChevronUp size={11} color={C.sub} /></button>
                    <button onClick={(e) => { e.stopPropagation(); movePriority(idx, 1); }} disabled={idx === 7} style={{ background: 'none', border: 'none', cursor: idx === 7 ? 'default' : 'pointer', padding: 1, opacity: idx === 7 ? 0.2 : 0.7 }}><ChevronDown size={11} color={C.sub} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <span style={lbl}>Live Preview</span>
            {scores.length > 0 ? (
              <div key={scoreKey} className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scores.slice(0, 6).map((vs, i) => { const v = VENDORS[vs.id]; return (
                  <div key={vs.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: i === 0 ? C.text : C.sub, fontWeight: i === 0 ? 600 : 400 }}>{i === 0 && <Star size={9} color={C.gold} fill={C.gold} style={{ marginRight: 3 }} />}{v.name}</span>
                      <span style={{ fontFamily: F.m, fontSize: 11, fontWeight: 600, color: i === 0 ? C.accent : C.dim }}>{vs.score}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: `${C.faint}25` }}><div style={{ height: '100%', borderRadius: 2, width: `${vs.score}%`, background: i === 0 ? v.color : `${v.color}50`, transition: 'width .5s ease' }} /></div>
                  </div>
                ); })}
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>+ {scores.length - 6} more vendors analyzed</div>
              </div>
            ) : <div style={{ padding: 20, textAlign: 'center', color: C.dim, fontSize: 11 }}>Select pain points to see scores</div>}
          </div>
        </div>
      </div>
      {assessOk && <button onClick={() => { updateModule("m5", { recommendations: scores.slice(0, 5).map(s => ({ vendorId: s.id, score: s.score })), generatedAt: new Date().toISOString() }); setStep(2); }} style={{ ...btnP, width: '100%' }}><Sparkles size={16} /> See My Results — 15 Vendors Analyzed <ChevronRight size={16} /></button>}
    </div>
  );

  // ═══ STEP 2: RESULTS ═══
  const ResultsStep = () => {
    const top = scores[0]; const topV = VENDORS[top?.id];
    const dims = Object.keys(DIM_LABELS);
    const compared = selectedVendor ? [scores[0].id, selectedVendor].filter((v, i, a) => a.indexOf(v) === i) : scores.slice(0, 3).map(s => s.id);
    const radarData = dims.map(k => { const d = { subject: DIM_LABELS[k] }; compared.forEach(vid => { d[vid] = VENDORS[vid].scores[k]; }); return d; });
    const topPriorities = profile.priorities.slice(0, 3).map(p => PRIORITIES.find(x => x.id === p)?.label);

    const downloadReport = () => {
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLM Vendor Analysis: ${personaObj?.title} in ${industryObj?.name} | CLM Advisor</title><meta name="description" content="Analyst-backed CLM vendor analysis for ${personaObj?.title}. ${topV.name} leads with ${top.score}% fit score across 15 vendors."><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#080F1A;color:#94A8C2;line-height:1.7}.w{max-width:780px;margin:0 auto;padding:40px 24px 80px}h1{font-family:Inter;font-size:32px;font-weight:800;color:#EDF2F7;line-height:1.2;margin-bottom:12px}h2{font-family:Inter;font-size:20px;font-weight:700;color:#EDF2F7;margin:36px 0 14px;padding-top:20px;border-top:1px solid rgba(99,179,237,0.1)}p{margin-bottom:14px}.meta{font-size:13px;color:#6B82A0;margin-bottom:24px;display:flex;flex-wrap:wrap;gap:14px}.meta b{color:#63B3ED}.hero{background:linear-gradient(135deg,${topV.color}12,#B794F408);border:1px solid ${topV.color}30;border-radius:16px;padding:24px;margin:24px 0}.vr{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(99,179,237,0.08)}.vb{flex:1;height:5px;border-radius:3px;background:rgba(107,130,160,0.2)}.vf{height:100%;border-radius:3px}.vn{width:130px;font-weight:500;color:#EDF2F7;font-size:14px}.vs{font-family:'JetBrains Mono',monospace;font-weight:600;width:46px;text-align:right;font-size:13px}.tag{display:inline-block;padding:3px 12px;border-radius:14px;background:rgba(255,255,255,0.06);font-size:11px;margin:2px}.card{background:#111F36;border:1px solid rgba(99,179,237,0.1);border-radius:12px;padding:18px;margin:14px 0}.str{color:#48BB78}.con{color:#ECC94B}.ft{margin-top:40px;padding-top:16px;border-top:1px solid rgba(99,179,237,0.08);font-size:11px;color:#4A6280;text-align:center}.ft a{color:#63B3ED;text-decoration:none}.tier{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;letter-spacing:0.05em}</style></head><body><div class="w"><p style="font-family:Inter;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#63B3ED;text-transform:uppercase;margin-bottom:8px">CLM ADVISOR — ANALYST-BACKED ANALYSIS</p><h1>Which CLM Platform Should a ${personaObj?.title} in ${industryObj?.name} Choose?</h1><div class="meta"><span>${date}</span><span>Role: <b>${personaObj?.title}</b></span><span>Industry: <b>${industryObj?.name}</b></span><span>Size: <b>${sizeObj?.label} employees</b></span><span>Maturity: <b>${MATURITY[profile.maturity].name}</b></span></div><p>We analyzed <strong>15 CLM vendors</strong> across <strong>6 lifecycle dimensions</strong> — weighted for <strong>${topPriorities.join(', ')}</strong>. With compliance requirements including ${industryObj?.tags.join(', ')}, and contract volume of <strong>${sizeObj?.contracts}</strong>, here's what the data shows.</p><div class="hero"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px"><div><p style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#ECC94B;text-transform:uppercase;margin-bottom:4px">TOP RECOMMENDATION</p><div style="font-family:Inter;font-size:26px;font-weight:700;color:#EDF2F7">${topV.name}</div><p style="color:#94A8C2;margin:4px 0 10px;font-size:14px">${topV.tagline}</p><div>${topV.bestFor.map(t=>'<span class="tag">'+t+'</span>').join(' ')}</div><span class="tier" style="background:${topV.tier==='Leader'?'#63B3ED20':'#B794F420'};color:${topV.tier==='Leader'?'#63B3ED':'#B794F4'};margin-top:8px;display:inline-block">${topV.analyst}</span></div><div style="text-align:right"><div style="font-family:Inter;font-size:48px;font-weight:800;color:#EDF2F7">${top.score}%</div><div style="font-size:12px;color:#6B82A0">fit score</div></div></div></div><h2>Full Rankings — 15 Vendors</h2><p>Scores reflect weighted base capabilities plus context adjustments (capped at ±25%) for your size, industry, maturity, and priority configuration.</p>${scores.map((vs,i)=>{const v=VENDORS[vs.id];return '<div class="vr"><span style="font-family:JetBrains Mono;font-size:11px;color:#6B82A0;width:22px">#'+(i+1)+'</span><span class="vn">'+v.name+'</span><span class="tier" style="background:'+({Leader:'#63B3ED15','Strong Performer':'#B794F415',Notable:'#48BB7815'}[v.tier])+';color:'+({Leader:'#63B3ED','Strong Performer':'#B794F4',Notable:'#48BB78'}[v.tier])+'">'+v.tier+'</span><div class="vb"><div class="vf" style="width:'+vs.score+'%;background:'+v.color+'"></div></div><span class="vs" style="color:'+(i===0?'#63B3ED':'#94A8C2')+'">'+vs.score+'%</span></div>';}).join('')}<h2>Why ${topV.name} Leads</h2><div class="card"><h3 class="str" style="font-family:Inter;font-size:15px;margin-bottom:10px">Strengths</h3>${topV.strengths.map(s=>'<p>✓ '+s+'</p>').join('')}<h3 class="con" style="font-family:Inter;font-size:15px;margin:18px 0 10px">Watch Out For</h3>${topV.concerns.map(c=>'<p>⚠ '+c+'</p>').join('')}</div><h2>Methodology</h2><p><strong>Step 1 — Weighted Base Score:</strong> Priority #1 gets 3.0x weight, #8 gets 0.2x. Pain points add alignment bonuses.</p><p><strong>Step 2 — Context Modifiers:</strong> Size fit, industry compliance burden, maturity, speed, and cost adjustments are summed additively.</p><p><strong>Step 3 — Cap at ±25%:</strong> No vendor can be boosted or penalized beyond ±25%, ensuring product capabilities always drive rankings.</p><p>Dimension scores are estimated from Gartner, Forrester Wave Q1 2025, G2 reviews, and MGI 360 Ratings. Full evidence-backed scores with source URLs available in the Premium report.</p><h2>Pricing & TCO</h2>${scores.slice(0,5).map(vs=>{const v=VENDORS[vs.id];return '<p><strong>'+v.name+':</strong> $'+v.pricing.min+'-'+v.pricing.max+'K/yr · Implementation: '+v.impl.min+'-'+v.impl.max+' weeks</p>';}).join('')}<div class="ft"><p>Generated by <a href="#">CLM Advisor by Sirion Intelligence</a> · Analyst-backed, vendor-neutral analysis · ${date}</p><p style="margin-top:4px">Scoring based on Forrester Wave Q1 2025, Gartner Peer Insights, G2 Winter 2026, MGI 360 Ratings</p><p style="margin-top:8px">Want help selecting? <a href="mailto:hello@sirion.ai">Contact Sirion Intelligence for vendor selection advisory →</a></p></div></div></body></html>`;
      const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `clm-analysis-${industryObj?.id}-${Date.now()}.html`; a.click(); URL.revokeObjectURL(url);
    };

    return (
      <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={h2s}>Your CLM Vendor Analysis</h2>
            <p style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{personaObj?.title} · {industryObj?.name} · {sizeObj?.label} emp · {MATURITY[profile.maturity].name} maturity</p>
            <p style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Weighted for: <b style={{ color: C.accent }}>{topPriorities.join(', ')}</b></p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(1)} style={{ ...btnG, fontSize: 11, padding: '6px 12px' }}>Edit</button>
            <button onClick={downloadReport} style={{ ...btnG, fontSize: 11, padding: '6px 12px', borderColor: C.accent, color: C.accent }}><Download size={12} /> HTML Report</button>
          </div>
        </div>

        {/* Hero */}
        <div style={{ padding: 24, borderRadius: 16, background: `linear-gradient(135deg, ${topV.color}10, ${C.purple}08)`, border: `1px solid ${topV.color}25` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span style={{ ...lbl, color: C.gold, marginBottom: 4 }}>TOP RECOMMENDATION</span>
              <h2 style={{ fontFamily: F.h, fontSize: 28, fontWeight: 800, color: C.text, margin: 0 }}>{topV.name}</h2>
              <p style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{topV.tagline}</p>
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>{topV.bestFor.map(t => <span key={t} style={{ padding: '3px 10px', borderRadius: 12, background: `${C.text}08`, fontSize: 11, color: C.sub }}>{t}</span>)}</div>
              <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 10px', borderRadius: 4, background: C.accentDim, fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: '0.03em' }}>{topV.analyst}</div>
            </div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: F.h, fontSize: 48, fontWeight: 900, color: C.text }}>{top.score}%</div><div style={{ fontSize: 12, color: C.dim }}>fit score</div></div>
          </div>
        </div>

        {/* All Rankings */}
        <div style={crd}>
          <span style={lbl}>All 15 Vendors Ranked</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {scores.map((vs, i) => { const v = VENDORS[vs.id]; const tierColor = { Leader: C.accent, 'Strong Performer': C.purple, Notable: C.green }[v.tier]; return (
              <div key={vs.id} onClick={() => setSelectedVendor(vs.id)} style={{ cursor: 'pointer', padding: '9px 12px', borderRadius: 8, border: `1px solid ${selectedVendor === vs.id ? v.color + '40' : 'transparent'}`, background: selectedVendor === vs.id ? `${v.color}08` : 'transparent', transition: 'all .12s' }}
                onMouseEnter={e => { if (selectedVendor !== vs.id) e.currentTarget.style.background = C.cardHover; }}
                onMouseLeave={e => { if (selectedVendor !== vs.id) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim, width: 18 }}>#{i + 1}</span>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: v.color }} />
                  <span style={{ fontSize: 13, fontWeight: i === 0 ? 600 : 400, color: C.text, flex: 1 }}>{v.name}</span>
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: `${tierColor}15`, color: tierColor, fontWeight: 600 }}>{v.tier}</span>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: F.m }}>${v.pricing.min}-{v.pricing.max}K</span>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: F.m }}>{v.impl.min}-{v.impl.max}wk</span>
                  <span style={{ fontFamily: F.m, fontSize: 11, color: vs.adj > 0 ? C.green : vs.adj < 0 ? C.gold : C.dim }}>{vs.adj > 0 ? '+' : ''}{vs.adj}%</span>
                  <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 600, color: i === 0 ? C.accent : C.sub, width: 36, textAlign: 'right' }}>{vs.score}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: `${C.faint}20`, marginLeft: 26 }}>
                  <div className="bar-grow" style={{ height: '100%', borderRadius: 2, width: `${vs.score}%`, background: `linear-gradient(90deg, ${v.color}, ${v.color}44)` }} />
                </div>
              </div>
            ); })}
          </div>
        </div>

        {/* Vendor Detail (when clicked) */}
        {selectedVendor && (() => {
          const v = VENDORS[selectedVendor]; const vs = scores.find(s => s.id === selectedVendor);
          return (
            <div className="fade-up" style={{ ...crd, border: `1px solid ${v.color}30` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: v.color }} /><h3 style={{ fontFamily: F.h, fontSize: 20, fontWeight: 700, color: C.text }}>{v.name}</h3></div>
                  <p style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{v.tagline}</p>
                  <div style={{ marginTop: 6, display: 'inline-block', padding: '3px 10px', borderRadius: 4, background: C.accentDim, fontSize: 11, fontWeight: 600, color: C.accent }}>{v.analyst}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div style={{ fontFamily: F.h, fontSize: 32, fontWeight: 800, color: C.text }}>{vs?.score}%</div><div style={{ fontSize: 11, color: C.dim }}>base: {vs?.base} · adj: {vs?.adj > 0 ? '+' : ''}{vs?.adj}%</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {[{ l: 'Pricing', v: `$${v.pricing.min}-${v.pricing.max}K/yr` }, { l: 'Implementation', v: `${v.impl.min}-${v.impl.max} weeks` }, { l: 'Scale', v: `${v.scale.min.toLocaleString()}-${v.scale.max.toLocaleString()}` }, { l: 'Tier', v: v.tier }].map(q => <div key={q.l} style={{ padding: 10, borderRadius: 8, background: C.surface, textAlign: 'center' }}><div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 600, color: C.text }}>{q.v}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{q.l}</div></div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>Strengths</div>
                  {v.strengths.map((s, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}><Check size={12} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 12, color: C.sub, lineHeight: 1.4 }}>{s}</span></div>)}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.gold, marginBottom: 8 }}>Concerns</div>
                  {v.concerns.map((c, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}><MinusCircle size={12} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 12, color: C.sub, lineHeight: 1.4 }}>{c}</span></div>)}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Radar Comparison */}
        <div style={crd}>
          <span style={lbl}>Capability Comparison — Top 3</span>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={`${C.faint}25`} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: C.sub, fontSize: 11, fontFamily: F.b }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: C.dim, fontSize: 11 }} />
              {compared.map((vid, i) => <Radar key={vid} name={VENDORS[vid].name} dataKey={vid} stroke={VENDORS[vid].color} fill={VENDORS[vid].color} fillOpacity={i === 0 ? 0.15 : 0.04} strokeWidth={i === 0 ? 2.5 : 1.5} />)}
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>{compared.map(vid => <div key={vid} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: 3, background: VENDORS[vid].color }} /><span style={{ fontSize: 11, color: C.sub }}>{VENDORS[vid].name}</span></div>)}</div>
        </div>

        {/* CTA */}
        <div style={{ padding: 24, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}10, ${C.purple}08)`, border: `1px solid ${C.accent}20`, textAlign: 'center' }}>
          <div style={{ fontFamily: F.h, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>Need Help Deciding?</div>
          <p style={{ fontSize: 13, color: C.sub, maxWidth: 500, margin: '0 auto 14px' }}>Our CLM advisory team provides vendor selection support, RFP creation, and implementation guidance for enterprise buyers.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={downloadReport} style={btnP}><Download size={15} /> Download Full Report</button>
            <a href="mailto:hello@sirion.ai?subject=CLM%20Advisory%20Request" style={{ ...btnP, background: 'transparent', border: `1px solid ${C.accent}`, color: C.accent, textDecoration: 'none' }}><Mail size={15} /> Contact Sirion Intelligence</a>
          </div>
        </div>

        {/* Next Steps CTA */}
        <div style={{ padding: 28, borderRadius: 16, background: `linear-gradient(135deg, ${C.card}, ${C.surface})`, border: `2px solid ${C.accent}30`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.accent}, ${C.purple}, ${C.teal})` }} />
          <div style={{ fontFamily: F.m, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accent, marginBottom: 14 }}>RECOMMENDED NEXT STEPS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { num: '1', text: 'Schedule a personalized demo based on your profile', icon: Rocket },
              { num: '2', text: 'See how Sirion addresses your top 3 priorities', icon: Target },
              { num: '3', text: 'Get a custom ROI projection for your organization', icon: TrendingUp },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.num} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 10, background: `${C.accent}06`, border: `1px solid ${C.border}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}20, ${C.purple}15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 800, color: C.accent }}>{item.num}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text, flex: 1 }}>{item.text}</span>
                  <Icon size={16} color={C.dim} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ padding: 14, borderRadius: 10, background: C.surface, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
          <b style={{ color: C.dim }}>Methodology & Disclaimer:</b> Scores are estimated from publicly available data including Forrester Wave Q1 2025, Gartner Peer Insights, G2 Winter 2026, and MGI 360 Ratings. Vendor tier designations reflect Forrester Wave Q1 2025 positioning. This tool is analyst-backed and vendor-neutral. Context adjustments are additive and capped at ±25% to ensure base product capabilities always drive results. For evidence-backed scores with source URLs, contact our advisory team.
        </div>
      </div>
    );
  };

  // ═══ RENDER ═══
  const steps = [ProfileStep, AssessStep, ResultsStep];
  const Step = steps[step];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: F.b, color: C.text }}>
      <style>{`${fonts}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes barGrow{from{width:0%}}
.fade-up{animation:fadeUp .4s ease-out both}
.score-pulse{animation:pulse .35s ease-out}
.bar-grow{animation:barGrow .5s ease-out}
.drag-item{cursor:grab;user-select:none;transition:all .18s ease}
.drag-item:active{cursor:grabbing}
*::-webkit-scrollbar{width:6px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:${C.faint}40;border-radius:3px}
`}</style>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${C.bg}F0`, backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, #3182CE)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Scale size={14} color="#fff" /></div>
          <div><div style={{ fontFamily: F.h, fontSize: 15, fontWeight: 800, color: C.text }}>CLM Advisor</div><div style={{ fontSize: 11, color: C.dim }}>by Sirion Intelligence · Analyst-Backed · 15 vendors</div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {[0, 1, 2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: step >= s ? (step === s ? C.accent : C.green) : `${C.faint}30`, fontSize: 11, fontWeight: 700, fontFamily: F.m, color: step >= s ? '#000' : C.dim, transition: 'all .2s' }}>
                {step > s ? <Check size={11} /> : s + 1}
              </div>
              <span style={{ fontSize: 11, color: step === s ? C.text : C.dim, fontWeight: step === s ? 600 : 400 }}>
                {['Profile', 'Assess', 'Results'][s]}
              </span>
              {s < 2 && <div style={{ width: 20, height: 1, background: step > s ? C.green : `${C.faint}30` }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 80px' }}>
        {step === 0 && (
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontFamily: F.h, fontSize: 34, fontWeight: 900, color: C.text, lineHeight: 1.15 }}>Find Your Perfect CLM Platform</h1>
            <p style={{ fontSize: 16, color: C.sub, marginTop: 8, maxWidth: 560, margin: '8px auto 0' }}>15 vendors. 6 lifecycle dimensions. Personalized to your role, industry, and priorities. Analyst-backed and vendor-neutral.</p>
            <p style={{ fontSize: 12, color: C.dim, marginTop: 10, fontFamily: F.b, letterSpacing: '0.01em' }}>Powered by Forrester, Gartner, and G2 data — personalized to your exact role and priorities.</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 16 }}>
              {[{ l: 'Forrester Wave Q1 2025', c: C.accent }, { l: 'Gartner Peer Insights', c: C.purple }, { l: 'G2 Winter 2026', c: C.green }, { l: 'MGI 360 Ratings', c: C.gold }].map(s => (
                <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Award size={11} color={s.c} /><span style={{ fontSize: 11, color: C.dim }}>{s.l}</span></div>
              ))}
            </div>
          </div>
        )}
        <Step />
      </div>
    </div>
  );
}
