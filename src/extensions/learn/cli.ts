/** `belay learn`: `belay claude` in the Learning root, for lessons. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '../../extensions.ts';
import { launchCommand } from '../../launch.ts';

export const learningRoot = (env: NodeJS.ProcessEnv, home: string) => env.LEARNING_ROOT || join(home, 'Learning');

export const cmdLearn: Command = (argv) => launchCommand(argv, learningRoot(process.env, homedir()));
