#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { args, print } from './argv.ts';
import { claudeDir, dataDir, DEFAULT_PORT } from './config.ts';
import { clip, digestLines, plural } from './digest.ts';
import {
  activeManifests,
  attachedSessions,
  extensionId,
  fieldLines,
  fieldValues,
  withFieldOptions,
  type Command,
} from './extensions.ts';
import { initHistory } from './gitlog.ts';
import { helpText } from './help.ts';
import { attachCommits, duration, localStamp, recentSessions, weekCommits } from './history.ts';
import {
  Ctx,
  addComment,
  addIssue,
  addLog,
  addProject,
  badFileNote,
  commentAuthor,
  deleteComment,
  deleteIssue,
  deleteLog,
  editLog,
  editComment,
  editIssue,
  editProject,
  idList,
  moveProject,
  oneOf,
  rekeyProject,
  setExtension,
  setStatus,
  type MoveTarget,
} from './ops.ts';
import { launchCommand } from './launch.ts';
import { parseLogAddress, type DatedEntry } from './logs.ts';
import { filterIssues, issueComparator, isReady, naturalDesc, next, openBlockers, projectCounts, projectForCwd, SORT_FIELDS } from './query.ts';
import { statusLine, withBad } from './statusline.ts';
import { ISSUE_STATUSES, KNOWN_ISSUE_KEYS, normalizeStoredPath, issueFile, SOURCES, unknownKeys, type Issue, type IssueStatus } from './store.ts';
import { serve } from './web.ts';
import { weekLines, weekSummary } from './week.ts';
import { addDays, isDay, weekStart, workDay, workDayOf } from './workday.ts';

// --- output ---

function lines(issues: Issue[], ctx: Ctx, showStatus = false): string[] {
  const width = Math.max(0, ...issues.map((t) => t.id.length));
  const statusWidth = showStatus ? Math.max(...issues.map((t) => t.status.length)) : 0;
  return issues.map((t) => {
    const flags = [t.priority === 'high' ? '!' : '', t.source === 'claude' ? '(claude)' : ''].filter(Boolean);
    const blockers = openBlockers(t, ctx.byId).map((b) => b.id);
    const tail = [...flags, blockers.length ? `[blocked by ${blockers.join(', ')}]` : ''].filter(Boolean).join(' ');
    const status = showStatus ? `${t.status.padEnd(statusWidth)}  ` : '';
    return `  ${t.id.padEnd(width)}  ${status}${t.title}${tail ? `  ${tail}` : ''}`;
  });
}

function bodyArg(body: string | undefined, file: string | undefined): string | undefined {
  if (body !== undefined && file !== undefined) throw new Error('pass --body or --body-file, not both');
  return file === undefined ? body : readFileSync(file === '-' ? 0 : file, 'utf8');
}

/** For read commands: skips bad files instead of failing, so one broken file doesn't hide everything. */
function readCtx(): Ctx {
  return new Ctx(dataDir(), { lenient: true });
}

function noteBad(ctx: Ctx): void {
  if (ctx.bad.length) console.error(`belay: skipped ${plural(ctx.bad.length, 'bad file')}: ${ctx.bad.map(badFileNote).join('; ')}`);
}

// --- commands ---

function cmdNext(argv: string[]): void {
  const { values } = args(argv, { all: { type: 'boolean' } }, 0);
  const ctx = readCtx();
  noteBad(ctx);
  const n = next(ctx.projects, ctx.issues);
  const out: string[] = [];
  const section = (title: string, issues: Issue[]) => {
    if (issues.length) out.push(title, ...lines(issues, ctx));
  };
  const focusKeys = ctx.projects.filter((p) => p.focus && p.status === 'active').map((p) => p.key);
  section('doing', n.doing);
  section('high priority', n.high);
  section(`ready — focus: ${focusKeys.join(', ') || 'none'}`, n.focus);
  if (values.all) section('ready — other active projects', n.other);

  if (!n.doing.length && !n.high.length && !n.focus.length && !(values.all && n.other.length)) {
    out.push(focusKeys.length ? 'nothing ready in focus projects' : "no focus projects — 'belay project set <key> --focus'");
  }
  if (!values.all && n.other.length) out.push(`${n.other.length} more ready in other active projects (belay next --all)`);
  print(out);
}

