import { cookies } from 'next/headers';
import { COLLAPSED_COOKIE, parseCollapsed } from '@/lib/collapsed';
import type { IssueStatus } from '@/lib/types';
import { GroupDetails } from './GroupDetails';
import { StatusIcon } from './StatusIcon';

/** A collapsible group of issue rows under a heading. Whether it starts open comes from the cookie; `id` keys it there. */
export async function Group({
  id,
  icon,
  label,
  count,
  defaultOpen = true,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const toggled = parseCollapsed((await cookies()).get(COLLAPSED_COOKIE)?.value).has(id);
  return (
    <GroupDetails id={id} icon={icon} label={label} count={count} open={defaultOpen !== toggled} defaultOpen={defaultOpen}>
      {children}
    </GroupDetails>
  );
}

export function StatusGroup({ status, count, children }: { status: IssueStatus; count: number; children: React.ReactNode }) {
  return (
    <Group id={status} icon={<StatusIcon status={status} />} label={status[0].toUpperCase() + status.slice(1)} count={count}>
      {children}
    </Group>
  );
}
