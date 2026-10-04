/** Server-side reads. Every request loads the data dir afresh; `cache` only shares one load across a render. */
import 'server-only';
import { cache } from 'react';
import { claudeDir, dataDir } from '../../src/config.ts';
import { Ctx } from '../../src/ops.ts';
import { loadSettings } from '../../src/settings.ts';

export const ctx = cache(() => new Ctx(dataDir()));
export const settings = cache(() => loadSettings(dataDir()));
export { claudeDir, dataDir };

export { clip, plural, unlinkedGrill } from '../../src/digest.ts';
export { loadGrillSessions, type GrillSession } from '../../src/grill.ts';
export { attachCommits, duration, localStamp, recentSessions, type Session } from '../../src/history.ts';
export { filterTasks, indexTasks, isReady, next, oldestFirst, openBlockers, parseTaskFilter, projectBoard, projectCounts } from '../../src/query.ts';