function cmdAdd(argv: string[]): void {
  const manifests = activeManifests();
  const { values, positionals } = args(
    argv,
    withFieldOptions({
      project: { type: 'string', short: 'p' },
      status: { type: 'string', short: 's' },
      'blocked-by': { type: 'string', multiple: true },
      priority: { type: 'string' },
      source: { type: 'string' },
      grill: { type: 'string' },
      plan: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
    }, manifests),
    1,
  );
  const ctx = new Ctx();
  const project = values.project ? ctx.project(values.project) : projectForCwd(ctx.projects, process.cwd());
  if (!project) throw new Error(`cwd is not inside a registered project; pass --project <key>`);
  const issue = addIssue(
    ctx,
    {
      title: positionals[0],
      project: project.key,
      status: values.status,
      blockers: idList(values['blocked-by']),
      priority: values.priority,
      source: values.source,
      grill: values.grill,
      plan: values.plan,
      fields: fieldValues(values, manifests),
      body: bodyArg(values.body, values['body-file']),
    },
    commentAuthor(process.env),
  );
  print(`added ${issue.id} (${issue.status}): ${issue.title}`);
}

function cmdSet(argv: string[]): void {
  const { positionals } = args(argv, {}, 2);
  const { before, issue, open } = setStatus(new Ctx(), positionals[0], positionals[1], commentAuthor(process.env));
  print(`${issue.id}: ${before} → ${issue.status}`);
  if ((issue.status === 'doing' || issue.status === 'todo') && open.length) {
    print(`  note: still blocked by ${open.map((b) => `${b.id} (${b.status})`).join(', ')}`);
  }
}

function cmdEdit(argv: string[]): void {
  const manifests = activeManifests();
  const { values, positionals } = args(
    argv,
    withFieldOptions({
      title: { type: 'string' },
      'blocked-by': { type: 'string', multiple: true },
      priority: { type: 'string' },
      grill: { type: 'string' },
      plan: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
    }, manifests),
    1,
  );
  const issue = editIssue(new Ctx(), positionals[0], {
    title: values.title,
    blockers: values['blocked-by'] && idList(values['blocked-by']),
    priority: values.priority,
    grill: values.grill,
    plan: values.plan,
    fields: fieldValues(values, manifests),
    body: bodyArg(values.body, values['body-file']),
  });
  print(`updated ${issue.id}`);
}

