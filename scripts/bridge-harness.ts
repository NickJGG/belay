/**
 * The bridge harness: drives a copy of `plugin/` over stdio through a grill and a lesson, talking to it with a code
 * root's own site helpers (`bridge-post`, `upstream`, `start-queue`), and writes a normalised transcript:
 *   test-env.sh <working> node scripts/bridge-harness.ts <plugin dir> <site code root> --out <file> [--paths <json>]
 * Diff the transcripts of every {master, branch} bridge × {master, branch} site pairing; `failed` lists broken
 * location and shape assertions and must be empty.
 *
 * Everything runs in a fresh fixture under the temp dir (data dir, a Learning root with one course, a home with no
 * Claude session files), never the working copy. Attaches pass an explicit sessionId. A lesson's `restart` is only
 * called with no start queued, since otherwise it would end this process with taskkill.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { args, code } from './code.ts';

const { pos, flags } = args();
if (pos.length !== 2 || typeof flags.out !== 'string') {
  throw new Error('usage: bridge-harness.ts <plugin dir> <site code root> --out <file> [--paths <json>]');
}
const SERVER = join(resolve(pos[0]), 'bridge', 'server.mjs');
const site = code(pos[1], flags.paths as string | undefined);

// Site modules import `server-only` and extensionless paths, which only Next resolves.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const root = mkdtempSync(join(tmpdir(), 'belay-harness-'));
const home = join(root, 'home');
const data = join(root, 'Belay');
const learning = join(root, 'Learning');
const work = join(root, 'work');
const course = join(learning, 'demo-course');
const put = (file: string, text: string) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
};
mkdirSync(join(home, '.claude', 'projects'), { recursive: true });
mkdirSync(work, { recursive: true });
put(join(data, 'settings.yaml'), 'extensions:\n  learn: on\n');
put(join(course, 'course.md'), '# Demo course\n');
put(join(course, 'knowledge', 'topic.md'), '# Topic\n\nA claim. ^c1\n');
put(join(course, 'sources', 'src.md'), '# A source\n');
put(join(course, 'work', 'flops.py'), 'print(1)\n');
process.env.BELAY_DATA = data;
process.env.LEARNING_ROOT = learning;

const { readBridgeFile, connectUpstream } = await site.load('upstream');
const { postToBridge } = await site.load('bridgePost');
const { writeQueue } = await site.load('startQueue');
const { parseChat } = await site.load('chat');
// From phase 4a a lesson reads with learn's own reader; master's core reader reads it whole.
const readLesson = await site.load('lessonSessions').then(
  (m) => m.readLesson,
  async () => (await site.load('sessions')).readSession,
);
const { sessionDir } = await site.load('webConfig');

const SESSION_ID = '0000aaaa-1111-2222-3333-444455556666';
const PICTURE = '20261024T120000-abcdef.png';
const grills = join(data, 'grills');
const lessons = join(data, 'lessons');
const runDir = join(data, '.run');

type Note = { method: string; params?: Record<string, unknown> };
type Entry = Record<string, unknown> & { step: string };
const log: Entry[] = [];
const failed: string[] = [];
const expect = (ok: unknown, what: string) => void (ok || failed.push(what));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETTLE = 300;

async function waitFor<T>(what: string, check: () => T | undefined | null | false, ms = 8000): Promise<T | undefined> {
  const end = Date.now() + ms;
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() > end) return void failed.push(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

/** Files under the data dir, by path relative to it, with size and mtime. */
function files(dir = data, out = new Map<string, string>()): Map<string, string> {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else {
      const s = statSync(p);
      out.set(relative(data, p).replaceAll('\\', '/'), `${s.size}:${s.mtimeMs}`);
    }
  }
  return out;
}

/** Paths added, changed or removed between two `files` snapshots. */
const touched = (a: Map<string, string>, b: Map<string, string>) =>
  [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p)).sort();

class Session {
  client = new Client({ name: 'bridge-harness', version: '0' });
  notes: Note[] = [];
  events: Record<string, unknown>[] = [];
  upstream: { close(): void; ready: Promise<void> } | null = null;

