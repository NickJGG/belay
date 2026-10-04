#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { claudeDir } from './config.ts';
import { clip, digestLines } from './digest.ts';
import { grillDir, grillMatches, loadGrillSessions } from './grill.ts';
import { attachCommits, duration, localStamp, recentSessions } from './history.ts';
import { Ctx, addProject, addTask, deleteTask, editProject, editTask, idList, oneOf, rekeyProject, setStatus } from './ops.ts';
import { isReady, next, openBlockers, projectCounts, projectForCwd } from './query.ts';
import { TASK_STATUSES, normalizeStoredPath, taskFile, type Task, type TaskStatus } from './store.ts';
import { serve } from './web.ts';

const HELP = `tracker — what should I work on?

  next [--all]                      doing, high-priority, then ready tasks in focus projects
  add "<title>" [--project <key>] [--status idea|todo] [--blocked-by <id>...]
                [--priority high] [--source user|claude] [--grill <slug>] [--plan <path>] [--note <text>]
  set <id> <status>                 idea|todo|doing|done|dropped
  edit <id> [--title <t>] [--blocked-by <id>...] [--priority high|none]
            [--grill <slug>] [--plan <path>] [--note <text>] [--body <text> | --body-file <path|->]
                                    --body/--body-file replace the notes (- reads stdin)
  delete <id>                       erase a task for good; strips it from its dependents' blockers
  show <id>
  list [--project <key>] [--status <s,...>|all]   default hides done and dropped

  history [<project>] [-n <count>] [-v]
                                    recent Claude sessions and their commits, newest first
  search <words>...                 tasks (title, notes) and grill sessions (slug, topic, project) with every word
  serve [--port <n>] [--no-open]    dashboard at http://127.0.0.1:4747/ (Ctrl+C to stop); builds web/
                                    first when it or src/ changed (needs 'npm install' in web/)
  digest                            SessionStart hook: reads the hook JSON on stdin, prints a summary
                                    if its cwd is in a registered project, else nothing

  project add [<key>] --name <name> --path <dir>... [--group <g>] [--focus]
                                    key: 3–4 letters, the task-ID prefix (ELV-12); derived from
                                    the name when omitted (3 letters, 4 on a clash)
  project list [--all]              --all includes archived
  project set <key> [--status active|paused|archived] [--focus|--no-focus] [--name <n>] [--group <g>]
  project rekey <key> <new-key>     rename the key and every task ID in the project, fixing blockers
  project which [<dir>]             key of the project containing <dir> (default cwd); prints nothing if none

--project defaults to the project whose path contains the cwd. --blocked-by takes
repeated flags or a comma list. Keys and IDs are case-insensitive. Data dir: $TRACKER_DATA (default ~/Tracker).`;

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
  const project = values.project ? ctx.project(values.project) : projectForCwd(ctx.projects, process.cwd());
  if (!project) throw new Error(`cwd is not inside a registered project; pass --project <key>`);
  const task = addTask(ctx, {
    title: positionals[0],
    project: project.key,
    status: values.status,
    blockers: idList(values['blocked-by']),
    priority: values.priority,
    source: values.source,
    grill: values.grill,
    plan: values.plan,
    note: values.note,
  });
  print(`added ${task.id} (${task.status}): ${task.title}`);
}

function cmdSet(argv: string[]): void {
  const { positionals } = args(argv, {}, 2);
  const { before, task, open } = setStatus(new Ctx(), positionals[0], positionals[1]);
  print(`${task.id}: ${before} → ${task.status}`);
  if ((task.status === 'doing' || task.status === 'todo') && open.length) {
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
      body: { type: 'string' },
      'body-file': { type: 'string' },
    },
    1,
  );
  if (values.body !== undefined && values['body-file'] !== undefined) throw new Error('pass --body or --body-file, not both');
  const bodyFile = values['body-file'];
  const task = editTask(new Ctx(), positionals[0], {
    title: values.title,
    blockers: values['blocked-by'] && idList(values['blocked-by']),
    priority: values.priority,
    grill: values.grill,
    plan: values.plan,
    note: values.note,
    body: bodyFile === undefined ? values.body : readFileSync(bodyFile === '-' ? 0 : bodyFile, 'utf8'),
  });
  print(`updated ${task.id}`);
}

function cmdDelete(argv: string[]): void {
  const { positionals } = args(argv, {}, 1);
  const ctx = new Ctx();
  const { id } = ctx.task(positionals[0]);
  const dependents = deleteTask(ctx, id);
  print(`deleted ${id}`);
  if (dependents.length) print(`  no longer blocked by it: ${dependents.map((t) => t.id).join(', ')}`);
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
  const project = values.project ? ctx.project(values.project).key : undefined;
  const statuses: readonly TaskStatus[] =
    values.status === 'all'
      ? TASK_STATUSES
      : values.status
        ? idList([values.status]).map((s) => oneOf(s, TASK_STATUSES, '--status'))
        : ['idea', 'todo', 'doing'];
  const tasks = ctx.tasks.filter((t) => statuses.includes(t.status) && (!project || t.project === project));
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

function cmdServe(argv: string[]): void {
  const { values } = args(argv, { port: { type: 'string' }, open: { type: 'boolean' } }, 0);
  const port = Number(values.port ?? 4747);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port must be 1–65535 (got '${values.port}')`);
  serve({ port, open: values.open ?? true }).catch((e: Error) => {
    console.error(`tracker: ${e.message}`);
    process.exitCode = 1;
  });
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
  if (sub === 'rekey') return projectRekey(rest);
  if (sub === 'which') return projectWhich(rest);
  throw new Error(`unknown 'project ${sub ?? ''}' — expected add, list, set, rekey or which`);
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
    0,
    1,
  );
  if (!values.name) throw new Error('--name is required');
  if (!values.path?.length) throw new Error('at least one --path is required');
  const { project, missing } = addProject(new Ctx(), {
    key: positionals[0],
    name: values.name,
    paths: values.path,
    group: values.group,
    focus: values.focus,
  });
  for (const p of missing) console.error(`warning: ${p} does not exist`);
  print(`added project ${project.key} — tasks will be ${project.key}-1, ${project.key}-2, …`);
}

function projectRekey(argv: string[]): void {
  const { positionals } = args(argv, {}, 2);
  const ctx = new Ctx();
  const before = ctx.project(positionals[0]).key;
  const { project, renamed } = rekeyProject(ctx, before, positionals[1]);
  print(`rekeyed ${before} → ${project.key}${renamed.size ? `: ${[...renamed].map(([a, b]) => `${a} → ${b}`).join(', ')}` : ''}`);
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
      const c = projectCounts(p, ctx.tasks, ctx.byId);
      const counts = [
        [c.doing, 'doing'],
        [c.ready, 'ready'],
        [c.ideas, 'idea'],
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
  const p = editProject(new Ctx(), positionals[0], values);
  print(`updated project ${p.key}: ${p.status}${p.focus ? ', focus' : ''}`);
}

const COMMANDS: Record<string, (argv: string[]) => void> = {
  next: cmdNext,
  add: cmdAdd,
  set: cmdSet,
  edit: cmdEdit,
  delete: cmdDelete,
  show: cmdShow,
  list: cmdList,
  history: cmdHistory,
  search: cmdSearch,
  serve: cmdServe,
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
