#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { claudeDir, dataDir } from './config.ts';
import { clip, digestLines } from './digest.ts';
import { grillDir, grillMatches, loadGrillSessions } from './grill.ts';
import { attachCommits, duration, localStamp, recentSessions } from './history.ts';
import { indexTasks, isReady, next, openBlockers, projectForCwd } from './query.ts';
import {
  PROJECT_STATUSES,
  SOURCES,
  TASK_STATUSES,
  createTask,
  loadProjects,
  loadTasks,
  normalizeStoredPath,
  projectFile,
  saveProject,
  saveTask,
  taskFile,
  today,
  validateKey,
  type Project,
  type Task,
  type TaskStatus,
} from './store.ts';

const HELP = `tracker — what should I work on?

  next [--all]                      doing, high-priority, then ready tasks in focus projects
  add "<title>" [--project <key>] [--status idea|todo] [--blocked-by <id>...]
                [--priority high] [--source user|claude] [--grill <slug>] [--plan <path>] [--note <text>]
  set <id> <status>                 idea|todo|doing|done|dropped
  edit <id> [--title <t>] [--blocked-by <id>...] [--priority high|none]
            [--grill <slug>] [--plan <path>] [--note <text>]
  show <id>
  list [--project <key>] [--status <s,...>|all]   default hides done and dropped

  history [<project>] [-n <count>] [-v]
                                    recent Claude sessions and their commits, newest first
  search <words>...                 tasks (title, notes) and grill sessions (slug, topic, project) with every word
  digest                            SessionStart hook: reads the hook JSON on stdin, prints a summary
                                    if its cwd is in a registered project, else nothing

  project add <key> --name <name> --path <dir>... [--group <g>] [--focus]
  project list [--all]              --all includes archived
  project set <key> [--status active|paused|archived] [--focus|--no-focus] [--name <n>] [--group <g>]
  project which [<dir>]             key of the project containing <dir> (default cwd); prints nothing if none

--project defaults to the project whose path contains the cwd. --blocked-by takes
repeated flags or a comma list. Data dir: $TRACKER_DATA (default ~/Tracker).`;

