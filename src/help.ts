/** `belay help`: the core usage with the active extensions' lines. */
import { bundled, installedIds } from './extension-ids.ts';
import type { CliHelp, ExtensionManifest } from './extensions.ts';

/** Core usage, with the active extensions' flags, clauses and finds. Their own commands go in by `withEntries`. */
const HELP = (h: Required<Omit<CliHelp, 'commands'>>, ids: readonly string[], bundledIds: readonly string[]) => `belay — what should I work on?

  next [--all]                      doing, high-priority, then ready issues in focus projects
  add "<title>" [--project <key>] [--status idea|todo] [--blocked-by <id>...]
                ${['[--priority high] [--source user|claude]', h.add].filter(Boolean).join(' ')}
                [--body <text> | --body-file <path|->]
  set <id> <status>                 idea|todo|doing|done|dropped
  edit <id> [--title <t>] [--blocked-by <id>...] [--priority high|none]
            ${[h.edit, '[--body <text> | --body-file <path|->]'].filter(Boolean).join(' ')}
                                    --body/--body-file set the description (- reads stdin)
  comment <id> <text|-> [--as user|claude]
  comment <id> --edit <n> <text|->  |  comment <id> --delete <n>
                                    log an entry on the issue (- reads stdin); #n as numbered in show.
                                    Author is claude inside Claude Code, else user
  delete <id>                       erase an issue for good; strips it from its dependents' blockers
  show <id>
  did <key> "<text>" [--kind <k>] [--count <n>] [--minutes <n>] [--issue <id>] [--date yesterday|YYYY-MM-DD]
                                    log work done on a project (up to 7 days back); --kind must be one the
                                    project declares, --count needs it (default 1)
  log [<key>] [--since 7d|YYYY-MM-DD]
                                    log entries, newest first, addressed <day>/<n>
  log delete <day>/<n>
  log edit <day>/<n> [--text <t>|-] [--kind <k>] [--count <n>] [--minutes <n>] [--issue <id>]
           [--date today|yesterday|YYYY-MM-DD]
                                    '' clears kind (and count), count, minutes or issue; --date moves
                                    the entry to the end of that day (up to 7 days back)
  list [--project <key>] [--status <s,...>|all] [--priority high] [--source user|claude]
       [--ready | --blocked] [--sort id|title|created|updated] [--asc | --desc]
                                    default hides done and dropped; --blocked is any status with an
                                    open blocker; --sort starts newest first for updated, else ascending
  week [--last]                     this (or last) Mon–Sun week per project: days moved, issues done,
                                    commits and log entries

  history [<project>] [-n <count>] [-v]
                                    recent Claude sessions and their commits, newest first
  git init                          start git history for the data dir: from then on every change is a
                                    commit (git log/revert in the data dir to look back or undo)
${entry('claude [args]', `Claude Code with the Belay channel (args go to claude)${h.claude}`)}
  search <words>...                 ${['issues (title, description, comments)', h.search].filter(Boolean).join(' and ')} with every word
  check                             report bad files (nothing is written while one exists) and issue
                                    frontmatter keys belay doesn't know (kept on save)
  extension on|off <id>             switch an installed extension (${ids.join(', ') || 'none installed'}) in settings.yaml; off is
                                    refused while one of its sessions is attached. Its data is never touched
  extension install|uninstall <id>  install a bundled extension (${bundledIds.join(', ')}): its dependencies, site pages
                                    and Claude Code plugin; uninstall takes them away (refused while attached),
                                    keeping its data and its switch. Restart 'belay serve' to see the change
  serve [--port <n>] [--no-open] [--dev]
                                    dashboard at http://127.0.0.1:4747/ (Ctrl+C to stop); builds web/
                                    first when it, src/ or extensions/ changed (needs 'pnpm install');
                                    --dev skips the build and runs next dev, so edits show up live
  digest                            SessionStart hook: reads the hook JSON on stdin, prints a summary
                                    if its cwd is in a registered project, else nothing
  statusline                        status line command: reads Claude Code's status JSON on stdin, prints
                                    the project's doing issue (or next ready one)

  project add [<key>] --name <name> --path <dir>... [--group <g>] [--focus]
                                    key: 3–4 letters, the issue-ID prefix (ELV-12); derived from
                                    the name when omitted (3 letters, 4 on a clash)
  project list [--all]              --all includes archived
  project set <key> [--status active|paused|archived] [--focus|--no-focus] [--name <n>] [--group <g>]
                    [--kinds a,b] [--path <dir>...] [--icon <path>] [--color <#hex>]
                                    --path replaces the project's dirs. --icon: an image, absolute or relative to
                                    the first dir (empty clears). --color: the app's colour for it, #rgb or #rrggbb
                                    (empty clears). kinds: log-entry kinds (empty clears)
  project move <key> (--before <key> | --after <key> | --top | --bottom)
                                    rearrange the order projects are listed in (here and the sidebar)
  project rekey <key> <new-key>     rename the key and every issue ID in the project, fixing blockers
  project which [<dir>]             key of the project containing <dir> (default cwd); prints nothing if none

--project defaults to the project whose path contains the cwd. --blocked-by takes
repeated flags or a comma list. Keys and IDs are case-insensitive. Data dir: $BELAY_DATA (default ~/Belay).`;

const USAGE_W = 34;
const HELP_W = 110;

/** A usage entry, its text from column 36 wrapped at `HELP_W`; a usage too wide for its column gets a line of its own. */
function entry(usage: string, text: string): string {
  const wide = usage.length >= USAGE_W;
  const out: string[] = wide ? [`  ${usage}`] : [];
  let line = wide ? ' '.repeat(USAGE_W + 2) : `  ${usage.padEnd(USAGE_W)}`;
  let fresh = true;
  for (const word of text.split(' ')) {
    if (!fresh && line.length + 1 + word.length > HELP_W) {
      out.push(line);
      line = ' '.repeat(USAGE_W + 2);
      fresh = true;
    }
    line += `${fresh ? '' : ' '}${word}`;
    fresh = false;
  }
  return [...out, line].join('\n');
}

/** `text` with each extension command's entry after the entry of the command it names, in manifest order. */
function withEntries(text: string, entries: NonNullable<CliHelp['commands']>): string {
  // Blocks start at a line that isn't a continuation (indented past two spaces).
  const blocks: { text: string; after?: string }[] = text.split(/\n(?! {3})/).map((t) => ({ text: t }));
  for (const e of entries) {
    let i = blocks.findIndex((b) => b.text.startsWith(`  ${e.after} `));
    if (i < 0) throw new Error(`help: no command '${e.after}' to put '${e.usage}' after`);
    while (blocks[i + 1]?.after === e.after) i++;
    blocks.splice(i + 1, 0, { text: entry(e.usage, e.text), after: e.after });
  }
  return blocks.map((b) => b.text).join('\n');
}

export function helpText(
  manifests: readonly ExtensionManifest[],
  ids: readonly string[] = installedIds(),
  bundledIds: readonly string[] = bundled().map((e) => e.id),
): string {
  const help = manifests.flatMap((m) => m.cli?.help ?? []);
  const words = (k: 'add' | 'edit' | 'search') => help.flatMap((h) => h[k] ?? []).join(k === 'search' ? ' and ' : ' ');
  const core = HELP({ add: words('add'), edit: words('edit'), search: words('search'), claude: help.map((h) => h.claude ?? '').join('') }, ids, bundledIds);
  return withEntries(core, help.flatMap((h) => h.commands ?? []));
}
