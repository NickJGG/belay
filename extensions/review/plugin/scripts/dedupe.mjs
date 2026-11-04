#!/usr/bin/env node
// dedupe: merges findings that share a root cause before verification.
//
// stdin: [finding] (shape in references/formats.md; root_cause_key required).
// stdout: [{root_cause_key, findings, found_by, severity}]; see lib/dedupe.mjs.
import { args, emit, fail, readStdinJson } from './lib/cli.mjs';
import { dedupe, validFinding } from './lib/dedupe.mjs';

const NAME = 'dedupe';

function main() {
  args(NAME, {});
  const findings = readStdinJson(NAME);
  if (!Array.isArray(findings)) fail(NAME, 'input must be a JSON array of findings');
  if (!findings.every(validFinding)) fail(NAME, 'every finding needs a non-empty root_cause_key');
  emit(dedupe(findings));
}

main();
