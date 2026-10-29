import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANIFESTS, type ExtensionManifest } from '../src/extensions.ts';
import { helpText } from '../src/help.ts';

const usage = (text: string, cmd: string) => text.split('\n').filter((l) => l.startsWith(`  ${cmd} `));

test('with no extension active, help has none of their commands, flags or clauses', () => {
  const text = helpText([]);
  // `belay extension` names every built-in, on or off.
  assert.doesNotMatch(text.replace(/\(grill, learn\)/, ''), /grill|lesson|learn/i);
  assert.match(text, /^ {16}\[--priority high\] \[--source user\|claude\]\n/m);
  assert.match(text, /^ {12}\[--body <text> \| --body-file <path\|->\]\n/m);
  assert.deepEqual(usage(text, 'claude'), ['  claude [args]                     Claude Code with the Belay channel (args go to claude)']);
  assert.deepEqual(usage(text, 'search'), ['  search <words>...                 issues (title, description, comments) with every word']);
});

test("the built-ins' entries follow the commands they name, wrapped at 110 columns", () => {
  const lines = helpText(MANIFESTS).split('\n');
  const at = (prefix: string) => lines.findIndex((l) => l.startsWith(prefix));
  assert.equal(at('  grill commit <slug>'), at('  git init') + 2);
  assert.equal(lines[at('  grill commit') + 1], '                                    skill runs it when its plan is accepted); in-progress grills are refused');
  assert.equal(lines[at('  claude [args]') + 1], '                                    lesson restarts its session');
  assert.equal(at('  learn [args]'), at('  claude [args]') + 2);
});

test('entries after the same command keep manifest order; an unknown command throws', () => {
  const ext = (usage: string, after = 'week'): ExtensionManifest => ({
    id: 'grill',
    skills: [],
    cli: { help: { commands: [{ after, usage, text: usage }] } },
  });
  const lines = helpText([ext('one'), ext('two')]).split('\n');
  const week = lines.findIndex((l) => l.startsWith('  week '));
  assert.deepEqual([lines[week + 2], lines[week + 3]].map((l) => l.trim().split(/\s+/)[0]), ['one', 'two']);
  assert.throws(() => helpText([ext('x', 'nope')]), /help: no command 'nope' to put 'x' after/);
});
