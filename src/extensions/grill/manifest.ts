import { resolve } from 'node:path';
import { grillsDir } from '../../config.ts';
import type { ExtensionManifest } from '../../extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'grill',
  fields: [],
  skills: ['grill'],
  cli: {
    commands: { grill: async () => (await import('./cli.ts')).cmdGrill },
    search: async () => (await import('./cli.ts')).searchLines,
    digest: async () => (await import('./cli.ts')).digestSection,
    linked: {
      grill: async (issue, data) => (issue.grill ? (await import('../../grill.ts')).grillFile(grillsDir(data), issue.grill) : undefined),
      plan: async (issue) => (issue.plan ? resolve(issue.plan) : undefined),
    },
    help: {
      commands: [
        {
          after: 'git',
          usage: 'grill commit <slug>',
          text: "commit a planned grill's folder to the data dir's history (the /grill skill runs it when its plan is accepted); in-progress grills are refused",
        },
      ],
      add: '[--grill <slug>] [--plan <path>]',
      edit: '[--grill <slug>] [--plan <path>]',
      search: 'grill sessions (slug, topic, project)',
    },
  },
};
