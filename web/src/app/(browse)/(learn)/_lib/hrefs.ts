/** A course page; `suffix` is a section (`/map`) or a detail (`/knowledge/<topic>`). Imports nothing, so client components can use it. */
export const courseHref = (course: string, suffix = "") => `/learn/${encodeURIComponent(course)}${suffix}`;