function commentNumber(value: string): number {
  const n = Number(value.replace(/^#/, ''));
  if (!Number.isInteger(n) || n < 1) throw new Error(`comment number must be a positive integer (got '${value}')`);
  return n;
}

function cmdComment(argv: string[]): void {
  const { values, positionals } = args(argv, { edit: { type: 'string' }, delete: { type: 'string' }, as: { type: 'string' } }, 1, 2);
  if (values.edit !== undefined && values.delete !== undefined) throw new Error('pass --edit or --delete, not both');
  if (values.as !== undefined && (values.edit ?? values.delete) !== undefined) throw new Error('--as only applies to a new comment');
  const [id, text] = positionals;
  const ctx = new Ctx();
  if (values.delete !== undefined) {
    if (text !== undefined) throw new Error('--delete takes no text');
    const n = commentNumber(values.delete);
    return print(`deleted ${deleteComment(ctx, id, n).id} #${n}`);
  }
  if (text === undefined) throw new Error('comment text is required (- reads stdin)');
  const body = text === '-' ? readFileSync(0, 'utf8') : text;
  if (values.edit !== undefined) {
    const n = commentNumber(values.edit);
    return print(`edited ${editComment(ctx, id, n, body).id} #${n}`);
  }
  const { issue, n } = addComment(ctx, id, body, commentAuthor(process.env, values.as));
  print(`commented on ${issue.id} (#${n})`);
}

function cmdDelete(argv: string[]): void {
  const { positionals } = args(argv, {}, 1);
  const ctx = new Ctx();
  const { id } = ctx.issue(positionals[0]);
  const dependents = deleteIssue(ctx, id, commentAuthor(process.env));
  print(`deleted ${id}`);
  if (dependents.length) print(`  no longer blocked by it: ${dependents.map((t) => t.id).join(', ')}`);
}

function cmdShow(argv: string[]): void {
  const { positionals } = args(argv, {}, 1);
  const ctx = readCtx();
  noteBad(ctx);
  const t = ctx.issue(positionals[0]);
  const describe = (id: string) => {
    const b = ctx.byId.get(id);
    return b ? `${id} (${b.status})` : `${id} (missing)`;
  };
  const blocks = ctx.issues.filter((x) => x.blocked_by.includes(t.id)).map((x) => `${x.id} (${x.status})`);
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
    ...fieldLines(t, activeManifests(ctx.dir)),
    `dates:      created ${t.created}, updated ${t.updated.replace('T', ' ')}`,
    `file:       ${normalizeStoredPath(issueFile(ctx.dir, t.id))}`,
  ].filter(Boolean);
  if (t.body) out.push('', t.body);
  if (t.comments.length) {
    out.push('', 'comments');
    t.comments.forEach((c, i) => {
      out.push(`  #${i + 1}  ${c.at.slice(5).replace('T', ' ')}  ${c.by}`);
      for (const line of c.text.split('\n')) out.push(`      ${line}`.trimEnd());
    });
  }
  print(out);
}

/** Warn-only: always exits 0. */
function cmdCheck(argv: string[]): void {
  args(argv, {}, 0);
  const ctx = readCtx();
  const unknown = ctx.issues.map((t) => ({ id: t.id, keys: unknownKeys(t, KNOWN_ISSUE_KEYS) })).filter((u) => u.keys.length);
  const out: string[] = [];
  if (ctx.bad.length) out.push('bad files (nothing is written while one is listed):', ...ctx.bad.map((b) => `  ${b.file}  ${b.error}`));
  if (unknown.length) {
    const width = Math.max(...unknown.map((u) => u.id.length));
    out.push('issues with keys belay does not know (kept on save):', ...unknown.map((u) => `  ${u.id.padEnd(width)}  ${u.keys.join(', ')}`));
  }
  out.push(`${plural(ctx.bad.length, 'bad file')}, ${plural(unknown.length, 'issue')} with unknown keys`);
  print(out);
}

function cmdList(argv: string[]): void {
  const { values } = args(
    argv,
    {
      project: { type: 'string', short: 'p' },
      status: { type: 'string', short: 's' },
      priority: { type: 'string' },
      source: { type: 'string' },
      ready: { type: 'boolean' },
      blocked: { type: 'boolean' },
      sort: { type: 'string' },
      asc: { type: 'boolean' },
      desc: { type: 'boolean' },
    },
    0,
  );
  if (values.ready && values.blocked) throw new Error('pass --ready or --blocked, not both');
  if (values.asc && values.desc) throw new Error('pass --asc or --desc, not both');
  if ((values.asc || values.desc) && !values.sort) throw new Error('--asc and --desc need --sort');
  const ctx = readCtx();
  noteBad(ctx);
  const project = values.project ? ctx.project(values.project).key : undefined;
  const statuses: readonly IssueStatus[] =
    values.status === 'all'
      ? ISSUE_STATUSES
      : values.status
        ? idList([values.status]).map((s) => oneOf(s, ISSUE_STATUSES, '--status'))
        : ['idea', 'todo', 'doing'];
  const filter = {
    statuses,
    project,
    readiness: values.ready ? ('ready' as const) : values.blocked ? ('blocked' as const) : undefined,
    priority: values.priority === undefined ? undefined : oneOf(values.priority, ['high'] as const, '--priority'),
    source: values.source === undefined ? undefined : oneOf(values.source, SOURCES, '--source'),
  };
  const issues = filterIssues(ctx.issues, filter, ctx.byId);
  if (values.sort !== undefined) {
    const field = oneOf(values.sort, SORT_FIELDS, '--sort');
    issues.sort(issueComparator({ field, desc: values.desc || (!values.asc && naturalDesc(field)) }));
  }
  print(issues.length ? lines(issues, ctx, true) : 'no issues');
}

function intArg(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(n)) throw new Error(`${flag} must be a whole number (got '${value}')`);
  return n;
}

/** Like `intArg`, but `''` clears the field. */
function clearableIntArg(value: string | undefined, flag: string): number | null | undefined {
  return value?.trim() === '' ? null : intArg(value, flag);
}

function entryTags(e: { kind?: string; count?: number; minutes?: number; issue?: string }): string {
  return [e.kind && `${e.kind}${(e.count ?? 1) > 1 ? ` ×${e.count}` : ''}`, e.minutes && `${e.minutes}m`, e.issue].filter(Boolean).join(' ');
}

