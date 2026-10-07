// ============================================================================
// Privacy-First Ads - Privacy Enforcer Service
// Validates that no third-party tracking requests are made.
// Enforces strict CSP directives for ad serving.
// ============================================================================

import { z } from 'zod';

export const ValidateRequestSchema = z.object({
  headers: z.record(z.string()),
});

/** Known third-party tracking cookie prefixes */
const TRACKING_COOKIE_PATTERNS = [
  '_fbp',
  '_fbc',
  '_ga',
  '_gid',
  '_gcl',
  '__gads',
  'IDE',
  'DSID',
  'FLC',
  'AID',
  'TAID',
  'exchange_uid',
  '__utm',
  '_mkto_trk',
  'hubspotutk',
  '_ttp',
  'tt_',
];

/** Known tracking pixel URL patterns */
const TRACKING_PIXEL_PATTERNS = [
  'facebook.com/tr',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'analytics.google.com',
  'pixel.facebook.com',
  'bat.bing.com',
  'ads.linkedin.com',
  'pixel.twitter.com',
  'tiktok.com/i18n/pixel',
];

/**
 * PrivacyEnforcerService - Ensures no cross-site tracking in ad requests
 *
 * Validates requests to ensure no third-party cookies, tracking pixels,
 * or cross-site identifiers are present. Provides strict CSP directives
 * for ad serving contexts.
 */
export class PrivacyEnforcerService {
  /**
   * Validate a request's headers for privacy violations.
   * Returns violations if third-party tracking identifiers are detected.
   */
  validateRequest(headers: Record<string, string>): { valid: boolean; violations: string[] } {
    ValidateRequestSchema.parse({ headers });

    const violations: string[] = [];

    // Check for third-party cookies
    const cookieHeader = headers['cookie'] ?? headers['Cookie'] ?? '';
    if (cookieHeader) {
      for (const pattern of TRACKING_COOKIE_PATTERNS) {
        if (cookieHeader.includes(pattern)) {
          violations.push(`Third-party tracking cookie detected: ${pattern}`);
        }
      }
    }

    // Check for tracking referers
    const referer = headers['referer'] ?? headers['Referer'] ?? '';
    for (const pattern of TRACKING_PIXEL_PATTERNS) {
      if (referer.includes(pattern)) {
        violations.push(`Tracking referer detected: ${pattern}`);
      }
    }

    // Check for cross-site identifiers in custom headers
    const crossSiteId = headers['x-cross-site-id'] ?? headers['X-Cross-Site-Id'] ?? '';
    if (crossSiteId) {
      violations.push('Cross-site identifier header detected: x-cross-site-id');
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Audit an ad response to ensure no tracking payloads are included.
   */
  auditAdResponse(response: unknown): { clean: boolean; issues: string[] } {
    const issues: string[] = [];
    const responseStr = JSON.stringify(response);

    // Check for tracking pixel URLs in response
    for (const pattern of TRACKING_PIXEL_PATTERNS) {
      if (responseStr.includes(pattern)) {
        issues.push(`Tracking pixel URL found in response: ${pattern}`);
      }
    }

    // Check for embedded tracking scripts
    if (responseStr.includes('<script') && responseStr.includes('track')) {
      issues.push('Potential tracking script detected in ad response');
    }

    // Check for third-party iframe sources
    if (responseStr.includes('<iframe') && responseStr.includes('doubleclick')) {
      issues.push('Third-party tracking iframe detected');
    }

    return {
      clean: issues.length === 0,
      issues,
    };
  }

  /**
   * Get strict CSP directives for ad serving.
   * Blocks third-party cookies, external tracking pixels, and unsafe inline scripts.
   */
  getStrictCSPDirectives(): Record<string, string[]> {
    return {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'strict-dynamic'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'block-all-mixed-content': [],
      'upgrade-insecure-requests': [],
    };
  }
}
