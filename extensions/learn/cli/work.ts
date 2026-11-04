/** `belay work read|write`: a Work file through its answer format (a diagram as its summary, a spec on stdin to a diagram). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { args, print } from '../../../src/argv.ts';
import { formatFor } from '../answer-formats/index.ts';

export function readWork(path: string, display = path): string {
  const text = readFileSync(path, 'utf8');
  const format = formatFor(path);
  return format.summarize ? format.summarize(text, display).text : text;
}

export function writeWork(path: string, spec: string, force: boolean): void {
  const format = formatFor(path);
  if (!format.write) throw new Error(`${format.label} files can't be written from a spec; edit ${path} directly`);
  if (!force && existsSync(path)) throw new Error(`${path} exists (--force replaces it)`);
  const body = format.write(spec);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

export async function cmdWork(argv: string[], stdin: () => Promise<string> = readStdin): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'read': {
      const { positionals } = args(rest, {}, 1);
      return print(readWork(resolve(positionals[0]), positionals[0]).replace(/\n$/, ''));
    }
    case 'write': {
      const { values, positionals } = args(rest, { force: { type: 'boolean' } }, 1);
      const path = resolve(positionals[0]);
      writeWork(path, await stdin(), !!values.force);
      return print(`wrote ${positionals[0]}`);
    }
    default:
      throw new Error(`expected read or write, got '${sub ?? ''}' — see 'belay help'`);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error('write reads its spec from stdin');
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