  async open(cwd: string) {
    const env = { ...process.env, USERPROFILE: home, HOME: home, BELAY_DATA: data, LEARNING_ROOT: learning } as Record<string, string>;
    delete env.CLAUDE_PROJECT_DIR;
    delete env.WT_SESSION;
    this.client.fallbackNotificationHandler = async (n) => void this.notes.push(n as Note);
    await this.client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd, env, stderr: 'ignore' }));
  }

  async call(name: string, a: Record<string, unknown> = {}) {
    try {
      const r = (await this.client.callTool({ name, arguments: a })) as { content: { text: string }[]; isError?: boolean };
      return { text: r.content[0]?.text, ...(r.isError ? { isError: true } : {}) };
    } catch (e) {
      return { thrown: (e as Error).message };
    }
  }

  tools = async () => (await this.client.listTools()).tools;

  /** Runs `fn`, waits for its notifications and events to arrive, and logs all three. */
  async step(step: string, fn: () => Promise<unknown>) {
    const result = await fn();
    await sleep(SETTLE);
    log.push({ step, result, notes: this.notes.splice(0), events: this.events.splice(0) });
    return result;
  }

  async follow(dir: string) {
    const file = readBridgeFile(dir);
    expect(file, `the site reads ${relative(data, dir)}/bridge.json`);
    if (!file) return;
    const upstream = connectUpstream(file, { onEvent: (e: Record<string, unknown>) => void this.events.push(e), onChange: () => {} });
    this.upstream = upstream;
    await upstream.ready;
  }

  async close() {
    this.upstream?.close();
    await this.client.close();
  }
}

const post = (slug: string, msg: Record<string, unknown>) => postToBridge(slug, msg);

function chatParses(dir: string) {
  const file = join(dir, 'chat.jsonl');
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  expect(parseChat(readFileSync(file, 'utf8')).length === lines.length, `the site parses every line of ${relative(data, file)}`);
}

// --- a grill ------------------------------------------------------------------

const grill = new Session();
await grill.open(work);
log.push({ step: 'instructions', result: grill.client.getInstructions(), server: grill.client.getServerVersion() });
await grill.step('tools idle', grill.tools);
await grill.step('attach errors', async () => [
  await grill.call('attach', {}),
  await grill.call('attach', { slug: '../x' }),
  await grill.call('attach', { slug: 'a', course: 'demo-course' }),
  await grill.call('reply', { text: 'early' }),
]);

const slug = 'harness-grill';
const gdir = join(grills, slug);
let before = files();
await grill.step('attach grill', () => grill.call('attach', { slug, sessionId: SESSION_ID }));
await grill.step('tools grill', grill.tools);
await grill.step('follow', () => grill.follow(gdir));
await grill.step('status', async () => {
  const b = readBridgeFile(gdir);
  return b && (await (await fetch(`http://127.0.0.1:${b.port}/status`)).json());
});

const harnessMade = new Set<string>();
for (const [name, msg] of [
  ['chat', { kind: 'chat', text: 'hello' }],
  ['chat, missing picture', { kind: 'chat', text: '', images: [PICTURE] }],
  ['answer', { kind: 'answer', q: 3, opt: 'b', note: 'smaller' }],
  ['comment', { kind: 'comment', q: 1, opt: 'a', selector: 'main > .card', text: ' Save \n now ', note: 'move this' }],
  ['permission, none open', { kind: 'permission', request_id: 'abcde', behavior: 'allow' }],
  ['focus', { kind: 'focus' }],
  ['attempt on a grill', { kind: 'attempt', path: 'work/x.py' }],
  ['restart on a grill', { kind: 'restart', label: 'Quick review' }],
  ['invalid', { kind: 'shell', text: 'x' }],
] as const) {
  await grill.step(`post ${name}`, () => post(slug, msg));
}
put(join(gdir, 'images', PICTURE), 'png');
harnessMade.add(`grills/${slug}/images/${PICTURE}`);
await grill.step('post chat, picture', () => post(slug, { kind: 'chat', text: 'see', images: [PICTURE] }));

