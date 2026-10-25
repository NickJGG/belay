/** Page addresses for belay's records. Imports nothing, so client components can use it. */

export const projectHref = (key: string, section = "") => `/p/${encodeURIComponent(key)}${section}`;

export const issueHref = (id: string) => `/i/${encodeURIComponent(id)}`;

/** `at` lets the page tell when the address has come to hold a different entry. */
export const logHref = (day: string, n: number, at: string) => `/l/${day}/${n}?at=${encodeURIComponent(at)}`;

export const grillHref = (slug: string) => `/s/${encodeURIComponent(slug)}`;

/** The pseudo-project for grills nothing files. */
export const UNFILED = "unfiled";
