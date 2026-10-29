import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDir } from '../../config.ts';
import type { ExtensionManifest } from '../../extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'learn',
  skills: ['learn', 'learn:review', 'learn:checkpoint', 'learn:status'],
  cli: {
    commands: {
      learn: async () => (await import('./cli.ts')).cmdLearn,
    },
    // A queued lesson start isn't part of the history.
    disabled: (data) => rmSync(join(runDir(data), 'start.json'), { force: true }),
    help: {
      commands: [{ after: 'claude', usage: 'learn [args]', text: 'the same, in the Learning root (LEARNING_ROOT, default ~/Learning)' }],
      claude: '; relaunches when a lesson restarts its session',
    },
  },
};
