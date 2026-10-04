'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** A link that marks itself current when the path (and any query it carries) matches. */
export function NavLink({ href, className, activeClassName, children }: { href: string; className: string; activeClassName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const url = new URL(href, 'http://x');
  const params = [...url.searchParams];
  // A bare link (All issues) yields to a filtered sibling (Ideas) on the same path.
  const active = url.pathname === pathname && (params.length ? params.every(([k, v]) => search.get(k) === v) : !search.has('status'));
  return (
    <Link href={href} className={active ? `${className} ${activeClassName}` : className} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