function args<T extends ParseArgsConfig['options']>(
  argv: string[],
  options: T,
  positionals: number,
  maxPositionals = positionals,
) {
  const parsed = parseArgs({ args: argv, options, allowPositionals: true, allowNegative: true, strict: true });
  const n = parsed.positionals.length;
  if (n < positionals || n > maxPositionals) {
    const expected = maxPositionals === positionals ? positionals : `${positionals}–${maxPositionals}`;
    throw new Error(`expected ${expected} argument(s), got ${n} — see 'tracker help'`);
  }
  return parsed;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${what} must be one of ${allowed.join('|')} (got '${value}')`);
}

function idList(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
}

function appendNote(body: string, note: string): string {
  return `${body.trim()}\n- ${today()}: ${note.trim()}`.trim();
}

class Ctx {
  readonly dir = dataDir();
  readonly projects = loadProjects(this.dir);
  readonly tasks = loadTasks(this.dir);
  readonly byId = indexTasks(this.tasks);

  project(key: string): Project {
    const p = this.projects.find((x) => x.key === key);
    if (!p) throw new Error(`no project '${key}' (see 'tracker project list')`);
    return p;
  }

  task(id: string): Task {
    const t = this.byId.get(id);
    if (!t) throw new Error(`no task '${id}'`);
    return t;
  }

  checkBlockers(id: string | undefined, blockers: string[]): void {
    for (const b of blockers) {
      if (b === id) throw new Error(`${id} cannot block itself`);
      this.task(b);
    }
  }
}

// --- output ---

function lines(tasks: Task[], ctx: Ctx, showStatus = false): string[] {
  const width = Math.max(0, ...tasks.map((t) => t.id.length));
  const statusWidth = showStatus ? Math.max(...tasks.map((t) => t.status.length)) : 0;
  return tasks.map((t) => {
    const flags = [t.priority === 'high' ? '!' : '', t.source === 'claude' ? '(claude)' : ''].filter(Boolean);
    const blockers = openBlockers(t, ctx.byId).map((b) => b.id);
    const tail = [...flags, blockers.length ? `[blocked by ${blockers.join(', ')}]` : ''].filter(Boolean).join(' ');
    const status = showStatus ? `${t.status.padEnd(statusWidth)}  ` : '';
    return `  ${t.id.padEnd(width)}  ${status}${t.title}${tail ? `  ${tail}` : ''}`;
  });
}

function print(text: string | string[]): void {
  console.log(Array.isArray(text) ? text.join('\n') : text);
}

// --- commands ---

function cmdNext(argv: string[]): void {
  const { values } = args(argv, { all: { type: 'boolean' } }, 0);
  const ctx = new Ctx();
  const n = next(ctx.projects, ctx.tasks);
  const out: string[] = [];
  const section = (title: string, tasks: Task[]) => {
    if (tasks.length) out.push(title, ...lines(tasks, ctx));
  };
  const focusKeys = ctx.projects.filter((p) => p.focus && p.status === 'active').map((p) => p.key);
  section('doing', n.doing);
  section('high priority', n.high);
  section(`ready — focus: ${focusKeys.join(', ') || 'none'}`, n.focus);
  if (values.all) section('ready — other active projects', n.other);

  if (!n.doing.length && !n.high.length && !n.focus.length && !(values.all && n.other.length)) {
    out.push(focusKeys.length ? 'nothing ready in focus projects' : "no focus projects — 'tracker project set <key> --focus'");
  }
  if (!values.all && n.other.length) out.push(`${n.other.length} more ready in other active projects (tracker next --all)`);
  print(out);
}

function cmdAdd(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    {
      project: { type: 'string', short: 'p' },
      status: { type: 'string', short: 's' },
      'blocked-by': { type: 'string', multiple: true },
      priority: { type: 'string' },
      source: { type: 'string' },
      grill: { type: 'string' },
      plan: { type: 'string' },
      note: { type: 'string' },
    },
    1,
  );
  const ctx = new Ctx();
  const title = positionals[0].trim();
  if (!title) throw new Error('title is empty');
  const project = values.project ? ctx.project(values.project) : projectForCwd(ctx.projects, process.cwd());
  if (!project) throw new Error(`cwd is not inside a registered project; pass --project <key>`);
  const blockers = idList(values['blocked-by']);
  ctx.checkBlockers(undefined, blockers);
  const date = today();
  const task = createTask(ctx.dir, {
    title,
    project: project.key,
    status: oneOf(values.status ?? 'todo', ['idea', 'todo'] as const, '--status'),
    blocked_by: blockers,
    priority: values.priority ? oneOf(values.priority, ['high'] as const, '--priority') : undefined,
    source: oneOf(values.source ?? 'user', SOURCES, '--source'),
    grill: values.grill,
    plan: values.plan,
    created: date,
    updated: date,
    body: values.note ? appendNote('', values.note) : '',
  });
  print(`added ${task.id} (${task.status}): ${task.title}`);
}

function cmdSet(argv: string[]): void {
  const { positionals } = args(argv, {}, 2);
  const ctx = new Ctx();
  const task = ctx.task(positionals[0]);
  const status = oneOf(positionals[1], TASK_STATUSES, 'status');
  const before = task.status;
  saveTask(ctx.dir, { ...task, status, updated: today() });
  print(`${task.id}: ${before} → ${status}`);
  const open = openBlockers(task, ctx.byId);
  if ((status === 'doing' || status === 'todo') && open.length) {
    print(`  note: still blocked by ${open.map((b) => `${b.id} (${b.status})`).join(', ')}`);
  }
}

function cmdEdit(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    {
      title: { type: 'string' },
      'blocked-by': { type: 'string', multiple: true },
      priority: { type: 'string' },
      grill: { type: 'string' },
      plan: { type: 'string' },
      note: { type: 'string' },
    },
    1,
  );
  const ctx = new Ctx();
  const task = { ...ctx.task(positionals[0]) };
  if (values.title !== undefined) {
    if (!values.title.trim()) throw new Error('title is empty');
    task.title = values.title.trim();
  }
  if (values['blocked-by'] !== undefined) {
    task.blocked_by = idList(values['blocked-by']);
    ctx.checkBlockers(task.id, task.blocked_by);
  }
  if (values.priority !== undefined) {
    task.priority = oneOf(values.priority, ['high', 'none'] as const, '--priority') === 'high' ? 'high' : undefined;
  }
  if (values.grill !== undefined) task.grill = values.grill || undefined;
  if (values.plan !== undefined) task.plan = values.plan || undefined;
  if (values.note !== undefined) task.body = appendNote(task.body, values.note);
  task.updated = today();
  saveTask(ctx.dir, task);
  print(`updated ${task.id}`);
}

function cmdShow(argv: string[]): void {
  const { positionals } = args(argv, {}, 1);
  const ctx = new Ctx();
  const t = ctx.task(positionals[0]);
  const describe = (id: string) => {
    const b = ctx.byId.get(id);
    return b ? `${id} (${b.status})` : `${id} (missing)`;
  };
  const blocks = ctx.tasks.filter((x) => x.blocked_by.includes(t.id)).map((x) => `${x.id} (${x.status})`);
  const status = t.status === 'todo' ? `todo (${isReady(t, ctx.byId) ? 'ready' : 'blocked'})` : t.status;
  const out = [
    `${t.id}  ${t.title}`,
    `status:     ${status}${t.priority ? `, priority ${t.priority}` : ''}`,
    `project:    ${t.project}`,
    `source:     ${t.source}`,
    t.blocked_by.length ? `blocked by: ${t.blocked_by.map(describe).join(', ')}` : '',
    blocks.length ? `blocks:     ${blocks.join(', ')}` : '',
    t.grill ? `grill:      ${t.grill}` : '',
    t.plan ? `plan:       ${t.plan}` : '',
    `dates:      created ${t.created}, updated ${t.updated}`,
    `file:       ${normalizeStoredPath(taskFile(ctx.dir, t.id))}`,
  ].filter(Boolean);
  if (t.body) out.push('', t.body);
  print(out);
}

function cmdList(argv: string[]): void {
  const { values } = args(argv, { project: { type: 'string', short: 'p' }, status: { type: 'string', short: 's' } }, 0);
  const ctx = new Ctx();
  if (values.project) ctx.project(values.project);
  const statuses: readonly TaskStatus[] =
    values.status === 'all'
      ? TASK_STATUSES
      : values.status
        ? idList([values.status]).map((s) => oneOf(s, TASK_STATUSES, '--status'))
        : ['idea', 'todo', 'doing'];
  const tasks = ctx.tasks.filter((t) => statuses.includes(t.status) && (!values.project || t.project === values.project));
  print(tasks.length ? lines(tasks, ctx, true) : 'no tasks');
}

function cmdHistory(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    { n: { type: 'string', short: 'n' }, verbose: { type: 'boolean', short: 'v' } },
    0,
    1,
  );
  const limit = Number(values.n ?? 10);
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`-n must be a positive integer (got '${values.n}')`);
  const ctx = new Ctx();
  const project = positionals[0] ? ctx.project(positionals[0]) : undefined;
  const sessions = recentSessions(claudeDir(), ctx.projects, { project, limit });
  if (!sessions.length) return print('no sessions');
  attachCommits(sessions, ctx.projects);
  const keyW = Math.max(...sessions.map((s) => (s.project ?? '-').length));
  const out: string[] = [];
  for (const s of sessions) {
    const { date, time } = localStamp(s.start);
    const where = s.project ? '' : `  (${basename(s.cwd)})`;
    out.push(`  ${date} ${time}  ${duration(s.start, s.end).padStart(5)}  ${(s.project ?? '-').padEnd(keyW)}  ${s.title}${where}`);
    const indent = ' '.repeat(29 + keyW);
    if (values.verbose) out.push(`${indent}session ${s.id}`, `${indent}cwd     ${s.cwd}`);
    const commits = s.commits ?? [];
    for (const c of commits.slice(0, 5)) out.push(`${indent}${c.hash} ${c.subject}`);
    if (commits.length > 5) out.push(`${indent}… ${commits.length - 5} more`);
  }
  print(out);
}

function cmdSearch(argv: string[]): void {
  const { positionals } = args(argv, {}, 1, Infinity);
  const words = positionals.map((w) => w.toLowerCase());
  const ctx = new Ctx();
  const tasks = ctx.tasks.filter((t) => {
    const hay = `${t.title}\n${t.body}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const claude = claudeDir();
  const grill = loadGrillSessions(claude)
    .filter((g) => grillMatches(g, words))
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
  const out: string[] = [];
  if (tasks.length) out.push('tasks', ...lines(tasks, ctx, true));
  if (grill.length) {
    out.push(`grill sessions (${normalizeStoredPath(grillDir(claude))}/<slug>.md)`);
    const slugW = Math.max(...grill.map((g) => g.slug.length));
    const statusW = Math.max(...grill.map((g) => (g.status ?? '').length));
    const projW = Math.max(...grill.map((g) => (g.project ?? '').length));
    for (const g of grill) {
      const proj = projW ? `${(g.project ?? '-').padEnd(projW)}  ` : '';
      out.push(`  ${g.slug.padEnd(slugW)}  ${(g.status ?? '').padEnd(statusW)}  ${g.updated ?? '          '}  ${proj}${clip(g.topic, 100)}`);
    }
  }
  print(out.length ? out : 'no matches');
}

