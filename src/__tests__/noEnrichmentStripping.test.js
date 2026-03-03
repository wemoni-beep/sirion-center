/**
 * ═══════════════════════════════════════════════════════════
 * noEnrichmentStripping.test.js — SAFEGUARD
 *
 * This test scans the actual source code of QuestionGenerator.jsx
 * for any place that builds a question object. If it finds a mapping
 * that includes "query" but is missing "intentType", it FAILS.
 *
 * This is the permanent guard against the #1 recurring bug:
 * code that maps question objects but forgets enrichment fields.
 * ═══════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The 6 enrichment fields that must NEVER be stripped
const ENRICHMENT_FIELDS = [
  'intentType',
  'personaFit',
  'bestPersona',
  'volumeTier',
  'criterion',
  'enrichedAt',
];

describe('Source code safeguard: no enrichment stripping', () => {

  it('QuestionGenerator.jsx never uses "cw" as a field name in question mappings', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'QuestionGenerator.jsx'), 'utf8');
    // Find lines that assign cw: (which should be cluster:)
    const cwAssignments = [];
    src.split('\n').forEach((line, i) => {
      // Match "cw:" or "cw :" in object literals, but not in comments or strings about cw
      if (/^\s*(cw)\s*:/.test(line.trim()) || /,\s*cw\s*:/.test(line)) {
        // Exclude comments
        const trimmed = line.trim();
        if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
          cwAssignments.push({ line: i + 1, text: trimmed.substring(0, 80) });
        }
      }
    });
    if (cwAssignments.length > 0) {
      throw new Error(
        `Found "cw:" field assignments in QuestionGenerator.jsx (should be "cluster:"):\n` +
        cwAssignments.map(a => `  Line ${a.line}: ${a.text}`).join('\n')
      );
    }
  });

  it('every question TRANSFORMATION mapping preserves enrichment fields', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'QuestionGenerator.jsx'), 'utf8');
    const lines = src.split('\n');

    // We only check TRANSFORMATION mappings — code that reads from existing question
    // objects (q.query) and builds a new object. These MUST preserve enrichment.
    //
    // We do NOT flag CREATION mappings — code that builds brand new questions from
    // AI responses or static data (q.q shorthand). Those don't have enrichment yet.
    //
    // Pattern: "query: q.query" = transformation (must preserve enrichment)
    //          "query: q.q"     = creation from AI/static (no enrichment to preserve)
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comments
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;

      // Only match "query: q.query" (transformations), not "query: q.q" (creations)
      if (/query:\s*q\.query/.test(line)) {
        // Scan the surrounding block (up to 20 lines forward) for enrichment fields
        const blockStart = Math.max(0, i - 5);
        const blockEnd = Math.min(lines.length, i + 25);
        const block = lines.slice(blockStart, blockEnd).join('\n');

        // Only check if this looks like a question object mapping (has persona, stage)
        if (/persona/.test(block) && /stage/.test(block)) {
          // Check for each enrichment field
          const missingFields = ENRICHMENT_FIELDS.filter(f => {
            // Check if the field appears in the block as a property assignment
            return !new RegExp(f + '\\s*:').test(block);
          });

          if (missingFields.length > 0) {
            issues.push({
              line: i + 1,
              missing: missingFields,
              context: lines[i].trim().substring(0, 80),
            });
          }
        }
      }
    }

    if (issues.length > 0) {
      throw new Error(
        `Found question TRANSFORMATION mappings MISSING enrichment fields in QuestionGenerator.jsx:\n` +
        issues.map(iss =>
          `  Line ${iss.line}: missing [${iss.missing.join(', ')}]\n    ${iss.context}`
        ).join('\n\n')
      );
    }
  });

  it('seed script includes all enrichment fields in pipeline mapping', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'seed_local.cjs'), 'utf8');
    const missing = ENRICHMENT_FIELDS.filter(f => !src.includes(f));
    if (missing.length > 0) {
      throw new Error(`seed_local.cjs is missing enrichment fields: ${missing.join(', ')}`);
    }
  });
});
