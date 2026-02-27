/* ═══════════════════════════════════════════════════════════
   TYPOGRAPHY SYSTEM — Xtrusio Growth Engine
   Google AI Studio aesthetic: clean, minimal, Material Design 3
   Two fonts only: Inter (all text) + JetBrains Mono (code/metrics)
   ═══════════════════════════════════════════════════════════ */

// Single Google Fonts import for the entire app
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap";

// Font families — only 2, everywhere
export const FONT = {
  heading: "'Inter', system-ui, -apple-system, sans-serif",
  body:    "'Inter', system-ui, -apple-system, sans-serif",
  mono:    "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
};

// Type scale (Material Design 3 inspired, tuned for enterprise SaaS at 110-125% zoom)
export const TYPE = {
  displayLg:  { fontSize: 32, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px" },
  display:    { fontSize: 28, fontWeight: 800, lineHeight: 1.2,  letterSpacing: "-0.5px" },
  headline:   { fontSize: 24, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.3px" },
  headlineSm: { fontSize: 20, fontWeight: 700, lineHeight: 1.3,  letterSpacing: "-0.2px" },
  title:      { fontSize: 18, fontWeight: 600, lineHeight: 1.35 },
  titleSm:    { fontSize: 16, fontWeight: 600, lineHeight: 1.4  },
  bodyLg:     { fontSize: 15, fontWeight: 400, lineHeight: 1.6  },
  body:       { fontSize: 14, fontWeight: 400, lineHeight: 1.5  },
  bodySm:     { fontSize: 13, fontWeight: 400, lineHeight: 1.5  },
  labelLg:    { fontSize: 13, fontWeight: 500, lineHeight: 1.3  },
  label:      { fontSize: 12, fontWeight: 500, lineHeight: 1.3  },
  labelSm:    { fontSize: 11, fontWeight: 500, lineHeight: 1.3  },
  caption:    { fontSize: 11, fontWeight: 400, lineHeight: 1.3  },
  // 11px is the absolute minimum — nothing below this
};

// KPI / metric numbers (monospace, high-impact)
export const METRIC = {
  hero:   { fontSize: 32, fontWeight: 800, fontFamily: FONT.mono, lineHeight: 1.1 },
  large:  { fontSize: 28, fontWeight: 800, fontFamily: FONT.mono, lineHeight: 1.1 },
  medium: { fontSize: 22, fontWeight: 700, fontFamily: FONT.mono, lineHeight: 1.2 },
  small:  { fontSize: 18, fontWeight: 700, fontFamily: FONT.mono, lineHeight: 1.2 },
  tiny:   { fontSize: 14, fontWeight: 600, fontFamily: FONT.mono, lineHeight: 1.3 },
};

// Section label style (uppercase headers used across all modules)
export const SECTION_LABEL = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.1em", fontFamily: FONT.mono,
};
