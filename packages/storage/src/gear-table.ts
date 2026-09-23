/**
 * FastCDC 256-Entry 64-bit Gear Table
 *
 * Precomputed deterministic 64-bit random values for byte substitution
 * in FastCDC rolling hash calculation.
 * Matches standard FastCDC reference implementation and Rust VFS bridge.
 */

// Generate deterministic pseudo-random 64-bit table using SplitMix64
function generateGearTable(): BigUint64Array {
  const table = new BigUint64Array(256);
  let state = 0x853c49e6748fea9bn;

  for (let i = 0; i < 256; i++) {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    z = (z ^ (z >> 31n)) & 0xffffffffffffffffn;
    table[i] = z;
  }
  return table;
}

export const GEAR_TABLE = generateGearTable();
