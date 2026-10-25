/** Server-side reads. Every request loads the data dir afresh; `cache` only shares one load across a render. The exception is `grillMemo`, which keeps parsed grill sessions across requests and re-validates each by mtime. */
import 'server-only';
import { cache } from 'react';
import { dataDir, grillRoots } from '../../src/config.ts';
import { loadGrillSession, loadGrillSessions, type GrillMemo } from '../../src/grill.ts';
import { Ctx } from '../../src/ops.ts';
import { loadSettings } from '../../src/settings.ts';

/** Lenient: pages render what loaded, and the layout lists `ctx().bad`. Writes (actions.ts) use a strict Ctx. */
export const ctx = cache(() => new Ctx(dataDir(), { lenient: true }));
export const settings = cache(() => loadSettings(dataDir()));
export { dataDir };

const grillMemo: GrillMemo = new Map();
export const grillSessions = cache(() => loadGrillSessions(grillRoots(), grillMemo));
export const grillSession = cache((slug: string) => loadGrillSession(grillRoots(), slug));

export { plural } from '../../src/digest.ts';
export { filterIssues, indexIssues, isReady, next, oldestFirst, openBlockers, parseIssueFilter, parseIssueSort, projectBoard, projectCounts } from '../../src/query.ts';
export { addDays, daysBetween, workDay } from '../../src/workday.ts';
export { activity, doingSince, inFlight } from '../../src/home.ts';
