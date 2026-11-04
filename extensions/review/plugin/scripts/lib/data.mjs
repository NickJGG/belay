import { renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Belay's data dir ($BELAY_DATA, else ~/Belay): saved reviews and campaign ledgers live under reviews/.
export function reviewsHome() {
  return join(process.env.BELAY_DATA || join(homedir(), 'Belay'), 'reviews');
}

export function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