await grill.step('reply', () => grill.call('reply', { text: 'got it' }));
await grill.step('reply, empty', () => grill.call('reply', { text: '' }));
const choice = (await grill.step('choice', () => grill.call('choice', { prompt: 'Ship?', options: ['Yes', 'No'] }))) as { text: string };
const id = /choice ([0-9a-f]{6})/.exec(choice.text)?.[1] ?? 'none';
await grill.step('post choice, not an option', () => post(slug, { kind: 'choice', id, option: 'Maybe' }));
await grill.step('post choice', () => post(slug, { kind: 'choice', id, option: 'Yes' }));
await grill.step('post choice, again', () => post(slug, { kind: 'choice', id, option: 'Yes' }));
const free = (await grill.step('choice 2', () => grill.call('choice', { prompt: 'Which?', options: ['A', 'B'] }))) as { text: string };
const id2 = /choice ([0-9a-f]{6})/.exec(free.text)?.[1] ?? 'none';
await grill.step('post choice, typed', () => post(slug, { kind: 'choice', id: id2, text: 'neither' }));
await grill.step('choice, repeated options', () => grill.call('choice', { prompt: 'x', options: ['A', 'A'] }));
await grill.step('show', () => grill.call('show', { q: 4, opt: 'a' }));
await grill.step('show, bad', () => grill.call('show', { q: 0 }));
await grill.step('restart on a grill', () => grill.call('restart'));
await grill.step('unknown tool', () => grill.call('nope'));
await grill.step('re-attach', () => grill.call('attach', { slug, sessionId: SESSION_ID }));
expect(readBridgeFile(gdir), 'bridge.json is there while attached');
chatParses(gdir);
await grill.step('detach', () => grill.call('detach'));
await grill.step('tools after detach', grill.tools);
await grill.step('post after detach', () => post(slug, { kind: 'chat', text: 'anyone?' }));
expect(!existsSync(join(gdir, 'bridge.json')), 'detach removes the grill bridge.json');
const grillTouched = touched(before, files()).filter((p) => !harnessMade.has(p));
log.push({ step: 'grill touched', result: grillTouched });
expect(
  grillTouched.every((p) => p === `grills/${slug}/chat.jsonl`),
  `a grill writes only chat.jsonl and bridge.json: ${grillTouched.join(', ')}`,
);
await grill.close();

// --- a lesson -----------------------------------------------------------------

const QUICK = { label: 'Quick review', command: '/learn:learn demo-course --quick', course: 'demo-course', routine: 'quick' };
const isCommand = (n: Note) => (n.params?.meta as Record<string, string> | undefined)?.kind === 'command';