/** Must never fail the session start: any error goes to stderr and the exit code stays 0. */
function cmdDigest(argv: string[]): void {
  args(argv, {}, 0);
  try {
    let input: { cwd?: unknown; session_id?: unknown } = {};
    if (!process.stdin.isTTY) {
      try {
        input = JSON.parse(readFileSync(0, 'utf8'));
      } catch {
        // no payload: fall back to the process cwd
      }
    }
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const ctx = new Ctx();
    const project = projectForCwd(ctx.projects, cwd);
    if (!project) return;
    const claude = claudeDir();
    const exclude = typeof input.session_id === 'string' ? input.session_id : undefined;
    const sessions = recentSessions(claude, ctx.projects, { project, limit: 3, exclude });
    attachCommits(sessions, ctx.projects);
    print(digestLines(project, ctx.tasks, sessions, loadGrillSessions(claude)));
  } catch (e) {
    console.error(`tracker digest: ${(e as Error).message}`);
  }
}

function cmdProject(argv: string[]): void {
  const [sub, ...rest] = argv;
  if (sub === 'add') return projectAdd(rest);
  if (sub === 'list') return projectList(rest);
  if (sub === 'set') return projectSet(rest);
  if (sub === 'which') return projectWhich(rest);
  throw new Error(`unknown 'project ${sub ?? ''}' — expected add, list, set or which`);
}

