/**
 * Seeded 3D gradient noise (Ken Perlin's improved noise), about -1 to 1.
 * Part of the Topo Background port, see topo.ts for the license.
 */

export type Noise3 = (x: number, y: number, z: number) => number;

const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_RANGE = 4294967296;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  let v = z;
  if (h < 4) v = y;
  else if (h === 12 || h === 14) v = x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** The doubled permutation table, shuffled from the seed with a linear congruential generator. */
function permutationTable(seed: number): Uint8Array {
  const shuffled = Array.from({ length: 256 }, (_, index) => index);
  let state = seed >>> 0 || 1;
  const random = (): number => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return state / LCG_RANGE;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const held = shuffled[i] ?? 0;
    shuffled[i] = shuffled[j] ?? 0;
    shuffled[j] = held;
  }
  const table = new Uint8Array(512);
  for (let i = 0; i < 512; i++) table[i] = shuffled[i & 255] ?? 0;
  return table;
}

/** Builds a noise function that is stable for a given seed. */
export function createNoise(seed: number): Noise3 {
  const perm = permutationTable(seed);
  const at = (index: number): number => perm[index] ?? 0;
  return (x, y, z) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const fz = z - Math.floor(z);
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);
    const A = at(X) + Y;
    const AA = at(A) + Z;
    const AB = at(A + 1) + Z;
    const B = at(X + 1) + Y;
    const BA = at(B) + Z;
    const BB = at(B + 1) + Z;
    return lerp(
      lerp(
        lerp(grad(at(AA), fx, fy, fz), grad(at(BA), fx - 1, fy, fz), u),
        lerp(grad(at(AB), fx, fy - 1, fz), grad(at(BB), fx - 1, fy - 1, fz), u),
        v,
      ),
      lerp(
        lerp(grad(at(AA + 1), fx, fy, fz - 1), grad(at(BA + 1), fx - 1, fy, fz - 1), u),
        lerp(grad(at(AB + 1), fx, fy - 1, fz - 1), grad(at(BB + 1), fx - 1, fy - 1, fz - 1), u),
        v,
      ),
      w,
    );
  };
}
