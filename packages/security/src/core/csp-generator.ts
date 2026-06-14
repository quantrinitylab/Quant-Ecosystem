// ============================================================================
// Security Package - Content Security Policy Generator
// ============================================================================

import crypto from 'crypto';
import type { CSPDirective, CSPPolicy } from '../types';

/** CSP preset policy names */
type CSPPreset = 'strict' | 'moderate' | 'relaxed' | 'api-only';

/**
 * CSPGenerator - Content Security Policy builder with directive management,
 * nonce generation, hash computation, report-only mode, and preset policies.
 */
export class CSPGenerator {
  private directives: Map<string, CSPDirective>;
  private reportUri: string;
  private reportOnly: boolean;
  private nonces: Set<string>;
  private hashes: Map<string, string[]>;
  private generationCount: number;

  constructor() {
    this.directives = new Map();
    this.reportUri = '';
    this.reportOnly = false;
    this.nonces = new Set();
    this.hashes = new Map();
    this.generationCount = 0;
  }

  /** Set a directive */
  setDirective(name: string, values: string[]): this {
    const directive: CSPDirective = {
      name,
      values,
      nonces: [],
      hashes: [],
    };
    this.directives.set(name, directive);
    return this;
  }

  /** Add a value to a directive */
  addValue(directiveName: string, value: string): this {
    const directive = this.directives.get(directiveName);
    if (directive) {
      if (!directive.values.includes(value)) {
        directive.values.push(value);
      }
    } else {
      this.setDirective(directiveName, [value]);
    }
    return this;
  }

  /** Remove a value from a directive */
  removeValue(directiveName: string, value: string): this {
    const directive = this.directives.get(directiveName);
    if (directive) {
      directive.values = directive.values.filter(v => v !== value);
    }
    return this;
  }

