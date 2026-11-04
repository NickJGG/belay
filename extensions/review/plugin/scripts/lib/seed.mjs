// Replayable randomness: each (seed, agent, pass) gets its own PRNG, so one seed replays a whole
// run and the two passes of a bug reviewer still see the files differently.
import { randomInt } from 'node:crypto';

export const MAX_SEED = 2 ** 32 - 1;

export function freshSeed() {
  return randomInt(0, MAX_SEED);
}

export function parseSeed(value) {
  const seed = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(seed) && seed <= MAX_SEED ? seed : null;
}

// FNV-1a: folds the (seed, agent, pass) string into a 32-bit PRNG seed.
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seed, ...salt) {
  const random = mulberry32(hash32([seed, ...salt].join(':')));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
