import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CSPGenerator } from './csp-generator';

/** Real browser-equivalent CSP source expression (FIXED computeHash must equal this). */
function realCspHash(content: string, algorithm: 'sha256' | 'sha384' | 'sha512'): string {
  return `'${algorithm}-${crypto.createHash(algorithm).update(content).digest('base64')}'`;
}

// ============================================================================
// Task 18.4 — Fix-check: CSP hash equals browser base64 reference (P4)
// Converted from the Phase-1 exploration block. PASSES on FIXED code.
// PBT: >=100 seeded random content strings x random algorithm in {sha256,sha384,sha512}.
// ============================================================================
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomContent(rng: () => number): string {
  const len = Math.floor(rng() * 60);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(32 + Math.floor(rng() * 95));
  }
  return s;
}

describe('Bug C — fix-check: computeHash equals the browser SHA reference (P4)', () => {
  const algos: ('sha256' | 'sha384' | 'sha512')[] = ['sha256', 'sha384', 'sha512'];

  it('computeHash(content, algo) === the real "<algo>-<base64>" expression for >=100 inputs', () => {
    const gen = new CSPGenerator();
    const rng = mulberry32(0xc59f00d);
    for (let i = 0; i < 120; i++) {
      const content = randomContent(rng);
      const algorithm = algos[Math.floor(rng() * algos.length)]!;
      expect(gen.computeHash(content, algorithm)).toBe(realCspHash(content, algorithm));
    }
  });

  it('matches the reference for empty content across all algorithms (edge case)', () => {
    const gen = new CSPGenerator();
    for (const algorithm of algos) {
      expect(gen.computeHash('', algorithm)).toBe(realCspHash('', algorithm));
    }
  });

  it('matches the reference for the canonical inline script example', () => {
    const gen = new CSPGenerator();
    expect(gen.computeHash('alert(1)', 'sha256')).toBe(realCspHash('alert(1)', 'sha256'));
  });
});

// ============================================================================
// Task 8 — Preservation baseline: CSP builder logic unchanged (P9)
// computeHash VALUE is intentionally NOT baselined here (it changes after the fix).
// ============================================================================
describe('Bug C — preservation: CSP builder logic (P9)', () => {
  it('applies the strict preset', () => {
    const header = new CSPGenerator().applyPreset('strict').getHeaderValue();
    expect(header).toContain("default-src 'none'");
    expect(header).toContain("object-src 'none'");
    expect(header).toContain("frame-ancestors 'none'");
  });

  it('applies the moderate preset', () => {
    const header = new CSPGenerator().applyPreset('moderate').getHeaderValue();
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("'unsafe-inline'");
    expect(header).toContain('img-src');
  });

  it('applies the relaxed preset', () => {
    const header = new CSPGenerator().applyPreset('relaxed').getHeaderValue();
    expect(header).toContain("'unsafe-eval'");
    expect(header).toContain('img-src * data: blob:');
  });

  it('applies the api-only preset', () => {
    const gen = new CSPGenerator().applyPreset('api-only');
    const header = gen.getHeaderValue();
    expect(header).toContain("default-src 'none'");
    expect(header).toContain("connect-src 'self'");
    expect(gen.getStats().directiveCount).toBe(5);
  });

  it('supports directive add and remove', () => {
    const gen = new CSPGenerator();
    gen.setDirective('script-src', ["'self'"]);
    gen.addValue('script-src', 'https://cdn.example.com');
    gen.addValue('script-src', 'https://cdn.example.com'); // dedupe
    let header = gen.getHeaderValue();
    expect(header).toContain("script-src 'self' https://cdn.example.com");
    gen.removeValue('script-src', 'https://cdn.example.com');
    header = gen.getHeaderValue();
    expect(header).not.toContain('https://cdn.example.com');
  });

  it('injects a generated nonce into script-src/style-src', () => {
    const gen = new CSPGenerator();
    gen.setDirective('script-src', ["'self'"]);
    const nonce = gen.generateNonce();
    expect(nonce).toHaveLength(24);
    const policy = gen.generate();
    expect(policy.nonce).toHaveLength(24);
    expect(policy.generated).toContain(`'nonce-${policy.nonce}'`);
  });

  it('merges directives and values from another policy', () => {
    const base = new CSPGenerator();
    base.setDirective('script-src', ["'self'"]);
    const other = new CSPGenerator();
    other.setDirective('script-src', ['https://a.example']);
    other.setDirective('img-src', ["'self'"]);
    base.merge(other);
    const header = base.getHeaderValue();
    expect(header).toContain("'self'");
    expect(header).toContain('https://a.example');
    expect(header).toContain('img-src');
  });

  it('selects header name based on report-only mode', () => {
    const gen = new CSPGenerator();
    expect(gen.getHeaderName()).toBe('Content-Security-Policy');
    gen.setReportOnly(true);
    expect(gen.getHeaderName()).toBe('Content-Security-Policy-Report-Only');
    expect(gen.generate().reportOnly).toBe(true);
  });

  it('includes a report-uri directive when set', () => {
    const gen = new CSPGenerator().applyPreset('strict');
    gen.setReportUri('/csp-report');
    const policy = gen.generate();
    expect(policy.reportUri).toBe('/csp-report');
    expect(policy.generated).toContain('report-uri /csp-report');
  });
});
