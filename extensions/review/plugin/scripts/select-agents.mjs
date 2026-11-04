#!/usr/bin/env node
// select-agents: decides which reviewers spawn, on which files, with which model and passes.
// plan.mjs uses the same logic and writes the packet; this is the same decision on its own.
//
// stdin: select-files output ({reviewable:[…]}), or a bare array of records or paths; entries
// without `classes` are classified from their path.
// stdout: {agents:{<id>:{spawn, files, reason, model, passes, secondPassFiles, budget, chunks:[[file]]}}}
// `reason` is null for a spawned agent. `budget` is for the whole file set.
import { chunksInPathOrder } from './lib/chunk.mjs';
import { classesFor, normalizePath, splitCsv } from './lib/files.mjs';
import { args, emit, fail, readStdinJson } from './lib/cli.mjs';
import { TIERS, budgetFor, decideReviewers } from './lib/select.mjs';

const NAME = 'select-agents';

function toEntries(payload) {
  const list = Array.isArray(payload) ? payload : payload?.reviewable;
  if (!Array.isArray(list)) return null;
  const entries = [];
  for (const item of list) {
    const record = typeof item === 'string' ? { path: item } : item;
    if (!record || typeof record.path !== 'string') return null;
    const path = normalizePath(record.path);
    entries.push({ ...record, path, classes: Array.isArray(record.classes) ? record.classes : classesFor(path, record.status) });
  }
  return entries;
}

function main() {
  const { values } = args(NAME, {
    tier: { type: 'string', default: 'medium' },
    quality: { type: 'string', default: 'merged' },
    extra: { type: 'string', default: '' },
    skip: { type: 'string', default: '' },
  });
  if (!TIERS.includes(values.tier)) fail(NAME, `--tier must be one of ${TIERS.join(', ')}`);
  const entries = toEntries(readStdinJson(NAME));
  if (!entries) fail(NAME, 'expected select-files output ({reviewable:[…]}) or an array of records with a path');

  const decisions = decideReviewers(entries, { tier: values.tier, quality: values.quality, extra: splitCsv(values.extra), skip: splitCsv(values.skip) });
  const bytesOf = new Map(entries.map((e) => [e.path, e.bytes ?? 0]));
  const agents = Object.fromEntries(Object.entries(decisions).map(([id, d]) => {
    const units = d.files.map((path) => ({ path, bytes: bytesOf.get(path) ?? 0 }));
    const total = units.reduce((n, u) => n + u.bytes, 0);
    return [id, { ...d, budget: budgetFor(id, total), chunks: chunksInPathOrder(units).map((c) => c.units.map((u) => u.path)) }];
  }));
  emit({ agents });
}

main();
