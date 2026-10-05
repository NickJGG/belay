import { cookies } from 'next/headers';
import { COLLAPSED_COOKIE, parseCollapsed } from '@/lib/collapsed';
import type { TaskStatus } from '@/lib/types';
import { GroupDetails } from './GroupDetails';

/** A collapsible group of task rows under a status heading. Whether it starts open comes from the cookie. */
export async function StatusGroup({ status, count, children }: { status: TaskStatus; count: number; children: React.ReactNode }) {
  const collapsed = parseCollapsed((await cookies()).get(COLLAPSED_COOKIE)?.value);
  return (
    <GroupDetails status={status} count={count} open={!collapsed.has(status)}>
      {children}
    </GroupDetails>
  );
}