function cmdDid(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    {
      kind: { type: 'string', short: 'k' },
      count: { type: 'string', short: 'n' },
      minutes: { type: 'string', short: 'm' },
      issue: { type: 'string', short: 'i' },
      date: { type: 'string', short: 'd' },
    },
    2,
  );
  const [key, text] = positionals;
  const { entry, day, n } = addLog(
    new Ctx(),
    {
      project: key,
      text: text === '-' ? readFileSync(0, 'utf8') : text,
      kind: values.kind,
      count: intArg(values.count, '--count'),
      minutes: intArg(values.minutes, '--minutes'),
      issue: values.issue,
      day: values.date,
    },
    commentAuthor(process.env),
  );
  const tags = entryTags(entry);
  print(`logged ${entry.project} ${day}/${n}${tags ? ` (${tags})` : ''}`);
}

function cmdLog(argv: string[]): void {
  if (argv[0] === 'delete') {
    const { positionals } = args(argv.slice(1), {}, 1);
    const e = deleteLog(new Ctx(), positionals[0]);
    return print(`deleted ${positionals[0]} (${e.project}: ${clip(e.text, 60)})`);
  }
  if (argv[0] === 'edit') {
    const { values, positionals } = args(
      argv.slice(1),
      {
        text: { type: 'string', short: 't' },
        kind: { type: 'string', short: 'k' },
        count: { type: 'string', short: 'n' },
        minutes: { type: 'string', short: 'm' },
        issue: { type: 'string', short: 'i' },
        date: { type: 'string', short: 'd' },
      },
      1,
    );
    if (Object.values(values).every((v) => v === undefined)) throw new Error('nothing to edit (see belay help)');
    const before = parseLogAddress(positionals[0]);
    const { day, n } = editLog(new Ctx(), positionals[0], {
      text: values.text === '-' ? readFileSync(0, 'utf8') : values.text,
      kind: values.kind,
      count: clearableIntArg(values.count, '--count'),
      minutes: clearableIntArg(values.minutes, '--minutes'),
      issue: values.issue,
      day: values.date,
    });
    return print(day === before.day ? `edited ${day}/${n}` : `edited, moved to ${day}/${n}`);
  }
  const { values, positionals } = args(argv, { since: { type: 'string', short: 's' } }, 0, 1);
  const ctx = readCtx();
  const key = positionals[0] ? ctx.project(positionals[0]).key : undefined;
  const to = workDay();
  const since = values.since ?? '7d';
  const days = /^(\d+)d$/.exec(since);
  const from = days && Number(days[1]) > 0 ? addDays(to, 1 - Number(days[1])) : isDay(since) ? since : undefined;
  if (!from) throw new Error(`--since must be <n>d or YYYY-MM-DD (got '${since}')`);
  const entries = ctx
    .logs(from, to)
    .filter((e) => !key || e.project === key)
    .reverse();
  if (!entries.length) return print('no log entries');
  const addr = (e: DatedEntry) => `${e.day}/${e.n}`;
  const addrW = Math.max(...entries.map((e) => addr(e).length));
  const keyW = Math.max(...entries.map((e) => e.project.length));
  const out: string[] = [];
  for (const e of entries) {
    const late = workDayOf(e.at) === e.day ? '' : ` (logged ${e.at.slice(5).replace('T', ' ')})`;
    const tags = entryTags(e);
    const [first, ...more] = e.text.split('\n');
    out.push(`  ${addr(e).padEnd(addrW)}  ${e.at.slice(11)}  ${e.project.padEnd(keyW)}  ${tags ? `[${tags}] ` : ''}${first}${late}`);
    for (const line of more) out.push(`${' '.repeat(addrW + keyW + 13)}${line}`.trimEnd());
  }
  print(out);
}

