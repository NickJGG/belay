/** Argument parsing and output shared by the CLI's own commands and the ones extensions contribute. */
import { parseArgs, type ParseArgsConfig } from 'node:util';

export function args<T extends ParseArgsConfig['options']>(
  argv: string[],
  options: T,
  positionals: number,
  maxPositionals = positionals,
) {
  const parsed = parseArgs({ args: argv, options, allowPositionals: true, allowNegative: true, strict: true });
  const n = parsed.positionals.length;
  if (n < positionals || n > maxPositionals) {
    const expected = maxPositionals === positionals ? positionals : `${positionals}–${maxPositionals}`;
    throw new Error(`expected ${expected} argument(s), got ${n} — see 'belay help'`);
  }
  return parsed;
}

export function print(text: string | string[]): void {
  console.log(Array.isArray(text) ? text.join('\n') : text);
}
