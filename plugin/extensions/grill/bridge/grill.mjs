/** Grills (`/grill:grill`) on the bridge: the descriptor, loaded at startup. The runtime is grill.runtime.mts. */
import { ALWAYS } from "../../../bridge/kind.mjs";
export const kind = {
    id: "grill",
    noun: "grill",
    plural: "grills",
    skill: "/grill:grill",
    folder: "grills",
    key: "slug",
    properties: { slug: { type: "string", description: "A grill's session slug, e.g. grill-preview-bridge" } },
    attach: "a grill by `slug` (the /grill:grill skill, when a grill starts or resumes)",
    resume: "to run `/grill:grill resume <slug>` (a grill)",
    instructions: 'Grills (/grill:grill): kind="answer": they picked option `opt` for question `q`, maybe with a note. kind="comment": a comment on the element at `selector` in that option\'s mock. kind="choice": their answer to a choice you posted, by button (`option`) or as free text. Follow the /grill:grill skill for when to use show and choice.',
    tools: [
        "reply",
        {
            name: "show",
            description: "Point the Belay grill page at a question (and option): the page follows unless the user is looking elsewhere.",
            _meta: ALWAYS,
            inputSchema: {
                type: "object",
                properties: {
                    q: { type: "integer", description: "Question number" },
                    opt: { type: "string", description: "Option key, e.g. a or b1" },
                },
                required: ["q"],
            },
        },
        "choice",
        "detach",
    ],
    reattach: (slug) => `disconnected: run \`/grill:grill resume ${slug}\` in the terminal`,
    page: (slug) => `/s/${slug}`,
    load: async () => (await import("./grill.runtime.mjs")).runtime,
};
