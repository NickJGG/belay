/**
 * Rollback check, ops step: runs every write the CLI and the dashboard can make against the test data, through a
 * code root's own CLI and modules.
 *   test-env.sh <working> node scripts/rollback-ops.ts <code root> --out <log.json> [--paths <json>]
 * The log holds each op's normalised output, the commit it made (checked against the paths it should list) and the
 * normalised content of every file it touched, so two runs compare with a plain diff. `touched` and `mayTouch`
 * (relative to the working copy) feed rollback-compare.ts. The non-plain fixtures (fxt-1xx) are set aside while it
 * runs, since master would rewrite them, and put back byte for byte.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { args, code, need, normaliser } from './code.ts';

const { pos, flags } = args();
if (pos.length !== 1 || typeof flags.out !== 'string') throw new Error('usage: rollback-ops.ts <code root> --out <log.json> [--paths <json>]');
const c = code(pos[0], flags.paths as string | undefined);
const data = need('BELAY_DATA');
const learning = need('LEARNING_ROOT');
const working = dirname(data);

const env: Record<string, string | undefined> = { ...process.env };
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];

const norm = normaliser(working);

const git = (...a: string[]) => spawnSync('git', ['-C', data, ...a], { encoding: 'utf8' }).stdout.trim();

interface Op {
  name: string;
  out?: string;
  error?: string;
  /** The op's commits, oldest first: subject, then `<status>\t<path>` lines. */
  commits: string[][];
  commitOk: boolean;
  expectCommit: string[] | null;
  files: Record<string, string | null>;
}
const ops: Op[] = [];
const touched = new Set<string>();
const mayTouch = new Set<string>();

/** Paths relative to the working copy: `Belay/…` or `Learning/…`. */
const read = (rel: string) => {
  const abs = join(working, rel);
  return existsSync(abs) ? norm(readFileSync(abs, 'utf8')) : null;
};

/**
 * Runs `fn`, then records its commits since the last op. `expectCommit` is the sorted `<status>\t<path>` list the
 * op's single commit must hold, or null for an op that must not commit. `files` are what it touches.
 */
async function op(name: string, expectCommit: string[] | null, files: string[], fn: () => Promise<string> | string, maybe: string[] = []) {
  const before = git('rev-parse', 'HEAD');
  const rec: Op = { name, commits: [], commitOk: false, expectCommit, files: {} };
  try {
    rec.out = norm(await fn());
  } catch (e) {
    rec.error = norm((e as Error).message);
  }
  const log = git('log', '--reverse', '--name-status', '--no-renames', '--format=%x00%s', `${before}..HEAD`);
  rec.commits = log
    .split('\0')
    .filter((b) => b.trim())
    .map((b) => {
      const [subject, ...lines] = b.trim().split('\n').filter(Boolean);
      return [norm(subject), ...lines.map(norm).sort()];
    });
  rec.commitOk =
    expectCommit === null ? rec.commits.length === 0 : rec.commits.length === 1 && JSON.stringify(rec.commits[0].slice(1)) === JSON.stringify([...expectCommit].sort());
  for (const f of files) {
    touched.add(f);
    rec.files[f] = read(f);
  }
  for (const f of maybe) mayTouch.add(f);
  ops.push(rec);
}

function cli(...argv: string[]): string {
  const r = spawnSync(process.execPath, [c.path('cli'), ...argv], { encoding: 'utf8', env, cwd: tmpdir() });
  if (r.status !== 0) throw new Error(`belay ${argv.join(' ')}: exit ${r.status}: ${r.stderr.trim()}`);
  return r.stdout;
}

const aside = join(working, 'aside');
const nonPlain = readdirSync(join(data, 'issues')).filter((f) => /^fxt-1\d\d\.md$/.test(f));
mkdirSync(aside, { recursive: true });
for (const f of nonPlain) renameSync(join(data, 'issues', f), join(aside, f));

try {
  const help = cli('help');
  const tmp = tmpdir().replaceAll('\\', '/');
  const scratch = 'ZRB';
  const grill = 'zz-rollback';
  const gdir = join(data, 'grills', grill);

  await op('project add', [`A\tprojects/${scratch.toLowerCase()}.md`], [`Belay/projects/${scratch.toLowerCase()}.md`], () =>
    cli('project', 'add', scratch, '--name', 'Rollback scratch', '--path', tmp),
  );
  await op('add', ['A\tissues/fxt-7.md'], ['Belay/issues/fxt-7.md'], () => cli('add', 'rollback plain', '--project', 'FXT'));
  await op('add --grill --plan', ['A\tissues/fxt-8.md'], ['Belay/issues/fxt-8.md'], () =>
    cli('add', 'rollback grill', '--project', 'FXT', '--grill', 'belay-plugin-architecture', '--plan', 'C:/belay-fixtures/plan.md'),
  );
  await op('edit (plain unknown keys)', ['M\tissues/fxt-2.md'], ['Belay/issues/fxt-2.md'], () => cli('edit', 'FXT-2', '--title', 'Fixture 2 edited'));
  await op('edit --grill', ['M\tissues/fxt-3.md'], ['Belay/issues/fxt-3.md'], () => cli('edit', 'FXT-3', '--grill', 'belay-plugin-architecture'));
  await op('set', ['M\tissues/fxt-4.md'], ['Belay/issues/fxt-4.md'], () => cli('set', 'FXT-4', 'todo'));
  await op('comment', ['M\tissues/fxt-5.md'], ['Belay/issues/fxt-5.md'], () => cli('comment', 'FXT-5', 'rollback comment', '--as', 'user'));
  await op('comment (key before id)', ['M\tissues/fxt-6.md'], ['Belay/issues/fxt-6.md'], () => cli('comment', 'FXT-6', 'rollback comment', '--as', 'user'));
  await op('add (scratch)', ['A\tissues/zrb-1.md'], ['Belay/issues/zrb-1.md'], () => cli('add', 'scratch', '--project', scratch));
  await op(
    'project rekey',
    ['A\tissues/zrc-1.md', 'A\tprojects/zrc.md', 'D\tissues/zrb-1.md', 'D\tprojects/zrb.md'],
    ['Belay/issues/zrb-1.md', 'Belay/issues/zrc-1.md', 'Belay/projects/zrb.md', 'Belay/projects/zrc.md'],
    () => cli('project', 'rekey', scratch, 'ZRC'),
  );

  mkdirSync(gdir, { recursive: true });
  writeFileSync(join(gdir, `${grill}.md`), `---\ntopic: Rollback scratch\nstatus: planned\nstarted: 2026-01-01\n---\n\n# Grill session: Rollback scratch\n`);
  writeFileSync(join(gdir, 'session.json'), `${JSON.stringify({ slug: grill, topic: 'Rollback scratch', status: 'planned', questions: [] }, null, 2)}\n`);
  writeFileSync(join(gdir, 'bridge.json'), '{"port":1,"token":"t","pid":1}\n');
  writeFileSync(join(gdir, 'bridge.json.tmp'), 'x\n');
  const gfiles = [`grills/${grill}/${grill}.md`, `grills/${grill}/session.json`];
  await op(
    'grill commit',
    gfiles.map((f) => `A\t${f}`),
    [...gfiles, `grills/${grill}/bridge.json`, `grills/${grill}/bridge.json.tmp`].map((f) => `Belay/${f}`),
    () => cli('grill', 'commit', grill),
  );

  if (/^\s+extension /m.test(help)) {
    await op('extension off learn', ['M\tsettings.yaml'], ['Belay/settings.yaml'], () => cli('extension', 'off', 'learn'), ['Belay/.run/start.json']);
    await op('extension on learn', ['M\tsettings.yaml'], ['Belay/settings.yaml'], () => cli('extension', 'on', 'learn'));
  }

  const { imageName } = await c.load('images');
  await op('image upload', null, [], () => {
    const dir = join(gdir, 'images');
    mkdirSync(dir, { recursive: true });
    const name = imageName('png');
    writeFileSync(join(dir, name), Buffer.from('89504e470d0a1a0a', 'hex'), { flag: 'wx' });
    touched.add(`Belay/grills/${grill}/images/${name}`);
    return name;
  });

  const courses = await c.load('courses');
  const course = (courses.listCourses() as { course: string }[]).map((x) => x.course).sort()[0];
  const { writeWork } = await c.load('work');
  const workRel = 'work/zz-rollback.txt';
  await op('writeWork', null, [`Learning/${course}/${workRel}`], () => JSON.stringify({ ...writeWork(course, workRel, 'rollback\n', { base: null }), mtime: 0 }));

  const reading = (courses.getCourse(course)?.syllabus ?? []).flatMap((u: { reading: { source: string; status: string }[] }) => u.reading);
  const source = reading.find((r: { status: string }) => r.status === 'todo')?.source;
  if (source) {
    await op('read mark', null, [], async () => JSON.stringify(await courses.markRead(course, source)), [`Learning/${course}/syllabus.md`]);
    await op('read unmark', null, [], async () => JSON.stringify(await courses.markRead(course, source, true)), [`Learning/${course}/syllabus.md`]);
  }

  const { writeQueue, clearQueue, queueFile } = await c.load('startQueue');
  const { runDir } = await c.load('config');
  await op('writeQueue', null, [], () => {
    writeQueue(runDir(data), { label: 'Lesson', command: `learn ${course}`, course, routine: 'lesson' });
    return readFileSync(queueFile(runDir(data)), 'utf8');
  });
  await op('clearQueue', null, ['Belay/.run/start.json'], () => {
    clearQueue(runDir(data));
    return String(existsSync(queueFile(runDir(data))));
  });
} finally {
  for (const f of nonPlain) renameSync(join(aside, f), join(data, 'issues', f));
}

rmdirSync(aside);

const sorted = (s: Set<string>) => [...s].map(norm).sort();
const failed = ops.filter((o) => o.error || !o.commitOk).map((o) => o.name);
writeFileSync(flags.out, `${JSON.stringify({ ops, touched: sorted(touched), mayTouch: sorted(mayTouch), failed }, null, 2)}\n`);
if (failed.length) {
  console.error(`ops failed or committed the wrong paths: ${failed.join(', ')}`);
  process.exitCode = 1;
}
