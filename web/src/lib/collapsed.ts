/** Collapsible groups toggled away from their default, in a cookie so the server renders them that way. Imports nothing. */
export const COLLAPSED_COOKIE = "belay-collapsed";

// '.' rather than ',', which isn't a legal cookie value character.
export const parseToggled = (value: string | undefined) => new Set(value ? value.split(".") : []);
