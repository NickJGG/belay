import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDir } from '../../../src/config.ts';
import type { ExtensionManifest } from '../../../src/extensions.ts';

export const manifest: ExtensionManifest = {
  id: 'learn',
  skills: ['learn:learn', 'learn:build', 'learn:review', 'learn:checkpoint', 'learn:status'],
  cli: {
    commands: {
      learn: async () => (await import('./cli.ts')).cmdLearn,
      work: async () => (await import('./work.ts')).cmdWork,
    },
    // A queued lesson start isn't part of the history.
    disabled: (data) => rmSync(join(runDir(data), 'start.json'), { force: true }),
    help: {
      commands: [
        { after: 'claude', usage: 'learn [args]', text: 'the same, in the Learning root (LEARNING_ROOT, default ~/Learning)' },
        { after: 'learn', usage: 'work read <file>', text: 'a Work file as Claude reads it: a diagram (.excalidraw) as its text summary, other files as they are' },
        {
          after: 'learn',
          usage: 'work write <file> [--force]',
          text: 'a diagram from a spec on stdin in the summary\'s grammar (Boxes:, Arrows: "A -> B", Notes:), laid out left to right',
        },
      ],
      claude: '; relaunches when a lesson restarts its session',
    },
  },
};
