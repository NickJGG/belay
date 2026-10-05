const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A comment's `at` (`YYYY-MM-DDTHH:MM`, local) as a Date. */
export function parseAt(at: string): Date {
  const [y, mo, d, h, mi] = at.split(/[-T:]/).map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** `at` relative to `now`: "just now", "5m ago", "3h ago", "4d ago", then a date ("Sep 3", with the year when it differs). */
export function ago(at: string, now = new Date()): string {
  const then = parseAt(at);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`;
  const date = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return then.getFullYear() === now.getFullYear() ? date : `${date}, ${then.getFullYear()}`;
}
