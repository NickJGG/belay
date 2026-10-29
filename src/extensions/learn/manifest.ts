import type { ExtensionManifest } from '../../extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'learn',
  fields: [],
  skills: ['learn', 'learn:review', 'learn:checkpoint', 'learn:status'],
  cli: {
    commands: {
      learn: async () => {
        const { launchCommand } = await import('../../launch.ts');
        return (argv) => launchCommand('learn', argv);
      },
    },
    help: {
      commands: [{ after: 'claude', usage: 'learn [args]', text: 'the same, in the Learning root (LEARNING_ROOT, default ~/Learning)' }],
      claude: '; relaunches when a lesson restarts its session',
    },
  },
};
