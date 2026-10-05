import { cookies } from 'next/headers';
import { COLLAPSED_COOKIE, parseCollapsed } from '@/lib/collapsed';
import type { IssueStatus } from '@/lib/types';
import { GroupDetails } from './GroupDetails';

/** A collapsible group of issue rows under a status heading. Whether it starts open comes from the cookie. */
export async function StatusGroup({ status, count, children }: { status: IssueStatus; count: number; children: React.ReactNode }) {
  const collapsed = parseCollapsed((await cookies()).get(COLLAPSED_COOKIE)?.value);
  return (
    <GroupDetails status={status} count={count} open={!collapsed.has(status)}>
      {children}
    </GroupDetails>
  );
}
