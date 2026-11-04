#!/usr/bin/env node
// campaign: a whole-codebase review spread over sessions. The ledger is plain files outside the
// reviewed repo, in Belay's data dir ($BELAY_DATA, else ~/Belay): reviews/campaigns/<repo>-<hash>/.
// It holds coverage and findings only: it is never used to suppress a finding in a later run.
//
//   init [--repo d] [--paths a,b] [--exclude x,y] [--force]   map modules, riskiest first
//   status [--repo d]                                         progress, and whether HEAD moved
//   next [--repo d]                                           the next pending unit, or the cross-module step
//   record --unit <name> --merged <file> [--repo d]           store a finished unit's merged.json
//   rollup [--repo d]                                         every finding so far, merged by root cause
//
// Every command prints JSON.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { splitCsv } from './lib/files.mjs';
import { args, emit, fail } from './lib/cli.mjs';
import { reviewsHome } from './lib/data.mjs';
import { dedupe } from './lib/dedupe.mjs';
import { listModules } from './lib/modules.mjs';
import { git, repoRoot } from './lib/repo.mjs';

const NAME = 'campaign';
// About what one session's reviewers can hold; a snapshot under this stays below the large tier.
const MAX_UNIT_BYTES = 400000;
const MIN_UNIT_BYTES = 60000;
const SECURITY_WEIGHT = 10;
const SMALL_UNITS = '(small modules)';
const CROSS_MODULE = '(cross-module)';

function campaignDir(root) {
  const hash = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 10);
  return join(reviewsHome(), 'campaigns', `${basename(root)}-${hash}`);
}

