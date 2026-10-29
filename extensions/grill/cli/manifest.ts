import { resolve } from 'node:path';
import { sessionsDir } from '../../../src/config.ts';
import { owned, type ExtensionManifest } from '../../../src/extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'grill',
  skills: ['grill'],
  cli: {
    commands: { grill: async () => (await import('./cli.ts')).cmdGrill },
    search: async () => (await import('./cli.ts')).searchLines,
    digest: async () => (await import('./cli.ts')).digestSection,
    linked: {
      grill: async (issue, data) => {
        const { grill } = owned(issue, 'grill');
        return grill ? (await import('./sessions.ts')).grillFile(sessionsDir('grill', data), grill) : undefined;
      },
      plan: async (issue) => {
        const { plan } = owned(issue, 'grill');
        return plan ? resolve(plan) : undefined;
      },
    },
    help: {
      commands: [
        {
          after: 'git',
          usage: 'grill commit <slug>',
          text: "commit a planned grill's folder to the data dir's history (the /grill:grill skill runs it when its plan is accepted); in-progress grills are refused",
        },
      ],
      add: '[--grill <slug>] [--plan <path>]',
      edit: '[--grill <slug>] [--plan <path>]',
      search: 'grill sessions (slug, topic, project)',
    },
  },
};
