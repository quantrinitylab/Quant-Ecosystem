import { describe, it, expect } from 'vitest';
import { formatCallDuration } from '../hooks/useCallTimer';

// Feature: quantchat-mega-upgrade, Property 14: Call timer formats any elapsed seconds correctly (MM:SS or H:MM:SS).
//
// Validates: Requirements 6.7 (elapsed call timer with correct formatting).
//
// Property: For any elapsed seconds value, formatCallDuration produces a correctly
// formatted time string (MM:SS or H:MM:SS). The parsed components must recompose to
// floor(elapsedSeconds), seconds/minutes stay within 0-59 (zero-padded to two digits
// when an hour component is present), and negative inputs clamp to "0:00".

/** Deterministic, seedable PRNG (mulberry32) so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMER_REGEX = /^(\d+:)?\d{1,2}:\d{2}$/;

/** Verify all invariants of the formatted timer string for a given input. */
function assertValidFormat(input: number): void {
  const formatted = formatCallDuration(input);
  const expectedTotal = Math.max(0, Math.floor(input));

  // 1. Matches the documented MM:SS or H:MM:SS shape.
  expect(formatted, `format of ${input} -> "${formatted}"`).toMatch(TIMER_REGEX);

  const parts = formatted.split(':');
  expect(parts.length === 2 || parts.length === 3).toBe(true);

  let hours = 0;
  let minutes: number;
  let seconds: number;
  let minutesText: string;
  let secondsText: string;

  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutesText = parts[1];
    secondsText = parts[2];
    minutes = Number(minutesText);
    seconds = Number(secondsText);
    // With an hour present, minutes are zero-padded to two digits.
    expect(minutesText.length, `minutes zero-padded for ${formatted}`).toBe(2);
  } else {
    minutesText = parts[0];
    secondsText = parts[1];
    minutes = Number(minutesText);
    seconds = Number(secondsText);
  }

  // 2. Seconds always zero-padded to two digits, and minutes/seconds within 0-59.
  expect(secondsText.length, `seconds zero-padded for ${formatted}`).toBe(2);
  expect(seconds).toBeGreaterThanOrEqual(0);
  expect(seconds).toBeLessThanOrEqual(59);
  expect(minutes).toBeGreaterThanOrEqual(0);
  expect(minutes).toBeLessThanOrEqual(59);

  // 3. Components recompose to floor(elapsedSeconds) (clamped at 0).
  const recomposed = hours * 3600 + minutes * 60 + seconds;
  expect(recomposed, `recompose of "${formatted}" from input ${input}`).toBe(expectedTotal);
}

describe('formatCallDuration property (Property 14)', () => {
  it('formats any non-negative elapsed seconds (incl. fractional) correctly across >=100 cases', () => {
    const rand = mulberry32(0x14ca11);
    for (let i = 0; i < 200; i++) {
      // Random elapsed seconds 0 .. ~100000 with a fractional component.
      const elapsed = rand() * 100000;
      assertValidFormat(elapsed);
    }
  });

  it('clamps negative inputs to "0:00"', () => {
    const rand = mulberry32(0xbadbeef);
    for (let i = 0; i < 100; i++) {
      const negative = -(rand() * 100000) - 0.0001;
      expect(formatCallDuration(negative)).toBe('0:00');
    }
  });

  it('handles representative boundary values', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(59)).toBe('0:59');
    expect(formatCallDuration(60)).toBe('1:00');
    expect(formatCallDuration(323)).toBe('5:23');
    expect(formatCallDuration(3599)).toBe('59:59');
    expect(formatCallDuration(3600)).toBe('1:00:00');
    expect(formatCallDuration(3923)).toBe('1:05:23');
  });
});