// Splits at the next folder level until each unit fits. Loose files stay together as "(files)".
function splitUnit(name, dir, files) {
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  if (bytes <= MAX_UNIT_BYTES) return [{ name, dir, files, bytes }];
  const prefix = dir === '.' ? '' : `${dir}/`;
  const groups = new Map();
  for (const f of files) {
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    const key = slash === -1 ? '' : rest.slice(0, slash);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  if (groups.size === 1 && groups.has('')) {
    // One flat folder over the limit: split by size, keeping path order.
    const pieces = [];
    let current = [];
    let size = 0;
    for (const f of files) {
      if (current.length && size + f.bytes > MAX_UNIT_BYTES) { pieces.push(current); current = []; size = 0; }
      current.push(f);
      size += f.bytes;
    }
    if (current.length) pieces.push(current);
    return pieces.map((p, i) => ({ name: `${name} (${i + 1}/${pieces.length})`, dir, files: p, bytes: p.reduce((n, f) => n + f.bytes, 0) }));
  }
  return [...groups].flatMap(([key, list]) => (key === ''
    ? [{ name: `${name}/(files)`, dir, files: list, bytes: list.reduce((n, f) => n + f.bytes, 0) }]
    : splitUnit(`${prefix}${key}`, `${prefix}${key}`, list)));
}

// Risk signal only, for ordering: commits touching a file, double-counted when the subject reads
// like a fix. Every unit still gets reviewed.
function fileHeat(root) {
  const log = git(root, '-c', 'core.quotePath=false', 'log', '--since=1.year.ago', '--no-merges', '--name-only', '--format=%x01%s') ?? '';
  const heat = new Map();
  for (const entry of log.split('\x01').filter(Boolean)) {
    const [subject, ...paths] = entry.split('\n');
    const weight = /\b(fix|bug|crash|regress|hotfix|broken)/i.test(subject) ? 3 : 1;
    for (const p of paths) if (p) heat.set(p, (heat.get(p) ?? 0) + weight);
  }
  return heat;
}

function buildUnits(root, paths, exclude) {
  const { modules, excluded } = listModules(root, { paths, exclude });
  const all = modules.flatMap((m) => splitUnit(m.name, m.dir, m.files));
  const small = all.filter((u) => u.bytes < MIN_UNIT_BYTES);
  const units = all.filter((u) => u.bytes >= MIN_UNIT_BYTES);
  // Small modules share a session rather than each costing one.
  const bins = [];
  for (const u of small) {
    const bin = bins.find((b) => b.bytes + u.bytes <= MAX_UNIT_BYTES);
    if (bin) { bin.files.push(...u.files); bin.bytes += u.bytes; bin.names.push(u.name); }
    else bins.push({ files: [...u.files], bytes: u.bytes, names: [u.name] });
  }
  for (const [i, bin] of bins.entries()) {
    if (bin.names.length === 1) units.push({ name: bin.names[0], dir: '.', files: bin.files, bytes: bin.bytes });
    else units.push({ name: bins.length > 1 ? `${SMALL_UNITS} ${i + 1}` : SMALL_UNITS, dir: '.', files: bin.files, bytes: bin.bytes });
  }
  const heat = fileHeat(root);
  const ranked = units.map((u) => ({
    name: u.name,
    dir: u.dir,
    files: u.files.map((f) => f.path),
    bytes: u.bytes,
    heat: u.files.reduce((n, f) => n + (heat.get(f.path) ?? 0), 0),
    security: u.files.filter((f) => f.classes.includes('security')).length,
    status: 'pending',
    finishedAt: null,
  }));
  const risk = (u) => u.heat + u.security * SECURITY_WEIGHT;
  ranked.sort((a, b) => risk(b) - risk(a) || a.name.localeCompare(b.name));
  return { units: ranked, excluded };
}

function load(dir) {
  const path = join(dir, 'campaign.json');
  if (!existsSync(path)) fail(NAME, 'no campaign for this repo yet: run init', 3);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function save(dir, campaign) {
  writeFileSync(join(dir, 'campaign.json'), `${JSON.stringify(campaign, null, 2)}\n`);
}

function changedSince(root, head) {
  const now = git(root, 'rev-parse', 'HEAD')?.trim() ?? null;
  if (!now || now === head) return { head: now, moved: false, changed: [] };
  const diff = git(root, '-c', 'core.quotePath=false', 'diff', '--name-only', head, now) ?? '';
  return { head: now, moved: true, changed: diff.split('\n').filter(Boolean) };
}

function summary(campaign, dir, root) {
  const done = campaign.units.filter((u) => u.status === 'done').length;
  const drift = changedSince(root, campaign.head);
  return {
    dir,
    map: join(dir, 'map.md'),
    startedAt: campaign.startedAt,
    head: campaign.head,
    units: campaign.units.length,
    done,
    pending: campaign.units.length - done,
    crossModuleDone: campaign.crossModuleDone,
    // Finished units whose files changed since the campaign began: their results may be stale.
    stale: campaign.units.filter((u) => u.status === 'done' && u.files.some((f) => drift.changed.includes(f))).map((u) => u.name),
    headMoved: drift.moved,
  };
}

function nextUnit(campaign) {
  const unit = campaign.units.find((u) => u.status === 'pending');
  if (unit) return { kind: 'unit', name: unit.name, paths: unit.files, bytes: unit.bytes, position: campaign.units.indexOf(unit) + 1, of: campaign.units.length };
  if (!campaign.crossModuleDone) return { kind: 'cross-module', name: CROSS_MODULE, paths: [] };
  return { kind: 'finished', name: null, paths: [] };
}

function unitFile(dir, name) {
  return join(dir, 'findings', `${name.replace(/[\\/]/g, '__').replace(/[^\w.@() -]/g, '_')}.json`);
}

function main() {
  const command = process.argv[2];
  process.argv.splice(2, 1);
  const { values } = args(NAME, {
    repo: { type: 'string', default: '.' },
    paths: { type: 'string', default: '' },
    exclude: { type: 'string', default: '' },
    force: { type: 'boolean', default: false },
    unit: { type: 'string' },
    merged: { type: 'string' },
  });
  const root = repoRoot(resolve(values.repo));
  if (!root) fail(NAME, `not a git repository: ${resolve(values.repo)}`);
  const dir = campaignDir(root);

  if (command === 'init') {
    if (existsSync(join(dir, 'campaign.json')) && !values.force) fail(NAME, `a campaign already exists in ${dir}; resume it, or pass --force to start over`, 3);
    mkdirSync(join(dir, 'findings'), { recursive: true });
    const { units, excluded } = buildUnits(root, splitCsv(values.paths), splitCsv(values.exclude));
    const campaign = {
      root,
      head: git(root, 'rev-parse', 'HEAD')?.trim() ?? null,
      startedAt: new Date().toISOString(),
      units,
      excluded,
      crossModuleDone: false,
    };
    save(dir, campaign);
    return emit({ ...summary(campaign, dir, root), order: units.map((u) => ({ name: u.name, files: u.files.length, bytes: u.bytes, heat: u.heat, security: u.security })), excluded });
  }

  const campaign = load(dir);
  if (command === 'status') return emit({ ...summary(campaign, dir, root), next: nextUnit(campaign).name });
  if (command === 'next') return emit({ ...nextUnit(campaign), status: summary(campaign, dir, root) });
  if (command === 'record') {
    if (!values.unit || !values.merged) fail(NAME, 'record needs --unit <name> and --merged <file>');
    const findings = JSON.parse(readFileSync(values.merged, 'utf8'));
    if (!Array.isArray(findings)) fail(NAME, '--merged must hold a JSON array');
    writeFileSync(unitFile(dir, values.unit), JSON.stringify(findings, null, 2));
    if (values.unit === CROSS_MODULE) {
      campaign.crossModuleDone = true;
    } else {
      const unit = campaign.units.find((u) => u.name === values.unit);
      if (!unit) fail(NAME, `no unit named ${values.unit}`);
      unit.status = 'done';
      unit.finishedAt = new Date().toISOString();
    }
    save(dir, campaign);
    return emit({ recorded: values.unit, findings: findings.length, next: nextUnit(campaign).name });
  }
  if (command === 'rollup') {
    const findings = [...campaign.units.map((u) => u.name), CROSS_MODULE].flatMap((name) => {
      const path = unitFile(dir, name);
      return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    });
    const groups = dedupe(findings.filter((f) => typeof f.root_cause_key === 'string' && f.root_cause_key));
    const path = join(dir, 'rollup.json');
    writeFileSync(path, JSON.stringify(groups, null, 2));
    const pending = campaign.units.filter((u) => u.status !== 'done').map((u) => u.name);
    return emit({ rollup: path, groups: groups.length, findings: findings.length, pending, crossModuleDone: campaign.crossModuleDone, excluded: campaign.excluded });
  }
  fail(NAME, 'usage: campaign.mjs init|status|next|record|rollup');
}

main();
