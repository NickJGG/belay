import { cookies } from "next/headers";
import { COLLAPSED_COOKIE, parseToggled } from "@/lib/collapsed";
import { GroupDetails } from "./group-details";

/**
 * A collapsible group under a head (grill Q24): chevron, icon, label, count. Whether it starts open comes from
 * the cookie, keyed by `id`, so it renders that way rather than snapping shut on load.
 */
export async function Group({
  id,
  icon,
  label,
  count,
  defaultOpen = true,
  dim,
  className,
  headClassName,
  children,
}: {
  id: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  count?: React.ReactNode;
  defaultOpen?: boolean;
  /** Dims the contents, as for paused and archived projects. */
  dim?: boolean;
  className?: string;
  headClassName?: string;
  children: React.ReactNode;
}) {
  const toggled = parseToggled((await cookies()).get(COLLAPSED_COOKIE)?.value).has(id);
  return (
    <GroupDetails id={id} icon={icon} label={label} count={count} open={defaultOpen !== toggled} defaultOpen={defaultOpen} dim={dim} className={className} headClassName={headClassName}>
      {children}
    </GroupDetails>
  );
}