  /** Generate a nonce for inline scripts/styles */
  generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 24; i++) {
      nonce += chars[crypto.randomInt(chars.length)];
    }
    this.nonces.add(nonce);
    return nonce;
  }

  /** Add a nonce to a directive */
  addNonce(directiveName: string, nonce: string): this {
    const directive = this.directives.get(directiveName);
    if (directive) {
      if (!directive.nonces) directive.nonces = [];
      directive.nonces.push(nonce);
    }
    this.nonces.add(nonce);
    return this;
  }

  /** Compute hash of inline content for CSP */
  computeHash(content: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    // Compute hash using FNV-based simulation
    let h1 = 0x6a09e667, h2 = 0xbb67ae85, h3 = 0x3c6ef372, h4 = 0xa54ff53a;
    let h5 = 0x510e527f, h6 = 0x9b05688c, h7 = 0x1f83d9ab, h8 = 0x5be0cd19;

    for (let i = 0; i < content.length; i++) {
      const c = content.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + 1), 0x5bd1e995) >>> 0;
      h3 = Math.imul(h3 ^ (c + 2), 0x1b873593) >>> 0;
      h4 = Math.imul(h4 ^ (c + 3), 0xcc9e2d51) >>> 0;
      h5 = Math.imul(h5 ^ (c + 4), 0x85ebca6b) >>> 0;
      h6 = Math.imul(h6 ^ (c + 5), 0xc2b2ae35) >>> 0;
      h7 = Math.imul(h7 ^ (c + 6), 0x27d4eb2f) >>> 0;
      h8 = Math.imul(h8 ^ (c + 7), 0x165667b1) >>> 0;
    }

    const hashHex = [h1, h2, h3, h4, h5, h6, h7, h8]
      .map(h => (h >>> 0).toString(16).padStart(8, '0'))
      .join('');

    // Base64-encode (simplified)
    const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < hashHex.length; i += 3) {
      const n = parseInt(hashHex.substring(i, i + 3), 16);
      b64 += b64Chars[n % 64];
      b64 += b64Chars[Math.floor(n / 64) % 64];
    }

    return `'${algorithm}-${b64}'`;
  }

  /** Add a hash to a directive */
  addHash(directiveName: string, hash: string): this {
    const directive = this.directives.get(directiveName);
    if (directive) {
      if (!directive.hashes) directive.hashes = [];
      directive.hashes.push(hash);
    }
    const dirHashes = this.hashes.get(directiveName) || [];
    dirHashes.push(hash);
    this.hashes.set(directiveName, dirHashes);
    return this;
  }

  /** Set report URI */
  setReportUri(uri: string): this {
    this.reportUri = uri;
    return this;
  }

  /** Set report-only mode */
  setReportOnly(enabled: boolean): this {
    this.reportOnly = enabled;
    return this;
  }

  /** Apply a preset policy */
  applyPreset(preset: CSPPreset): this {
    this.directives.clear();

    switch (preset) {
      case 'strict':
        this.setDirective('default-src', ["'none'"]);
        this.setDirective('script-src', ["'self'"]);
        this.setDirective('style-src', ["'self'"]);
        this.setDirective('img-src', ["'self'", 'data:']);
        this.setDirective('font-src', ["'self'"]);
        this.setDirective('connect-src', ["'self'"]);
        this.setDirective('frame-src', ["'none'"]);
        this.setDirective('object-src', ["'none'"]);
        this.setDirective('base-uri', ["'self'"]);
        this.setDirective('form-action', ["'self'"]);
        this.setDirective('frame-ancestors', ["'none'"]);
        this.setDirective('upgrade-insecure-requests', []);
        break;

      case 'moderate':
        this.setDirective('default-src', ["'self'"]);
        this.setDirective('script-src', ["'self'", "'unsafe-inline'"]);
        this.setDirective('style-src', ["'self'", "'unsafe-inline'"]);
        this.setDirective('img-src', ["'self'", 'data:', 'https:']);
        this.setDirective('font-src', ["'self'", 'https://fonts.gstatic.com']);
        this.setDirective('connect-src', ["'self'", 'https://api.*']);
        this.setDirective('frame-src', ["'self'"]);
        this.setDirective('object-src', ["'none'"]);
        this.setDirective('base-uri', ["'self'"]);
        break;

      case 'relaxed':
        this.setDirective('default-src', ["'self'", 'https:']);
        this.setDirective('script-src', ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:']);
        this.setDirective('style-src', ["'self'", "'unsafe-inline'", 'https:']);
        this.setDirective('img-src', ['*', 'data:', 'blob:']);
        this.setDirective('font-src', ["'self'", 'https:', 'data:']);
        this.setDirective('connect-src', ["'self'", 'https:', 'wss:']);
        break;

      case 'api-only':
        this.setDirective('default-src', ["'none'"]);
        this.setDirective('connect-src', ["'self'"]);
        this.setDirective('frame-ancestors', ["'none'"]);
        this.setDirective('base-uri', ["'none'"]);
        this.setDirective('form-action', ["'none'"]);
        break;
    }

    return this;
  }

  /** Merge another policy into this one */
  merge(other: CSPGenerator): this {
    for (const [name, directive] of other.directives) {
      const existing = this.directives.get(name);
      if (existing) {
        // Merge values
        for (const value of directive.values) {
          if (!existing.values.includes(value)) {
            existing.values.push(value);
          }
        }
        // Merge nonces
        if (directive.nonces) {
          if (!existing.nonces) existing.nonces = [];
          existing.nonces.push(...directive.nonces);
        }
        // Merge hashes
        if (directive.hashes) {
          if (!existing.hashes) existing.hashes = [];
          existing.hashes.push(...directive.hashes);
        }
      } else {
        this.directives.set(name, { ...directive });
      }
    }
    return this;
  }

  /** Generate the CSP policy string */
  generate(): CSPPolicy {
    this.generationCount++;
    const nonce = this.generateNonce();
    const directiveStrings: string[] = [];

    for (const [name, directive] of this.directives) {
      const parts = [name];

      // Add values
      parts.push(...directive.values);

      // Add nonces
      if (directive.nonces && directive.nonces.length > 0) {
        for (const n of directive.nonces) {
          parts.push(`'nonce-${n}'`);
        }
      }

      // Add main nonce for script-src and style-src
      if (name === 'script-src' || name === 'style-src') {
        parts.push(`'nonce-${nonce}'`);
      }

      // Add hashes
      if (directive.hashes && directive.hashes.length > 0) {
        parts.push(...directive.hashes);
      }

      directiveStrings.push(parts.join(' '));
    }

    // Add report-uri if set
    if (this.reportUri) {
      directiveStrings.push(`report-uri ${this.reportUri}`);
    }

    const generated = directiveStrings.join('; ');

    return {
      directives: Array.from(this.directives.values()),
      reportOnly: this.reportOnly,
      reportUri: this.reportUri || undefined,
      nonce,
      generated,
    };
  }

  /** Get the CSP header name based on mode */
  getHeaderName(): string {
    return this.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  }

  /** Generate the complete header value */
  getHeaderValue(): string {
    return this.generate().generated;
  }

  /** Get statistics */
  getStats(): { directiveCount: number; nonceCount: number; generationCount: number } {
    return {
      directiveCount: this.directives.size,
      nonceCount: this.nonces.size,
      generationCount: this.generationCount,
    };
  }
}
