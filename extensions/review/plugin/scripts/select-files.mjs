#!/usr/bin/env node
// select-files: splits the changed-file records into what reviewers get and what they don't.
//
// stdin: [{path, status, insertions, deletions, bytes, diff?}] (`insertions: null` = binary,
// as `git diff --numstat` prints "-"). An optional `diff` text adds content-signal classes.
// stdout: {reviewable:[{path, status, ext, bytes, classes}], excluded:[{path, reason}],
//          secrets:[path], oversized:[path]}; see lib/select.mjs for the gate order.
import { DEFAULT_MAX_FILE_DIFF_BYTES, explain, normalizePath, splitCsv } from './lib/files.mjs';
import { args, emit, fail, readStdinJson } from './lib/cli.mjs';
import { selectFiles } from './lib/select.mjs';

const NAME = 'select-files';

function main() {
  const { values } = args(NAME, {
    paths: { type: 'string', default: '' },
    exclude: { type: 'string', default: '' },
    'max-file-diff-bytes': { type: 'string' },
    explain: { type: 'string' },
  });
  if (values.explain !== undefined) return emit(explain(normalizePath(values.explain)));

  const maxBytes = values['max-file-diff-bytes'] === undefined ? DEFAULT_MAX_FILE_DIFF_BYTES : Number(values['max-file-diff-bytes']);
  if (!Number.isInteger(maxBytes) || maxBytes < 0) fail(NAME, '--max-file-diff-bytes needs a non-negative integer');

  const records = readStdinJson(NAME);
  if (!Array.isArray(records) || !records.every((r) => r && typeof r === 'object' && typeof r.path === 'string')) {
    fail(NAME, "expected a JSON array of objects with a 'path' field");
  }
  emit(selectFiles(records, { paths: splitCsv(values.paths), exclude: splitCsv(values.exclude), maxBytes }));
}

main();
