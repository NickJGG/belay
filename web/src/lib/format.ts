const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A session's `YYYY-MM-DD…` date as "today", "yesterday", "Oct 5", or "Oct 5, 2025" in another year. */
export function shortDate(date: string | undefined, now = new Date()): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(date ?? "");
  if (!m) return "";
  const day = m[0];
  if (day === ymd(now)) return "today";
  if (day === ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return "yesterday";
  const label = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return Number(m[1]) === now.getFullYear() ? label : `${label}, ${m[1]}`;
}

/** `in-progress` → "in progress". */
export const statusLabel = (status: string) => status.replaceAll("-", " ");

const dayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** A card's due date against today: "overdue 2 days", "today", "tomorrow", "in 5 days". */
export function relativeDue(due: string, today: string): string {
  const n = Math.round(dayNumber(due) - dayNumber(today));
  if (n < 0) return `overdue ${-n} day${n === -1 ? "" : "s"}`;
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