function projectAdd(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    {
      name: { type: 'string' },
      path: { type: 'string', multiple: true },
      group: { type: 'string' },
      focus: { type: 'boolean' },
    },
    1,
  );
  const key = positionals[0];
  validateKey(key);
  if (!values.name) throw new Error('--name is required');
  if (!values.path?.length) throw new Error('at least one --path is required');
  const ctx = new Ctx();
  if (existsSync(projectFile(ctx.dir, key))) throw new Error(`project '${key}' already exists`);
  const paths = values.path.map(normalizeStoredPath);
  for (const p of paths) {
    if (!existsSync(p)) console.error(`warning: ${p} does not exist`);
  }
  saveProject(ctx.dir, {
    key,
    name: values.name,
    paths,
    status: 'active',
    focus: values.focus ?? false,
    group: values.group,
    body: '',
  });
  print(`added project ${key}`);
}

function projectList(argv: string[]): void {
  const { values } = args(argv, { all: { type: 'boolean' } }, 0);
  const ctx = new Ctx();
  const projects = ctx.projects
    .filter((p) => values.all || p.status !== 'archived')
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.key.localeCompare(b.key));
  if (!projects.length) return print("no projects — 'tracker project add'");
  const keyW = Math.max(...projects.map((p) => p.key.length));
  const nameW = Math.max(...projects.map((p) => p.name.length));
  const statusW = Math.max(...projects.map((p) => p.status.length));
  print(
    projects.map((p) => {
      const own = ctx.tasks.filter((t) => t.project === p.key);
      const counts = [
        [own.filter((t) => t.status === 'doing').length, 'doing'],
        [own.filter((t) => isReady(t, ctx.byId)).length, 'ready'],
        [own.filter((t) => t.status === 'idea').length, 'idea'],
      ]
        .filter(([n]) => n)
        .map(([n, label]) => `${n} ${label}${label === 'idea' && n !== 1 ? 's' : ''}`)
        .join(', ');
      const group = p.group ? `[${p.group}]` : '';
      return `${p.focus ? '*' : ' '} ${p.key.padEnd(keyW)}  ${p.status.padEnd(statusW)}  ${p.name.padEnd(nameW)}  ${[group, counts].filter(Boolean).join('  ')}`.trimEnd();
    }),
  );
}

/** Scripts call this to tag things with the cwd's project, so "none" is empty output, not an error. */
function projectWhich(argv: string[]): void {
  const { positionals } = args(argv, {}, 0, 1);
  const project = projectForCwd(new Ctx().projects, positionals[0] ?? process.cwd());
  if (project) print(project.key);
}

function projectSet(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    { status: { type: 'string' }, focus: { type: 'boolean' }, name: { type: 'string' }, group: { type: 'string' } },
    1,
  );
  const ctx = new Ctx();
  const p = { ...ctx.project(positionals[0]) };
  if (values.status !== undefined) p.status = oneOf(values.status, PROJECT_STATUSES, '--status');
  if (values.focus !== undefined) p.focus = values.focus;
  if (values.name) p.name = values.name;
  if (values.group !== undefined) p.group = values.group || undefined;
  saveProject(ctx.dir, p);
  print(`updated project ${p.key}: ${p.status}${p.focus ? ', focus' : ''}`);
}

const COMMANDS: Record<string, (argv: string[]) => void> = {
  next: cmdNext,
  add: cmdAdd,
  set: cmdSet,
  edit: cmdEdit,
  show: cmdShow,
  list: cmdList,
  history: cmdHistory,
  search: cmdSearch,
  digest: cmdDigest,
  project: cmdProject,
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  print(HELP);
} else {
  try {
    const run = COMMANDS[cmd];
    if (!run) throw new Error(`unknown command '${cmd}' — see 'tracker help'`);
    run(rest);
  } catch (e) {
    console.error(`tracker: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
