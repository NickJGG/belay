#!/usr/bin/env node
// discover: one call that tells the orchestrator what the repo is and how to check it.
// Read-only: it finds check commands but never runs them.
//
// stdout: {root, defaultBranch, workspaces:[{dir, manager, scripts:{typecheck, lint, test}}],
//          languages:{<name>: fileCount}, tools:{git, gh, codex}, ruleFiles:{review, claude:[…]}}
// `scripts` values are commands to run in that dir, or null. JS workspaces are the root and
// every package listed in package.json `workspaces` or pnpm-workspace.yaml; other toolchains
// (python, go, cargo, dotnet, maven, gradle, ruby, php) are detected at the root.
// defaultBranch is a branch name (origin/HEAD's target, else main or master), or null.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { args, emit } from './lib/cli.mjs';
import { git, jsWorkspaceDirs, readJson, repoRoot, toPosix, trackedFiles, which } from './lib/repo.mjs';

const NAME = 'discover';

const LOCKFILES = [['pnpm-lock.yaml', 'pnpm'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm']];
const SCRIPT_NAMES = { typecheck: ['typecheck', 'type-check', 'tsc'], lint: ['lint'], test: ['test'] };
const LANGUAGES = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  cs: 'C#', fs: 'F#', lua: 'Lua', rb: 'Ruby', php: 'PHP', swift: 'Swift', dart: 'Dart',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++',
  sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', sql: 'SQL',
  html: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS', vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  md: 'Markdown', mdx: 'Markdown',
};

function defaultBranch(root) {
  const head = git(root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  if (head?.trim()) return head.trim().replace(/^origin\//, '');
  for (const name of ['main', 'master']) {
    if (git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`) !== null) return name;
    if (git(root, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}`) !== null) return name;
  }
  return null;
}

// The nearest lockfile from the package up to the root decides; then packageManager; then npm.
function manager(root, dir, rootPkg) {
  let current = resolve(root, dir);
  const top = resolve(root);
  while (true) {
    for (const [file, name] of LOCKFILES) if (existsSync(join(current, file))) return name;
    if (current === top) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const declared = /^(pnpm|npm|yarn|bun)@/.exec(rootPkg?.packageManager ?? '');
  return declared ? declared[1] : 'npm';
}

function runCommand(mgr, script) {
  if (mgr === 'npm') return script === 'test' ? 'npm test' : `npm run ${script}`;
  if (mgr === 'yarn') return `yarn ${script}`;
  return `${mgr} run ${script}`;
}

const EXEC = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' };

function jsScripts(root, dir, mgr) {
  const pkg = readJson(join(root, dir, 'package.json')) ?? {};
  const scripts = pkg.scripts ?? {};
  const out = {};
  for (const [kind, names] of Object.entries(SCRIPT_NAMES)) {
    const name = names.find((n) => typeof scripts[n] === 'string' && !/no test specified/.test(scripts[n]));
    out[kind] = name ? runCommand(mgr, name) : null;
  }
  if (!out.typecheck && existsSync(join(root, dir, 'tsconfig.json'))) out.typecheck = `${EXEC[mgr]} tsc --noEmit`;
  return out;
}

function fileText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function otherToolchains(root) {
  const has = (f) => existsSync(join(root, f));
  const out = [];
  const add = (mgr, typecheck, lint, test) => out.push({ dir: '.', manager: mgr, scripts: { typecheck, lint, test } });

  if (['pyproject.toml', 'setup.cfg', 'setup.py', 'requirements.txt'].some(has)) {
    const config = fileText(join(root, 'pyproject.toml')) + fileText(join(root, 'setup.cfg'));
    const uses = (tool) => which(tool) || config.includes(tool);
    add('python',
      uses('mypy') ? 'mypy .' : uses('pyright') ? 'pyright' : null,
      uses('ruff') ? 'ruff check .' : uses('flake8') ? 'flake8' : null,
      uses('pytest') ? 'pytest' : null);
  }
  if (has('go.mod')) add('go', 'go vet ./...', which('golangci-lint') ? 'golangci-lint run' : null, 'go test ./...');
  if (has('Cargo.toml')) add('cargo', 'cargo check', 'cargo clippy', 'cargo test');
  let rootEntries = [];
  try {
    rootEntries = readdirSync(root);
  } catch {}
  if (rootEntries.some((f) => /\.(sln|slnx|csproj|fsproj)$/i.test(f))) add('dotnet', 'dotnet build', 'dotnet format --verify-no-changes', 'dotnet test');
  if (has('pom.xml')) {
    const mvn = has('mvnw') ? './mvnw' : 'mvn';
    add('maven', `${mvn} -q compile`, null, `${mvn} test`);
  }
  if (has('build.gradle') || has('build.gradle.kts')) {
    const gradle = has('gradlew') ? './gradlew' : 'gradle';
    add('gradle', `${gradle} classes`, null, `${gradle} test`);
  }
  if (has('Gemfile')) add('ruby', null, which('rubocop') ? 'rubocop' : null, has('spec') ? 'bundle exec rspec' : 'bundle exec rake test');
  if (has('composer.json')) add('php', null, null, 'vendor/bin/phpunit');
  return out;
}

function languages(files) {
  const counts = {};
  for (const file of files) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    const lang = dot > 0 ? LANGUAGES[base.slice(dot + 1).toLowerCase()] : undefined;
    if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function ruleFiles(root, inGit) {
  const review = existsSync(join(root, 'REVIEW.md')) ? 'REVIEW.md' : null;
  // Untracked but not ignored files count: a new CLAUDE.md in the change applies to it.
  const claude = inGit
    ? trackedFiles(root, '--cached', '--others', '--exclude-standard', '--', 'CLAUDE.md', '*/CLAUDE.md', 'AGENTS.md', '*/AGENTS.md')
    : ['CLAUDE.md', 'AGENTS.md'].filter((f) => existsSync(join(root, f)));
  return { review, claude: [...new Set(claude)].sort() };
}

function main() {
  const { values } = args(NAME, { repo: { type: 'string', default: '.' } });
  const start = resolve(values.repo);
  const gitRoot = repoRoot(start);
  const root = gitRoot ?? start;

  const rootPkg = readJson(join(root, 'package.json'));
  const workspaces = jsWorkspaceDirs(root).map((dir) => {
    const mgr = manager(root, dir, rootPkg);
    return { dir, manager: mgr, scripts: jsScripts(root, dir, mgr) };
  });
  workspaces.push(...otherToolchains(root));

  emit({
    root: toPosix(root),
    defaultBranch: gitRoot ? defaultBranch(root) : null,
    workspaces,
    languages: languages(gitRoot ? trackedFiles(root) : []),
    tools: { git: which('git'), gh: which('gh'), codex: which('codex') },
    ruleFiles: ruleFiles(root, Boolean(gitRoot)),
  });
}

main();
