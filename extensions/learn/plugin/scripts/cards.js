#!/usr/bin/env node
/* Card store for a course; the format is in references/formats.md ("Cards").
   usage: node cards.js due   <course> [--date YYYY-MM-DD]
          node cards.js grade <course> <id> again|hard|good|easy [--date YYYY-MM-DD]
          node cards.js add   <course> <file> [--date YYYY-MM-DD]
          node cards.js edit  <course> <file>
          node cards.js stats <course> [--date YYYY-MM-DD]
   <course> is a folder path, or a name under $LEARNING_ROOT (default ~/Learning).
   Prints JSON; exits 1 on error. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { schedule, today, toDay } = require('./fsrs');

const HEAD = /^### (c-\d{4,}) · (.*?)\s*$/m;
const FSRS = /<!-- fsrs (\{.*?\}) -->/;
const NEW_STATE = due => ({ due, s: 0, d: 0, reps: 0, lapses: 0, last: null, state: 'new' });

/* A block keeps its raw text so writing an unchanged file reproduces it byte for byte. */
function parse(text) {
  const parts = text.split(/^(?=### )/m);
  const preamble = parts[0].startsWith('### ') ? '' : parts.shift();
  const cards = parts.map(raw => {
    const head = raw.match(HEAD);
    const fsrs = raw.match(FSRS);
    if (!head || !fsrs) throw new Error(`malformed card: ${raw.split(/\r?\n/)[0]}`);
    const body = raw.slice(head.index + head[0].length, fsrs.index);
    const qa = body.match(/^Q:([\s\S]*?)^A:([\s\S]*)/m);
    return {
      raw,
      id: head[1],
      topic: head[2],
      q: qa ? qa[1].trim() : '',
      a: qa ? qa[2].trim() : '',
      fsrs: JSON.parse(fsrs[1]),
    };
  });
  return { preamble, cards };
}

const serialize = ({ preamble, cards }) => preamble + cards.map(c => c.raw).join('');

const stateJson = s => JSON.stringify({ due: s.due, s: s.s, d: s.d, reps: s.reps, lapses: s.lapses, last: s.last, state: s.state });

function courseDir(course) {
  if (fs.existsSync(course) && fs.statSync(course).isDirectory()) return course;
  const dir = path.join(process.env.LEARNING_ROOT || path.join(os.homedir(), 'Learning'), course);
  if (!fs.existsSync(dir)) throw new Error(`no course folder: ${dir}`);
  return dir;
}

function load(course) {
  const file = path.join(courseDir(course), 'cards.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Cards\n\n';
  return { file, deck: parse(text) };
}

const summary = c => ({ id: c.id, topic: c.topic, q: c.q, a: c.a, due: c.fsrs.due, state: c.fsrs.state, math: /\$/.test(c.q + c.a) });

function due(course, date) {
  const { deck } = load(course);
  return deck.cards
    .filter(c => c.fsrs.due <= date)
    .sort((x, y) => x.fsrs.due.localeCompare(y.fsrs.due) || x.id.localeCompare(y.id))
    .map(summary);
}

function grade(course, id, rating, date) {
  const { file, deck } = load(course);
  const card = deck.cards.find(c => c.id === id);
  if (!card) throw new Error(`no card ${id}`);
  const { state, interval } = schedule(card.fsrs, rating, date);
  card.raw = card.raw.replace(FSRS, `<!-- fsrs ${stateJson(state)} -->`);
  fs.writeFileSync(file, serialize(deck));
  return { id, rating, interval, ...state };
}

/* Incoming blocks start with `### <topic>` (or `### c-NNNN · <topic>`, whose ID is replaced);
   the rest of each block is kept, and an fsrs line is added when missing. */
function add(course, input, date) {
  const { file, deck } = load(course);
  const text = fs.readFileSync(input, 'utf8');
  const blocks = text.split(/^(?=### )/m).filter(b => b.startsWith('### '));
  if (!blocks.length) throw new Error(`no cards in ${input}`);
  let next = deck.cards.reduce((m, c) => Math.max(m, parseInt(c.id.slice(2), 10)), 0);
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const added = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const topic = lines[0].replace(/^### (c-[\d?]+ · )?/, '').trim();
    if (!topic) throw new Error(`card without a topic: ${lines[0]}`);
    if (!/^Q:/m.test(block) || !/^A:/m.test(block)) throw new Error(`card needs Q: and A: lines: ${lines[0]}`);
    const id = `c-${String(++next).padStart(4, '0')}`;
    let body = lines.slice(1).join(nl).replace(/\s+$/, '');
    if (!FSRS.test(body)) body += `${nl}<!-- fsrs ${stateJson(NEW_STATE(date))} -->`;
    const raw = `### ${id} · ${topic}${nl}${body}${nl}${nl}`;
    const last = deck.cards[deck.cards.length - 1];
    if (last && !/\n\s*\n$/.test(last.raw)) last.raw = last.raw.replace(/\s*$/, `${nl}${nl}`);
    if (!last && deck.preamble && !/\n\s*\n$/.test(deck.preamble)) deck.preamble = deck.preamble.replace(/\s*$/, `${nl}${nl}`);
    deck.cards.push({ raw, id, topic, fsrs: NEW_STATE(date) });
    added.push(id);
  }
  fs.writeFileSync(file, serialize(deck));
  return { added };
}

/* Incoming blocks start with `### c-NNNN` (optionally `· <topic>`, which must match); each replaces
   that card's Q/A text and keeps its ID, topic and fsrs line. Nothing is written if any block fails. */
function edit(course, input) {
  const { file, deck } = load(course);
  const blocks = fs.readFileSync(input, 'utf8').split(/^(?=### )/m).filter(b => b.startsWith('### '));
  if (!blocks.length) throw new Error(`no cards in ${input}`);
  const edited = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const head = lines[0].match(/^### (c-\d{4,})(?: · (.*?))?\s*$/);
    if (!head) throw new Error(`edit needs a card id: ${lines[0]}`);
    const card = deck.cards.find(c => c.id === head[1]);
    if (!card) throw new Error(`no card ${head[1]}`);
    if (head[2] && head[2] !== card.topic) throw new Error(`${card.id} is on ${card.topic}, not ${head[2]}`);
    if (!/^Q:/m.test(block) || !/^A:/m.test(block)) throw new Error(`card needs Q: and A: lines: ${lines[0]}`);
    const nl = /\r\n/.test(card.raw) ? '\r\n' : '\n';
    const body = lines.slice(1).join(nl).replace(/\s+$/, '');
    card.raw = card.raw.replace(/^Q:[\s\S]*?(?=<!-- fsrs )/m, () => body + nl);
    edited.push(card.id);
  }
  fs.writeFileSync(file, serialize(deck));
  return { edited };
}

function stats(course, date) {
  const { deck } = load(course);
  const count = s => deck.cards.filter(c => c.fsrs.state === s).length;
  const upcoming = deck.cards.map(c => c.fsrs.due).filter(d => d > date).sort();
  return {
    total: deck.cards.length,
    due: deck.cards.filter(c => c.fsrs.due <= date).length,
    overdue: deck.cards.filter(c => c.fsrs.state !== 'new' && toDay(c.fsrs.due) < toDay(date)).length,
    new: count('new'),
    review: count('review'),
    relearning: count('relearning'),
    reps: deck.cards.reduce((n, c) => n + c.fsrs.reps, 0),
    lapses: deck.cards.reduce((n, c) => n + c.fsrs.lapses, 0),
    nextDue: upcoming[0] || null,
  };
}

module.exports = { parse, serialize, courseDir, due, grade, add, edit, stats };

if (require.main === module) {
  const args = process.argv.slice(2);
  const di = args.indexOf('--date');
  const date = di >= 0 ? args.splice(di, 2)[1] : today();
  const [cmd, course, ...rest] = args;
  const need = { due: 0, stats: 0, add: 1, edit: 1, grade: 2 };
  if (!(cmd in need) || !course || rest.length < need[cmd]) {
    console.log('usage: node cards.js due|stats <course> | add|edit <course> <file> | grade <course> <id> <rating>  [--date YYYY-MM-DD]');
    process.exit(2);
  }
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date: ${date}`);
    const run = { due: () => due(course, date), stats: () => stats(course, date), add: () => add(course, rest[0], date), edit: () => edit(course, rest[0]), grade: () => grade(course, rest[0], rest[1], date) };
    console.log(JSON.stringify(run[cmd](), null, 1));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
