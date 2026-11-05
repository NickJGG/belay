#!/usr/bin/env node
/* Course overview for sessions and /learn:status; formats are in references/formats.md.
   usage: node courses.js [<course>] [--date YYYY-MM-DD]
          node courses.js read <course> <source-id> [--undo]
   No <course>: every folder under $LEARNING_ROOT (default ~/Learning) that has a course.md.
   The overview prints a JSON array (one object with <course>); `read` marks a source's
   reading lines done (todo with --undo) in every unit. Exits 1 on error. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cards = require('./cards');
const { today } = require('./fsrs');

const root = () => process.env.LEARNING_ROOT || path.join(os.homedir(), 'Learning');
const readIf = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const READ_LINE = /^- \[[ x]\] read · (\S+) · (todo|done) · (.*?) · (.*?)\s*$/;

/* Only the YAML subset course.md uses: scalars, [a, b] lists, one level of nesting. */
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  let parent = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\s*)([\w-]+):\s*("[^"]*"|'[^']*'|.*?)(\s+#.*)?$/);
    if (!kv) continue;
    const [indent, key, raw] = [kv[1], kv[2], kv[3].trim()];
    const value = /^\[.*\]$/.test(raw)
      ? raw.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : raw.replace(/^["']|["']$/g, '');
    if (indent && parent) out[parent][key] = value;
    else if (raw === '') out[(parent = key)] = {};
    else { out[key] = value; parent = null; }
  }
  return out;
}

