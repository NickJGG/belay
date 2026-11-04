#!/usr/bin/env node
// tally: the finding counts of a review report.
//
// Usage: tally.mjs [--source] [REPORT_FILE] (stdin when no file is given).
// stdout: {critical, important, debt, suggested, question, unverified, plausible}, plus
// `source` with --source: "comment" (the report's `<!-- review-tally: {...} -->` line,
// the last one wins) or "sections" (recovered from headings and finding lines when the comment
// is missing or malformed). A recovered count is a repair, not proof the report obeyed the
// template. Exit 1 when neither source is there, 2 on bad usage.
//
// Section recovery: a heading names its tier by glyph (🔴 🟠 🟡 🔵 ⚪, exactly one) or is
// Unverified/🔬 or Plausible; Refuted, Already there, Dependencies, Checks and Scope count
// nothing. Sub-headings inherit their parent's tier. A finding is a `**#N**` line, or, in a
// report without those, a top-level list item. A finding's own `[🟠 IMPORTANT …]` tag decides
// its tier; in a section with no tier (such as Quality) an untagged finding counts nothing.
import { readFileSync } from 'node:fs';
import { args, emit, fail, readStdin } from './lib/cli.mjs';

const NAME = 'tally';
const KEYS = ['critical', 'important', 'debt', 'suggested', 'question', 'unverified', 'plausible'];
const GLYPHS = { '🔴': 'critical', '🟠': 'important', '🟡': 'debt', '🔵': 'suggested', '⚪': 'question' };
const SKIPPED = ['refuted', 'already there', 'dependencies', 'checks', 'scope', 'verdict'];

const COMMENT_RE = /review-tally:\s*(\{.*?\})\s*-->/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const NUMBERED_RE = /^\s*(?:[-*]\s+|\d+[.)]\s+)?\*\*#\d+\*\*/;
const LIST_RE = /^(?:[-*]|\d+[.)])\s+(.*)$/;
const TAG_RE = /\[\s*(🔴|🟠|🟡|🔵|⚪)/u;

function zero() {
  return Object.fromEntries(KEYS.map((k) => [k, 0]));
}

function fromComment(text) {
  const matches = [...text.matchAll(COMMENT_RE)];
  if (!matches.length) return null;
  let parsed;
  try {
    parsed = JSON.parse(matches.at(-1)[1]);
  } catch {
    return null;
  }
  const counts = zero();
  for (const k of KEYS) counts[k] = Number.parseInt(parsed[k] ?? 0, 10) || 0;
  return counts;
}

function classifyHeading(title) {
  const lowered = title.toLowerCase();
  if (lowered.includes('unverified') || title.includes('🔬')) return 'unverified';
  if (lowered.includes('plausible')) return 'plausible';
  if (SKIPPED.some((s) => lowered.includes(s))) return 'skip';
  const tiers = Object.keys(GLYPHS).filter((g) => title.includes(g));
  return tiers.length === 1 ? GLYPHS[tiers[0]] : undefined;
}

function fromSections(text) {
  const lines = text.split(/\r?\n/);
  const numbered = lines.some((l) => NUMBERED_RE.test(l));
  const counts = zero();
  const stack = [];
  let seen = false;
  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      const own = classifyHeading(heading[2]);
      if (own && own !== 'skip') seen = true;
      stack.push({ level, mode: own ?? stack.at(-1)?.mode ?? 'any' });
      continue;
    }
    const mode = stack.at(-1)?.mode ?? null;
    if (!mode || mode === 'skip') continue;
    let entry;
    if (numbered) entry = NUMBERED_RE.test(line);
    else {
      const item = LIST_RE.exec(line);
      entry = Boolean(item) && !/^(?:none|no findings)\b/i.test(item[1]);
    }
    if (!entry) continue;
    if (mode === 'unverified' || mode === 'plausible') counts[mode]++;
    else {
      const tier = GLYPHS[TAG_RE.exec(line)?.[1]] ?? (mode === 'any' ? null : mode);
      if (tier) counts[tier]++;
    }
  }
  return seen ? counts : null;
}

function main() {
  const { values, positionals } = args(NAME, { source: { type: 'boolean', default: false } }, true);
  if (positionals.length > 1) fail(NAME, 'usage: tally.mjs [--source] [REPORT_FILE]');
  let text;
  if (positionals.length) {
    try {
      text = readFileSync(positionals[0], 'utf8');
    } catch (err) {
      fail(NAME, `cannot read ${positionals[0]}: ${err.message}`);
    }
  } else text = readStdin();

  for (const [source, fn] of [['comment', fromComment], ['sections', fromSections]]) {
    const counts = fn(text);
    if (counts) return emit(values.source ? { ...counts, source } : counts);
  }
  fail(NAME, 'no tally recoverable: no tally comment and no severity sections', 1);
}

main();
