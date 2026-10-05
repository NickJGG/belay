import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDrop, dropPlan, reorder, sectionNeighbours, sidebarSections, type SidebarProject } from '../src/sidebar.ts';

const p = (key: string, over: Partial<SidebarProject> = {}): SidebarProject => ({ key, name: key, status: 'active', focus: false, ...over });

// In stored order, deliberately not alphabetical.
const projects = [
  p('TRK', { focus: true }),
  p('ELV', { focus: true, group: 'Games' }),
  p('OLD', { status: 'paused', group: 'Games' }),
  p('FRG', { group: 'Games' }),
  p('ZED', { status: 'archived' }),
  p('CLI'),
  p('APP', { group: 'Apps' }),
];
const sections = sidebarSections(projects);
const shape = (ps: SidebarProject[]) => sidebarSections(ps).map((s) => `${s.id}=${s.projects.map((x) => x.key).join(',')}`);

test('sections: focus, then groups alphabetically, ungrouped last, each in stored order', () => {
  assert.deepEqual(shape(projects), ['focus=TRK,ELV', 'group:Apps=APP', 'group:Games=OLD,FRG', 'group:=CLI']);
});

test('a focused paused project sits in its group, and empty sections are left out', () => {
  assert.deepEqual(shape([p('A', { focus: true, status: 'paused', group: 'G' })]), ['group:G=A']);
});

test('reorder handles every target and rejects bad anchors', () => {
  const keys = ['A', 'B', 'C'];
  assert.deepEqual(reorder(keys, 'C', 'top'), ['C', 'A', 'B']);
  assert.deepEqual(reorder(keys, 'A', 'bottom'), ['B', 'C', 'A']);
  assert.deepEqual(reorder(keys, 'C', { before: 'B' }), ['A', 'C', 'B']);
  assert.deepEqual(reorder(keys, 'A', { after: 'B' }), ['B', 'A', 'C']);
  assert.throws(() => reorder(keys, 'A', { before: 'A' }), /itself/);
  assert.throws(() => reorder(keys, 'A', { before: 'Q' }), /no project/);
});

test('dropping within a section only moves', () => {
  assert.deepEqual(dropPlan(sections, 'ELV', 'focus', 'TRK'), { patch: undefined, move: { before: 'TRK' } });
  assert.deepEqual(dropPlan(sections, 'OLD', 'group:Games', null), { patch: undefined, move: { after: 'FRG' } });
});

test('a drop that changes nothing is null', () => {
  assert.equal(dropPlan(sections, 'TRK', 'focus', 'TRK'), null);
  assert.equal(dropPlan(sections, 'TRK', 'focus', 'ELV'), null);
  assert.equal(dropPlan(sections, 'ELV', 'focus', null), null);
});

test('group → Focus focuses and keeps the group', () => {
  assert.deepEqual(dropPlan(sections, 'FRG', 'focus', null), { patch: { focus: true }, move: { after: 'ELV' } });
});

test('Focus → group unfocuses and sets the group, clearing it for Projects', () => {
  assert.deepEqual(dropPlan(sections, 'ELV', 'group:Apps', 'APP'), { patch: { focus: false, group: 'Apps' }, move: { before: 'APP' } });
  assert.deepEqual(dropPlan(sections, 'ELV', 'group:', null), { patch: { focus: false, group: '' }, move: { after: 'CLI' } });
});

test('group → group changes the group', () => {
  assert.deepEqual(dropPlan(sections, 'CLI', 'group:Games', 'OLD'), { patch: { group: 'Games' }, move: { before: 'OLD' } });
});

test('a paused project cannot go into Focus', () => {
  assert.match((dropPlan(sections, 'OLD', 'focus', null) as { error: string }).error, /paused/);
});

test('dropping into a section that does not exist yet moves to the bottom', () => {
  const noFocus = sidebarSections([p('A'), p('B', { group: 'G' })]);
  assert.deepEqual(dropPlan(noFocus, 'B', 'focus', null), { patch: { focus: true }, move: 'bottom' });
  assert.deepEqual(dropPlan(noFocus, 'A', 'group:New', null), { patch: { group: 'New' }, move: 'bottom' });
});

test('applyDrop matches what the sections become after saving', () => {
  const plan = dropPlan(sections, 'ELV', 'group:', null) as { patch: object; move: never };
  assert.deepEqual(shape(applyDrop(projects, 'ELV', plan.patch, plan.move)), ['focus=TRK', 'group:Apps=APP', 'group:Games=OLD,FRG', 'group:=CLI,ELV']);
  const into = dropPlan(sections, 'FRG', 'focus', 'TRK') as { patch: object; move: never };
  assert.deepEqual(shape(applyDrop(projects, 'FRG', into.patch, into.move)), ['focus=FRG,TRK,ELV', 'group:Apps=APP', 'group:Games=OLD', 'group:=CLI']);
  assert.equal(applyDrop(projects, 'FRG', into.patch, into.move).find((x) => x.key === 'FRG')!.group, 'Games');
});

test('neighbours are within the same section', () => {
  assert.deepEqual(sectionNeighbours(sections, 'TRK'), { prev: undefined, next: 'ELV' });
  assert.deepEqual(sectionNeighbours(sections, 'FRG'), { prev: 'OLD', next: undefined });
  assert.deepEqual(sectionNeighbours(sections, 'ZED'), {});
});
