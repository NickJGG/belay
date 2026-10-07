/**
 * The project page's view menu state as URL query values. The browser bundles this file, so it takes
 * only types from the store, whose runtime pulls in node:fs.
 */
import type { IssueStatus } from './store.ts';

/** The statuses the Issues tab can show, in board order. */
export const VIEW_STATUSES = ['todo', 'doing', 'done', 'dropped'] as const satisfies readonly IssueStatus[];
export type ViewStatus = (typeof VIEW_STATUSES)[number];

export const DEFAULT_VIEW_STATUSES: readonly ViewStatus[] = ['todo', 'doing', 'done'];

/** The query keys the view menu owns. */
export const VIEW_PARAMS = ['status', 'priority', 'source', 'ready', 'sort', 'dir'] as const;

export const isDefaultStatuses = (statuses: readonly ViewStatus[]) =>
  statuses.length === DEFAULT_VIEW_STATUSES.length && statuses.every((v) => DEFAULT_VIEW_STATUSES.includes(v));

/** The `status` value for `statuses` with `s` flipped, in board order; undefined means the default set (or none). */
export function toggleStatus(statuses: readonly ViewStatus[], s: ViewStatus): string | undefined {
  const next = VIEW_STATUSES.filter((v) => (v === s ? !statuses.includes(v) : statuses.includes(v)));
  return next.length && !isDefaultStatuses(next) ? next.join(',') : undefined;
}
