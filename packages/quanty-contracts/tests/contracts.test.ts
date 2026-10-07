import { describe, expect, it } from 'vitest';
import { QUANTY_EVENTS } from '../src/index';
describe('Quanty contracts',()=>{it('contains versioned core events',()=>{expect(QUANTY_EVENTS.every(e=>e.endsWith('.v1'))).toBe(true);});});