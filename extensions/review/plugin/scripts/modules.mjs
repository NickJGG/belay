#!/usr/bin/env node
// modules: splits a whole repo (or the folders given by --paths) into modules for review.
//
// stdout: {modules:[{name, dir, files:[{path, status, bytes, classes}], bytes}], excluded:[{path, reason}]}
// Files are the tracked ones (status "A"). Excluded reasons: secret (never read, the orchestrator
// reports it), lockfile, vendored, generated, binary, user_rule (--exclude).
import { resolve } from 'node:path';
import { splitCsv } from './lib/files.mjs';
import { args, emit, fail } from './lib/cli.mjs';
import { listModules } from './lib/modules.mjs';
import { repoRoot } from './lib/repo.mjs';

const NAME = 'modules';

function main() {
  const { values } = args(NAME, {
    repo: { type: 'string', default: '.' },
    paths: { type: 'string', default: '' },
    exclude: { type: 'string', default: '' },
  });
  const root = repoRoot(resolve(values.repo));
  if (!root) fail(NAME, `not a git repository: ${resolve(values.repo)}`);
  emit(listModules(root, { paths: splitCsv(values.paths), exclude: splitCsv(values.exclude) }));
}

main();
