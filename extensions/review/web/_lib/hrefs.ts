/** Review's page addresses. Imports nothing, so client components can use it. */

export const reviewHref = (id: string) => `/r/${encodeURIComponent(id)}`;
