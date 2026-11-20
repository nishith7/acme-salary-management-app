/**
 * A small seeded random source, one per employee.
 *
 * The salary history of an employee must depend only on the seed and on that
 * employee, never on who was generated before them (and so never on the
 * employees already in the database). A generator created from a key such as
 * "2026:EMP-00001" gives that employee the same numbers on every run, in any
 * order, on any machine. It also does not depend on faker, so a faker upgrade
 * cannot change the salaries.
 *
 * This is for synthetic data only. It is not suitable for anything secret.
 */
export interface Rng {
  /** A number from 0 up to, but not including, 1. */
  next(): number;
  /** A number from `min` up to, but not including, `max`. */
  between(min: number, max: number): number;
  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** True with the given probability, from 0 (never) to 1 (always). */
  chance(probability: number): boolean;
  /** A bell-shaped number around `mean`, with the given standard deviation. */
  normal(mean: number, standardDeviation: number): number;
}

export function createRng(key: string): Rng {
  let state = hashKey(key);

  // mulberry32: 32 bits of state, passes the usual statistical tests, and is
  // short enough to read and trust.
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,

    between(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
        throw new RangeError('between needs finite numbers with min <= max');
      }
      return min + next() * (max - min);
    },

    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError('int needs whole numbers with min <= max');
      }
      return min + Math.floor(next() * (max - min + 1));
    },

    chance(probability) {
      if (!(probability >= 0 && probability <= 1)) {
        throw new RangeError('chance needs a probability from 0 to 1');
      }
      return next() < probability;
    },

    normal(mean, standardDeviation) {
      if (!Number.isFinite(mean) || !(standardDeviation >= 0)) {
        throw new RangeError(
          'normal needs a finite mean and a standard deviation of 0 or more',
        );
      }
      // Box-Muller. 1 - next() lies in (0, 1], so the logarithm is always finite.
      const u1 = 1 - next();
      const u2 = next();
      return (
        mean +
        standardDeviation *
          Math.sqrt(-2 * Math.log(u1)) *
          Math.cos(2 * Math.PI * u2)
      );
    },
  };
}

/**
 * Turns a text key into 32 bits of starting state: FNV-1a over the characters,
 * then murmur3's finalizer so that keys differing in one character (EMP-00001,
 * EMP-00002) start far apart instead of side by side.
 */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