function syllabus(text) {
  const units = [];
  for (const line of text.split(/\r?\n/)) {
    let m;
    const u = units[units.length - 1];
    if ((m = line.match(/^## Unit (\d+) · (.*?)\s*$/))) units.push({ n: +m[1], title: m[2], topics: [], checkpoint: null, reading: [], items: [] });
    else if (!u) continue;
    else if ((m = line.match(READ_LINE))) {
      const r = { source: m[1], status: m[2], label: m[3], sections: m[4].split(/\s*;\s*/).filter(Boolean) };
      u.reading.push(r);
      u.items.push({ kind: 'read', ...r });
    } else if ((m = line.match(/^- \[[ x]\] (\S+) · (todo|in-progress|done)\s*$/))) {
      const t = { topic: m[1], status: m[2] };
      u.topics.push(t);
      u.items.push({ kind: 'topic', ...t });
    } else if ((m = line.match(/^- checkpoint \d+ · (pending|pass|partial|fail)(?: (\S+) (\d+)%)?/))) {
      u.checkpoint = { result: m[1], date: m[2] || null, score: m[3] ? +m[3] : null };
      u.items.push({ kind: 'checkpoint', ...u.checkpoint });
    }
  }
  return units;
}

function parseLog(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    let m;
    const e = entries[entries.length - 1];
    if ((m = line.match(/^## (\d{4}-\d{2}-\d{2}) · (\w+)(?: · (\d{2}:\d{2}))?/))) {
      entries.push({ date: m[1], time: m[3] || null, kind: m[2], topics: [], quiz: null, cardsReviewed: null, cardsAdded: null, ended: null, skipped: '' });
    } else if (!e) continue;
    else if ((m = line.match(/^- topics: (.*?)\s*$/))) e.topics = m[1].split(/\s*,\s*/).filter(Boolean);
    else if ((m = line.match(/^- quiz: (\d+\/\d+)/))) e.quiz = m[1];
    else if ((m = line.match(/^- cards: (\d+) reviewed/))) e.cardsReviewed = +m[1];
    else if ((m = line.match(/^- cards added: (\d+)/))) e.cardsAdded = +m[1];
    else if ((m = line.match(/^- ended: (complete|early)/))) e.ended = m[1];
    else if ((m = line.match(/^- skipped: (.*)/))) e.skipped = m[1];
  }
  // Entries from before `ended:` was logged say why they stopped in `skipped:`.
  return entries.map(({ skipped, ...e }) => ({ ...e, ended: e.ended || (/\b(stop|abandon)/i.test(skipped) ? 'early' : 'complete') }));
}

const sessions = dir => parseLog(readIf(path.join(dir, 'log.md')));

function lastSession(text) {
  const all = parseLog(text);
  const s = all[all.length - 1];
  return s ? { date: s.date, kind: s.kind } : null;
}

/* In-progress before todo, looking first in the unit of the newest logged session that names one of `topics` (a
   lesson's topic, or a checkpoint's whole unit), then the units after it, then the whole course. A learner who
   skipped ahead stays there, even with an earlier unit's topic left in progress. */
function nextTopic(topics, log) {
  const pick = list => list.find(t => t.status === 'in-progress') || list.find(t => t.status === 'todo');
  const unitOf = new Map(topics.map(t => [t.topic, t.unit]));
  const recent = log.findLast(s => s.topics.some(t => unitOf.has(t)));
  const from = recent ? unitOf.get(recent.topics.find(t => unitOf.has(t))) : 0;
  return pick(topics.filter(t => t.unit === from)) || pick(topics.filter(t => t.unit > from)) || pick(topics) || null;
}

const tidy = slug => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

/* Topic slug → its knowledge file's `#` heading; topics not built yet get a tidied slug. */
function titles(dir) {
  const out = {};
  for (const u of syllabus(readIf(path.join(dir, 'syllabus.md')))) for (const t of u.topics) out[t.topic] = tidy(t.topic);
  const kdir = path.join(dir, 'knowledge');
  if (fs.existsSync(kdir)) {
    for (const f of fs.readdirSync(kdir).filter(f => f.endsWith('.md'))) {
      const h = readIf(path.join(kdir, f)).match(/^# (.+?)\s*$/m);
      if (h) out[f.slice(0, -3)] = h[1];
    }
  }
  return out;
}

const HARD = ['apply', 'analyse', 'transfer'];
const RUNG = '(?:alone|nudge|hint|partial|shown)';
const EXERCISE_LINE = new RegExp(`^- e(\\d+) · (${RUNG}(?:, ${RUNG})*)\\b`, 'gm');
/* Parts not given away: alone, nudge or hint. */
const kept = parts => parts.filter(p => p !== 'partial' && p !== 'shown').length;
const keptShare = parts => kept(parts) / parts.length;

/* A topic's lesson notes in order: `<date>-<topic>.md`, then a same-day `<date>-<topic>-<n>.md`. */
function topicNotes(ldir, topic) {
  if (!fs.existsSync(ldir)) return [];
  const name = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})-${escape(topic)}(?:-(\\d+))?\\.md$`);
  return fs.readdirSync(ldir)
    .map(f => ({ f, m: f.match(name) }))
    .filter(x => x.m)
    .sort((a, b) => a.m[1].localeCompare(b.m[1]) || Number(a.m[2] || 1) - Number(b.m[2] || 1))
    .map(x => x.f);
}

/* The criteria /learn:learn's Close sets a topic done by: quiz 4/5 or better, and an apply-or-harder exercise with at
   least half its parts not given away. `exercises` lists those harder exercises, each with the parts of its best
   attempt across the topic's lesson notes (most parts kept; the later note on a tie), and `steps`, the number of parts
   its worked solution has (its top-level numbered steps, or 1). */
function progress(dir, topic) {
  const kinds = {};
  const steps = {};
  for (const sec of readIf(path.join(dir, 'exercises', `${topic}.md`)).split(/^(?=## e\d+ · )/m)) {
    const m = sec.match(/^## e(\d+) · (\w+)/);
    if (!m) continue;
    kinds[m[1]] = m[2];
    const solution = sec.slice(Math.max(0, sec.indexOf('<details>')));
    steps[m[1]] = (solution.match(/^\d+\. /gm) || []).length || 1;
  }
  const ldir = path.join(dir, 'lessons');
  const best = {};
  for (const f of topicNotes(ldir, topic)) {
    for (const m of readIf(path.join(ldir, f)).matchAll(EXERCISE_LINE)) {
      const parts = m[2].split(', ');
      if (!best[m[1]] || keptShare(parts) >= keptShare(best[m[1]])) best[m[1]] = parts;
    }
  }
  const exercises = Object.keys(kinds)
    .filter(n => HARD.includes(kinds[n]))
    .map(n => ({ n: Number(n), kind: kinds[n], steps: steps[n], parts: best[n] || null }))
    .sort((a, b) => a.n - b.n);
  const practised = exercises.some(e => e.parts && kept(e.parts) * 2 >= e.parts.length);
  const quizzes = sessions(dir).filter(s => s.quiz && s.topics.includes(topic));
  const lastQuiz = quizzes.length ? quizzes[quizzes.length - 1].quiz : null;
  const [got, of] = lastQuiz ? lastQuiz.split('/').map(Number) : [0, 1];
  return { practised, lastQuiz, quizOk: got / of >= 0.8, exercises };
}

function overview(course, date) {
  const dir = cards.courseDir(course);
  const fm = frontmatter(readIf(path.join(dir, 'course.md')));
  const all = syllabus(readIf(path.join(dir, 'syllabus.md')));
  // Builds from before per-unit readiness have no `ready`; accepted meant every unit.
  const ready = Array.isArray(fm.ready) ? fm.ready.map(Number)
    : fm.build === 'accepted' ? all.map(u => u.n) : [];
  const units = all.filter(u => ready.includes(u.n));
  const topics = units.flatMap(u => u.topics.map(t => ({ ...t, unit: u.n })));
  const pick = r => ({ source: r.source, status: r.status, label: r.label, sections: r.sections });
  const next = nextTopic(topics, sessions(dir));
  if (next) {
    const items = units.find(u => u.n === next.unit).items;
    const at = items.findIndex(i => i.kind === 'topic' && i.topic === next.topic);
    const r = items.slice(0, at).find(i => i.kind === 'read' && i.status === 'todo');
    if (r) next.reading = pick(r);
  }
  const open = units.find(u => !u.checkpoint || u.checkpoint.result !== 'pass');
  // A read-after unit's reading follows its topics, so once they're done it rides on the checkpoint instead.
  const lastTopic = open ? open.items.map(i => i.kind).lastIndexOf('topic') : -1;
  const after = open && open.topics.every(t => t.status === 'done') && open.items.slice(lastTopic + 1).find(i => i.kind === 'read' && i.status === 'todo');
  return {
    course: path.basename(path.resolve(dir)),
    goal: fm.goal || null,
    build: fm.build || null,
    ready,
    unbuilt: all.map(u => u.n).filter(n => !ready.includes(n)),
    traits: fm.traits || [],
    cards: cards.stats(dir, date),
    topics: { done: topics.filter(t => t.status === 'done').length, total: topics.length },
    next,
    last: lastSession(readIf(path.join(dir, 'log.md'))),
    units,
    titles: titles(dir),
    checkpoint: open ? {
      unit: open.n,
      title: open.title,
      result: open.checkpoint ? open.checkpoint.result : 'pending',
      left: open.topics.filter(t => t.status !== 'done').map(t => t.topic),
      due: open.topics.every(t => t.status === 'done'),
      ...(after ? { reading: pick(after) } : {}),
    } : null,
  };
}

function all(date) {
  const r = root();
  if (!fs.existsSync(r)) throw new Error(`no learning root: ${r}`);
  return fs.readdirSync(r, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(r, e.name, 'course.md')))
    .map(e => overview(path.join(r, e.name), date));
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Rewrites only the matched prefixes, so line endings and every other byte survive. */
function read(course, source, undo) {
  const file = path.join(cards.courseDir(course), 'syllabus.md');
  const raw = readIf(file);
  const units = syllabus(raw).filter(u => u.reading.some(r => r.source === source)).map(u => u.n);
  if (!units.length) throw new Error(`no reading line for ${source}`);
  const status = undo ? 'todo' : 'done';
  const line = new RegExp(`^- \\[[ x]\\] read · ${escape(source)} · (?:todo|done)(?= · )`, 'gm');
  fs.writeFileSync(file, raw.replace(line, `- [${undo ? ' ' : 'x'}] read · ${source} · ${status}`));
  return { source, units, status };
}

module.exports = { frontmatter, syllabus, parseLog, sessions, lastSession, titles, progress, overview, all, read };

if (require.main === module) {
  const args = process.argv.slice(2);
  const di = args.indexOf('--date');
  const date = di >= 0 ? args.splice(di, 2)[1] : today();
  const ui = args.indexOf('--undo');
  const undo = ui >= 0 && args.splice(ui, 1).length > 0;
  const [cmd, course, ...rest] = args;
  const need = { read: 1 };
  if (cmd in need && (!course || rest.length < need[cmd])) {
    console.log('usage: node courses.js [<course>] [--date YYYY-MM-DD] | read <course> <source-id> [--undo]');
    process.exit(2);
  }
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date: ${date}`);
    const run = { read: () => read(course, rest[0], undo) };
    console.log(JSON.stringify(cmd in run ? run[cmd]() : cmd ? [overview(cmd, date)] : all(date), null, 1));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
