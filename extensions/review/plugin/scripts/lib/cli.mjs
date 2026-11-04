import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export function fail(name, message, code = 2) {
  process.stderr.write(`${name}: ${message}\n`);
  process.exit(code);
}

export function args(name, options, allowPositionals = false) {
  try {
    return parseArgs({ options, allowPositionals, strict: true });
  } catch (err) {
    fail(name, err.message);
  }
}

export function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function readStdinJson(name) {
  try {
    return JSON.parse(readStdin());
  } catch (err) {
    fail(name, `malformed JSON on stdin: ${err.message}`);
  }
}

export function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
