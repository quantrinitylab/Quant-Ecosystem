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
  let state = BigInt('0x853c49e6748fea9b');

  for (let i = 0; i < 256; i++) {
    state = (state + BigInt('0x9e3779b97f4a7c15')) & BigInt('0xffffffffffffffff');
    let z = state;
    z = ((z ^ (z >> BigInt(30))) * BigInt('0xbf58476d1ce4e5b9')) & BigInt('0xffffffffffffffff');
    z = ((z ^ (z >> BigInt(27))) * BigInt('0x94d049bb133111eb')) & BigInt('0xffffffffffffffff');
    z = (z ^ (z >> BigInt(31))) & BigInt('0xffffffffffffffff');
    table[i] = z;
  }
  return table;
}

export const GEAR_TABLE = generateGearTable();
