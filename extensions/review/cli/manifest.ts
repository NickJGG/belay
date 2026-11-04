import type { ExtensionManifest } from '../../../src/extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'review',
  skills: ['review:review'],
  cli: {
    commands: { review: async () => (await import('./cli.ts')).cmdReview },
    search: async () => (await import('./cli.ts')).searchLines,
    digest: async () => (await import('./cli.ts')).digestSection,
    help: {
      commands: [
        { after: 'git', usage: 'review list [--project <key>|unfiled]', text: 'saved code reviews (/review:review), newest first, with what needs you' },
        { after: 'git', usage: 'review show <id> [--json]', text: "a review's findings, numbered as in its report, with their decisions" },
        {
          after: 'git',
          usage: 'review decide <id> <n>... fix|skip|clear',
          text: 'queue fixes or skips on findings; the next /review:review session on it applies the fixes',
        },
        { after: 'git', usage: 'review track <id> <n> [--project <key>]', text: "add a finding as an idea in the review's project and record it" },
        {
          after: 'git',
          usage: 'review outcome <id> <n>... applied|manual [--note <text>]',
          text: 'record how fixes went (/review:review runs it after applying them)',
        },
        { after: 'git', usage: 'review path <id>', text: "a review's folder" },
        { after: 'git', usage: 'review delete <id>', text: 'delete a saved review; reviews are kept until deleted' },
      ],
      search: 'reviews (id, target, project)',
    },
  },
};