before = files();
writeQueue(runDir, QUICK);
const lesson = new Session();
await lesson.open(learning);
await lesson.step('queued start', () => waitFor('the queued start', () => lesson.notes.some(isCommand)));
expect(!existsSync(join(runDir, 'start.json')), 'the bridge consumes start.json');
await lesson.step('tools idle', lesson.tools);
await lesson.step('attach errors', async () => [
  await lesson.call('attach', { course: 'no-such' }),
  await lesson.call('attach', { slug: 'x', course: 'demo-course' }),
]);
const attached = (await lesson.step('attach lesson', () =>
  lesson.call('attach', { course: 'demo-course', topic: 'Quick review', sessionId: SESSION_ID }),
)) as { text: string };
const lslug = /^attached (lesson-[a-z0-9-]+):/.exec(attached.text)?.[1] ?? 'none';
const ldir = join(lessons, lslug);
await lesson.step('tools lesson', lesson.tools);
await lesson.step('follow', () => lesson.follow(ldir));
for (const [name, a] of [
  ['claim, missing', { target: 'claim', topic: 'topic', id: 'c9' }],
  ['claim, bad', { target: 'claim', topic: 'Topic', id: 'x' }],
  ['whiteboard', { target: 'whiteboard' }],
  ['work', { target: 'work', path: 'work/flops.py' }],
  ['work, outside', { target: 'work', path: 'course.md' }],
  ['source, missing', { target: 'source', id: 'nope' }],
  ['source', { target: 'source', id: 'src' }],
  ['bad target', { target: 'elsewhere' }],
  ['claim', { target: 'claim', topic: 'topic', id: 'c1' }],
] as const) {
  await lesson.step(`show ${name}`, () => lesson.call('show', a));
}
await lesson.step('snapshot for a page opened later', async () => {
  const later = new Session();
  await later.follow(ldir);
  await sleep(SETTLE);
  later.upstream?.close();
  return later.events;
});
for (const [name, msg] of [
  ['chat', { kind: 'chat', text: 'hi' }],
  ['attempt', { kind: 'attempt', path: 'work/flops.py', text: 'Attempt: work/flops.py' }],
  ['restart', { kind: 'restart', label: 'Card review', wrap: true }],
  ['answer on a lesson', { kind: 'answer', q: 1, opt: 'a' }],
  ['focus', { kind: 'focus' }],
] as const) {
  await lesson.step(`post ${name}`, () => post(lslug, msg));
}
const lc = (await lesson.step('choice', () => lesson.call('choice', { prompt: 'Ready?', options: ['Go', 'Wait'] }))) as { text: string };
const lid = /choice ([0-9a-f]{6})/.exec(lc.text)?.[1] ?? 'none';
await lesson.step('post choice', () => post(lslug, { kind: 'choice', id: lid, option: 'Go' }));
await lesson.step('reply', () => lesson.call('reply', { text: 'A $x^2$ reply' }));
expect(!existsSync(join(runDir, 'start.json')), 'no start is queued before restart');
if (!existsSync(join(runDir, 'start.json'))) await lesson.step('restart, nothing queued', () => lesson.call('restart'));
await lesson.step('re-attach with a topic', () => lesson.call('attach', { course: 'demo-course', topic: 'Card review', sessionId: SESSION_ID }));
const doc = readLesson(lessons, lslug);
log.push({ step: 'lesson session', result: doc && { kind: doc.kind, topic: doc.topic, status: doc.status } });
expect(doc?.kind === 'lesson', 'the site reads the lesson session.json');
expect(readBridgeFile(ldir), 'bridge.json is there while attached');
chatParses(ldir);
await lesson.step('detach', () => lesson.call('detach'));
log.push({ step: 'lesson session after detach', result: readLesson(lessons, lslug)?.status });
await lesson.step('tools after detach', lesson.tools);
await lesson.step('post after detach', () => post(lslug, { kind: 'chat', text: 'anyone?' }));
expect(!existsSync(join(ldir, 'bridge.json')), 'detach removes the lesson bridge.json');
writeQueue(runDir, { ...QUICK, label: 'Card review', command: '/learn:review demo-course', routine: 'review' });
await lesson.step('queued start while idle', () => waitFor('a later queued start', () => lesson.notes.some(isCommand)));
expect(!existsSync(join(runDir, 'start.json')), 'the bridge consumes the later start.json');
const lessonTouched = touched(before, files());
log.push({ step: 'lesson touched', result: lessonTouched });
const LESSON_FILES = new Set([`lessons/${lslug}/chat.jsonl`, `lessons/${lslug}/session.json`]);
expect(lessonTouched.every((p) => LESSON_FILES.has(p)), `a lesson writes only chat.jsonl, session.json and bridge.json: ${lessonTouched.join(', ')}`);
await lesson.close();

// --- the site's session lookup --------------------------------------------------

mkdirSync(join(grills, 'both'), { recursive: true });
mkdirSync(join(lessons, 'both'), { recursive: true });
expect(sessionDir('both') === join(grills, 'both'), 'sessionDir looks in grills before lessons');
expect(sessionDir(lslug) === ldir, 'sessionDir finds a lesson');
log.push({ step: 'post, no such session', result: await post('no-such-session', { kind: 'chat', text: 'anyone?' }) });

// --- normalise and write --------------------------------------------------------

const subs: [RegExp | string, string][] = [
  [root, '<ROOT>'],
  [root.replaceAll('\\', '/'), '<ROOT>'],
  [lslug, 'lesson-demo-course-<STAMP>'],
  [/\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\b/g, '<TIME>'],
  [/"(port|pid)":\d+/g, '"$1":<N>'],
  [/bridge on 127\.0\.0\.1:\d+/g, 'bridge on 127.0.0.1:<PORT>'],
  [/\(port \d+\)/g, '(port <PORT>)'],
  [/\b[0-9a-f]{48}\b/g, '<TOKEN>'],
];
for (const [i, c] of [id, id2, lid].entries()) subs.push([new RegExp(`\\b${c}\\b`, 'g'), `<CHOICE${i + 1}>`]);
const norm = (s: string) => subs.reduce<string>((t, [from, to]) => (typeof from === 'string' ? t.replaceAll(from, to) : t.replace(from, to)), s);
const walk = (v: unknown): unknown =>
  typeof v === 'string'
    ? norm(v)
    : Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        : v;

writeFileSync(flags.out, `${norm(JSON.stringify({ failed, log: walk(log) }, null, 2))}\n`);
rmSync(root, { recursive: true, force: true });
console.log(`${log.length} steps, ${failed.length} failed, in ${flags.out}`);
if (failed.length) console.log(failed.map((f) => `  ${f}`).join('\n'));
process.exit(0);
