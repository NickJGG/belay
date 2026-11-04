// What is reviewed and by whom: the file gate, the size tier and the reviewer set.
import { DEFAULT_MAX_FILE_DIFF_BYTES, classesFor, extOf, matchPrefix, noiseMatch, normalizePath, secretPattern } from './files.mjs';

// Gate order: secret first, so neither --paths nor --exclude nor being binary can hide a
// credential file (its contents are never read). Then --paths narrows the target (files outside
// it are dropped, not listed), binary, --exclude (user_rule), lockfile/vendored/generated noise (a
// --paths prefix rescues a file from these). Oversized files stay reviewable and are also listed
// in `oversized`. Deleted files stay reviewable: a deletion can be the whole bug.
export function selectFiles(records, { paths = [], exclude = [], maxBytes = DEFAULT_MAX_FILE_DIFF_BYTES } = {}) {
  const out = { reviewable: [], excluded: [], secrets: [], oversized: [] };
  for (const record of records) {
    const path = normalizePath(record.path);
    if (secretPattern(path)) { out.secrets.push(path); continue; }
    const inPaths = matchPrefix(paths, path) !== null;
    if (paths.length && !inPaths) continue;

    let reason = null;
    if (record.insertions == null) reason = 'binary';
    else if (matchPrefix(exclude, path) !== null) reason = 'user_rule';
    else if (!inPaths) reason = noiseMatch(path)?.reason ?? null;
    if (reason) { out.excluded.push({ path, reason }); continue; }

    const bytes = record.bytes ?? 0;
    if (bytes > maxBytes) out.oversized.push(path);
    out.reviewable.push({ path, status: record.status ?? null, ext: extOf(path), bytes, classes: classesFor(path, record.status, record.diff) });
  }
  return out;
}

export const TIERS = ['small', 'medium', 'large'];
export const QUALITY_AREAS = ['01-standards', '03-dry-smells', '04-consistency-history', '05-simplification'];
const BUG_REVIEWERS = new Set(['02-bugs-security', '06-security-deep-dive', '07-performance', '09-api-contract']);
const BUDGET = {
  bug: { min: 10, perKb: 0.15, max: 30 },
  quality: { min: 12, perKb: 0.1, max: 25 },
  other: { min: 8, perKb: 0.08, max: 15 },
};

// Starting points to tune against the evals. Diff mode weighs changed lines of code and config;
// snapshot mode weighs whole-file lines, which is why its limits sit higher.
const LIMITS = {
  diff: { small: 400, medium: 5000 },
  snapshot: { small: 1500, medium: 15000 },
};

export function tierFor(mode, weight) {
  const { small, medium } = LIMITS[mode];
  return weight <= small ? 'small' : weight <= medium ? 'medium' : 'large';
}

const has = (entry, ...wanted) => wanted.some((c) => entry.classes.includes(c));
export const isLogic = (entry) => has(entry, 'code') && !has(entry, 'test');

function kind(id) {
  return BUG_REVIEWERS.has(id) ? 'bug' : id === 'quality' ? 'quality' : 'other';
}

export function budgetFor(id, bytes) {
  const { min, perKb, max } = BUDGET[kind(id)];
  return Math.min(max, Math.round(min + (bytes / 1024) * perKb));
}

function passesFor(id, tier, override) {
  if (!BUG_REVIEWERS.has(id)) return 1;
  return override ?? (tier === 'small' ? 1 : 2);
}

function filesWith(entries, predicate, whyNot) {
  const files = entries.filter(predicate).map((e) => e.path);
  return files.length ? { files, reason: null } : { files: [], reason: whyNot };
}

// entries: reviewable records with classes, mechanical ones already taken out. `mechanical` keeps
// a quality reviewer on when a change is nothing but moves, so someone still reads the summary.
export function decideReviewers(entries, { tier = 'medium', quality = 'merged', passes, extra = [], skip = [], mechanical = false } = {}) {
  const all = entries.map((e) => e.path);
  const decisions = {};
  decisions['02-bugs-security'] = filesWith(entries, (e) => has(e, 'code', 'data'), 'no code or config files');
  // Any change to source logic may lack a test, so test quality looks at code, not only at test files.
  decisions['08-test-quality'] = filesWith(entries, (e) => has(e, 'test') || (has(e, 'code') && e.status !== 'D'), 'no source logic or test files added or modified');
  decisions['07-performance'] = filesWith(entries, (e) => isLogic(e) && e.status !== 'D', 'no source logic added or modified');
  decisions['06-security-deep-dive'] = filesWith(entries, (e) => has(e, 'security'), 'no files with class security');
  decisions['09-api-contract'] = filesWith(entries, (e) => has(e, 'contract'), 'no files with class contract');
  decisions['10-a11y-i18n'] = filesWith(entries, (e) => has(e, 'ui', 'i18n'), 'no files with class ui or i18n');

  const qualityFiles = all.length || mechanical ? { files: all, reason: null } : { files: [], reason: 'no reviewable files' };
  if (quality === 'split') for (const id of QUALITY_AREAS) decisions[id] = qualityFiles;
  else decisions.quality = qualityFiles;

  for (const id of extra) decisions[id] = { files: all, reason: null };
  for (const id of skip) decisions[id] = { files: [], reason: 'skipped by --skip' };
  if (!entries.length && !mechanical) for (const id of Object.keys(decisions)) decisions[id] = { files: [], reason: 'no reviewable files' };

  const logic = new Set(entries.filter(isLogic).map((e) => e.path));
  return Object.fromEntries(Object.keys(decisions).sort().map((id) => {
    const { files, reason } = decisions[id];
    const spawn = files.length > 0 || (mechanical && (id === 'quality' || id === '04-consistency-history') && reason === null);
    const second = passesFor(id, tier, passes) > 1 ? files.filter((f) => logic.has(f)) : [];
    return [id, {
      spawn,
      files,
      reason,
      model: BUG_REVIEWERS.has(id) ? 'opus' : 'sonnet',
      passes: second.length ? passesFor(id, tier, passes) : 1,
      secondPassFiles: second,
    }];
  }));
}

export function personasFor(id) {
  return id === 'quality' ? ['quality.md', ...QUALITY_AREAS.map((a) => `${a}.md`)] : [`${id}.md`];
}

// Calibrated on one measured reviewer (Opus, 384 KB diff, budget 30): 8.3M cache-read tokens,
// about 1.5 turns per budgeted call, 29k of base context, 2.5k added per call. An order of
// magnitude for a preview, not a prediction.
export function estimateTokens(bytes, budget) {
  const turns = budget * 1.5;
  return Math.round(turns * (29000 + bytes / 4 + budget * 2500));
}