function cmdWeek(argv: string[]): void {
  const { values } = args(argv, { last: { type: 'boolean' } }, 0);
  const ctx = readCtx();
  const day = workDay();
  const week = values.last ? addDays(weekStart(day), -7) : weekStart(day);
  const projects = ctx.projects.filter((p) => p.status !== 'archived');
  const commits = Object.fromEntries(projects.map((p) => [p.key, weekCommits(p, week).map((c) => c.time)]));
  print(weekLines(weekSummary(projects, ctx.issues, ctx.logs(week, addDays(week, 6)), commits, week, day), week));
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
  const ctx = readCtx();
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

async function cmdSearch(argv: string[]): Promise<void> {
  const { positionals } = args(argv, {}, 1, Infinity);
  const words = positionals.map((w) => w.toLowerCase());
  const ctx = readCtx();
  const issues = ctx.issues.filter((t) => {
    const hay = [t.title, t.body, ...t.comments.map((c) => c.text)].join('\n').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const out: string[] = [];
  if (issues.length) out.push('issues', ...lines(issues, ctx, true));
  for (const m of activeManifests(ctx.dir)) if (m.cli?.search) out.push(...(await m.cli.search())(words, ctx.dir));
  print(out.length ? out : 'no matches');
}

function cmdGit(argv: string[]): void {
  const [sub, ...rest] = argv;
  if (sub !== 'init') throw new Error(`unknown 'git ${sub ?? ''}' — expected init`);
  args(rest, {}, 0);
  const dir = dataDir();
  initHistory(dir);
  print(`started git history in ${normalizeStoredPath(dir)}`);
}

function cmdServe(argv: string[]): void {
  const { values } = args(argv, { port: { type: 'string' }, open: { type: 'boolean' }, dev: { type: 'boolean' } }, 0);
  const port = Number(values.port ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port must be 1–65535 (got '${values.port}')`);
  serve({ port, open: values.open ?? true, dev: values.dev ?? false }).catch((e: Error) => {
    console.error(`belay: ${e.message}`);
    process.exitCode = 1;
  });
}

/** Must never fail the session start: any error goes to stderr and the exit code stays 0. */
async function cmdDigest(argv: string[]): Promise<void> {
  args(argv, {}, 0);
  try {
    let input: { cwd?: unknown; session_id?: unknown; source?: unknown } = {};
    if (!process.stdin.isTTY) {
      try {
        input = JSON.parse(readFileSync(0, 'utf8'));
      } catch {
        // no payload: fall back to the process cwd
      }
    }
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const ctx = readCtx();
    const project = projectForCwd(ctx.projects, cwd);
    if (!project) return;
    if (input.source === 'compact') {
      print(digestLines(project, ctx.issues, [], { bad: ctx.bad, compact: true }));
      return;
    }
    const exclude = typeof input.session_id === 'string' ? input.session_id : undefined;
    const sessions = recentSessions(claudeDir(), ctx.projects, { project, limit: 3, exclude });
    attachCommits(sessions, ctx.projects);
    print(digestLines(project, ctx.issues, sessions, { bad: ctx.bad }));
    for (const m of activeManifests(ctx.dir)) {
      try {
        const section = m.cli?.digest && (await m.cli.digest())(project, ctx.issues, ctx.dir);
        if (section?.length) print(section);
      } catch (e) {
        console.error(`belay digest: ${m.id}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.error(`belay digest: ${(e as Error).message}`);
  }
}

/** Like digest, never fails: the status line just goes without Belay's line. Reads files only, no git. */
function cmdStatusline(argv: string[]): void {
  args(argv, {}, 0);
  try {
    let input: { cwd?: unknown; workspace?: { current_dir?: unknown } } = {};
    if (!process.stdin.isTTY) {
      try {
        input = JSON.parse(readFileSync(0, 'utf8'));
      } catch {
        // no payload: fall back to the process cwd
      }
    }
    const dir = input.workspace?.current_dir ?? input.cwd;
    const ctx = readCtx();
    const project = projectForCwd(ctx.projects, typeof dir === 'string' ? dir : process.cwd());
    const line = withBad(project ? statusLine(project, ctx.issues) : '', ctx.bad.length);
    if (line) print(line);
  } catch (e) {
    console.error(`belay statusline: ${(e as Error).message}`);
  }
}

function cmdProject(argv: string[]): void {
  const [sub, ...rest] = argv;
  if (sub === 'add') return projectAdd(rest);
  if (sub === 'list') return projectList(rest);
  if (sub === 'set') return projectSet(rest);
  if (sub === 'move') return projectMove(rest);
  if (sub === 'rekey') return projectRekey(rest);
  if (sub === 'which') return projectWhich(rest);
  throw new Error(`unknown 'project ${sub ?? ''}' — expected add, list, set, move, rekey or which`);
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
  print(`added project ${project.key} — issues will be ${project.key}-1, ${project.key}-2, …`);
}

function projectMove(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    { before: { type: 'string' }, after: { type: 'string' }, top: { type: 'boolean' }, bottom: { type: 'boolean' } },
    1,
  );
  const given = [values.before !== undefined, values.after !== undefined, !!values.top, !!values.bottom].filter(Boolean).length;
  if (given !== 1) throw new Error('pass exactly one of --before, --after, --top or --bottom');
  const where: MoveTarget =
    values.before !== undefined
      ? { before: values.before }
      : values.after !== undefined
        ? { after: values.after }
        : values.top
          ? 'top'
          : 'bottom';
  const ctx = new Ctx();
  const key = ctx.project(positionals[0]).key;
  print(`moved ${key}: ${moveProject(ctx, key, where).join(' ')}`);
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
  const ctx = readCtx();
  const projects = ctx.projects
    .filter((p) => values.all || p.status !== 'archived')
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  if (!projects.length) return print("no projects — 'belay project add'");
  const keyW = Math.max(...projects.map((p) => p.key.length));
  const nameW = Math.max(...projects.map((p) => p.name.length));
  const statusW = Math.max(...projects.map((p) => p.status.length));
  print(
    projects.map((p) => {
      const c = projectCounts(p, ctx.issues, ctx.byId);
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
  const project = projectForCwd(readCtx().projects, positionals[0] ?? process.cwd());
  if (project) print(project.key);
}

function projectSet(argv: string[]): void {
  const { values, positionals } = args(
    argv,
    {
      status: { type: 'string' },
      focus: { type: 'boolean' },
      name: { type: 'string' },
      group: { type: 'string' },
      icon: { type: 'string' },
      color: { type: 'string' },
      kinds: { type: 'string' },
      path: { type: 'string', multiple: true },
    },
    1,
  );
  const { kinds, path: paths, ...rest } = values;
  const p = editProject(new Ctx(), positionals[0], { ...rest, kinds: kinds === undefined ? undefined : idList([kinds]), paths });
  if (paths) for (const dir of p.paths.filter((d) => !existsSync(d))) console.error(`warning: ${dir} does not exist`);
  const parts = [p.status, p.focus && 'focus', p.kinds && `kinds ${p.kinds.join(', ')}`];
  print(`updated project ${p.key}: ${parts.filter(Boolean).join(', ')}`);
}

async function cmdExtension(argv: string[]): Promise<void> {
  const { positionals } = args(argv, {}, 2);
  const [action, raw] = positionals;
  if (action !== 'on' && action !== 'off') throw new Error(`expected on or off, got '${action}' — see 'belay help'`);
  const id = extensionId(raw);
  const dir = dataDir();
  if (action === 'off') {
    const live = await attachedSessions(dir, id);
    if (live.length) throw new Error(`a ${id} session is attached (${live.join(', ')}): switch ${id} off once it detaches`);
  }
  print(setExtension(new Ctx(dir), id, action === 'on') ? `${id} ${action}` : `${id} was already ${action}`);
}

const COMMANDS: Record<string, Command> = {
  next: cmdNext,
  add: cmdAdd,
  set: cmdSet,
  edit: cmdEdit,
  comment: cmdComment,
  delete: cmdDelete,
  show: cmdShow,
  list: cmdList,
  did: cmdDid,
  log: cmdLog,
  week: cmdWeek,
  history: cmdHistory,
  search: cmdSearch,
  check: cmdCheck,
  extension: cmdExtension,
  git: cmdGit,
  claude: (argv) => launchCommand(argv),
  serve: cmdServe,
  digest: cmdDigest,
  statusline: cmdStatusline,
  project: cmdProject,
};

/** Core commands resolve before the settings are read, so the status line and the digest never wait on them. */
async function main([cmd, ...rest]: string[]): Promise<void> {
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return print(helpText(activeManifests()));
    const run = COMMANDS[cmd] ?? (await activeManifests().find((m) => m.cli?.commands?.[cmd])?.cli?.commands?.[cmd]());
    if (!run) throw new Error(`unknown command '${cmd}' — see 'belay help'`);
    await run(rest);
  } catch (e) {
    console.error(`belay: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

await main(process.argv.slice(2));
