// Deferred behind ToolSearch, Claude answered channel messages in the terminal instead.
export const ALWAYS = { "anthropic/alwaysLoad": true };
export const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });
