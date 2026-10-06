/** Server-side reads. Every request loads the data dir afresh; `cache` only shares one load across a render. */
import 'server-only';
import { cache } from 'react';
import { claudeDir, dataDir } from '../../src/config.ts';
import { loadGrillSession, loadGrillSessions } from '../../src/grill.ts';
import { commitsBetween } from '../../src/history.ts';
import { Ctx } from '../../src/ops.ts';
import { loadSettings } from '../../src/settings.ts';
import { addDays } from '../../src/workday.ts';

export const ctx = cache(() => new Ctx(dataDir()));
export const settings = cache(() => loadSettings(dataDir()));
export { dataDir };

export const grillSessions = cache(() => loadGrillSessions(claudeDir()));
export const grillSession = cache((slug: string) => loadGrillSession(claudeDir(), slug));

/** Git commit times under the project's paths on work days `from`..`to`. Runs git, so only once per render. */
export const commitTimes = cache((key: string, from: string, to: string): string[] => {
  const project = ctx().projects.find((p) => p.key === key);
  return project ? commitsBetween(project, `${from} 04:00`, `${addDays(to, 1)} 04:00`).map((c) => c.time) : [];
});

export { plural } from '../../src/digest.ts';
export { filterIssues, indexIssues, isReady, next, oldestFirst, openBlockers, parseIssueFilter, projectBoard, projectCounts } from '../../src/query.ts';
export { addDays, daysBetween, weekDays, weekStart, workDay } from '../../src/workday.ts';
export { burndown, goalOf, goalSpec, urgencies } from '../../src/goals.ts';
export { activity, doingSince, inFlight } from '../../src/home.ts';
export { heatLevel, heatmap, heatRange } from '../../src/heatmap.ts';
export { weekGoal, weekSummary } from '../../src/week.ts';
