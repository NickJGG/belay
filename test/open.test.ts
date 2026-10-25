import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { linkedPath } from '../src/open.ts';

const tmp = mkdtempSync(join(tmpdir(), 'belay-open-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const dirs = { data: resolve('/data'), sear: join(tmp, 'sear'), claude: join(tmp, 'claude') };
const archive = join(dirs.claude, 'skills', 'grill', 'sessions');

const write = (dir: string, slug: string) => {
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, `${slug}.md`), '');
};

test('file resolves to the issue file', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'file', dirs), join(dirs.data, 'issues', 'trk-1.md'));
});

test('grill resolves to its session file in Sear, else in the old grill archive', () => {
  write(dirs.sear, 'sear-phase-7-switch-over');
  write(archive, 'old-topic');
  assert.equal(
    linkedPath({ id: 'SEAR-7', grill: 'sear-phase-7-switch-over' }, 'grill', dirs),
    join(dirs.sear, 'sear-phase-7-switch-over', 'sear-phase-7-switch-over.md'),
  );
  assert.equal(linkedPath({ id: 'TRK-1', grill: 'old-topic' }, 'grill', dirs), join(archive, 'old-topic', 'old-topic.md'));
});

test('plan resolves to an absolute path', () => {
  assert.equal(linkedPath({ id: 'TRK-1', plan: 'C:/plans/p.md' }, 'plan', dirs), resolve('C:/plans/p.md'));
});

test('undefined when the issue has no grill or plan', () => {
  assert.equal(linkedPath({ id: 'TRK-1' }, 'grill', dirs), undefined);
  assert.equal(linkedPath({ id: 'TRK-1', grill: 'x' }, 'plan', dirs), undefined);
});
