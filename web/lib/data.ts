/** Server-side reads. Every request loads the data dir afresh; `cache` only shares one load across a render. */
import 'server-only';
import { cache } from 'react';
import { dataDir } from '../../src/config.ts';
import { Ctx } from '../../src/ops.ts';
import { loadSettings } from '../../src/settings.ts';

export const ctx = cache(() => new Ctx(dataDir()));
export const settings = cache(() => loadSettings(dataDir()));
export { dataDir };

export { plural } from '../../src/digest.ts';
export { filterIssues, indexIssues, isReady, next, oldestFirst, openBlockers, parseIssueFilter, projectBoard, projectCounts } from '../../src/query.ts';
