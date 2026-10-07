// ============================================================================
// Security Package - Pen Test Scanner (OWASP Top 10)
// ============================================================================

import type { PenTestFinding, PenTestReport } from '../types';

/** OWASP Top 10 categories (2021) */
const OWASP_CATEGORIES = [
  'A01:2021-Broken Access Control',
  'A02:2021-Cryptographic Failures',
  'A03:2021-Injection',
  'A04:2021-Insecure Design',
  'A05:2021-Security Misconfiguration',
  'A06:2021-Vulnerable and Outdated Components',
  'A07:2021-Identification and Authentication Failures',
  'A08:2021-Software and Data Integrity Failures',
  'A09:2021-Security Logging and Monitoring Failures',
  'A10:2021-Server-Side Request Forgery',
] as const;

interface ScanOptions {
  timeout?: number;
  followRedirects?: boolean;
  maxDepth?: number;
}

/**
 * PenTestScanner - Automated security scanner checking for OWASP Top 10 vulnerabilities.
 * Performs passive analysis of endpoint configurations, headers, and responses.
 */
export class PenTestScanner {
  private findings: PenTestFinding[] = [];
  private findingCounter = 0;

  /** Scan an endpoint for OWASP Top 10 vulnerabilities */
  scanEndpoint(
    url: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    _options: ScanOptions = {},
  ): PenTestFinding[] {
    const endpointFindings: PenTestFinding[] = [];

    endpointFindings.push(...this.checkBrokenAccessControl(url, method, headers));
    endpointFindings.push(...this.checkCryptographicFailures(url, headers));
    endpointFindings.push(...this.checkInjection(url, method, headers));
    endpointFindings.push(...this.checkSecurityMisconfiguration(url, headers));
    endpointFindings.push(...this.checkAuthFailures(url, headers));
    endpointFindings.push(...this.checkLoggingFailures(url, headers));
    endpointFindings.push(...this.checkSSRF(url, method));

    this.findings.push(...endpointFindings);
    return endpointFindings;
  }

  /** Generate a structured report from all findings */
  generateReport(findings?: PenTestFinding[]): PenTestReport {
    const reportFindings = findings || this.findings;
    return {
      scanId: `scan-${Date.now()}`,
      timestamp: Date.now(),
      target: reportFindings[0]?.endpoint || 'unknown',
      findings: reportFindings,
      summary: {
        total: reportFindings.length,
        critical: reportFindings.filter((f) => f.severity === 'critical').length,
        high: reportFindings.filter((f) => f.severity === 'high').length,
        medium: reportFindings.filter((f) => f.severity === 'medium').length,
        low: reportFindings.filter((f) => f.severity === 'low').length,
        info: reportFindings.filter((f) => f.severity === 'info').length,
      },
    };
  }

  /** Get all findings accumulated so far */
  getFindings(): PenTestFinding[] {
    return [...this.findings];
  }

  /** Reset scanner state */
  reset(): void {
    this.findings = [];
    this.findingCounter = 0;
  }

  private createFinding(
    category: string,
    severity: PenTestFinding['severity'],
    title: string,
    description: string,
    endpoint: string,
    evidence: string,
    remediation: string,
    owaspCategory: string,
  ): PenTestFinding {
    return {
      id: `PTF-${++this.findingCounter}`,
      category,
      severity,
      title,
      description,
      endpoint,
      evidence,
      remediation,
      owaspCategory,
    };
  }

  private checkBrokenAccessControl(
    url: string,
    method: string,
    headers: Record<string, string>,
  ): PenTestFinding[] {
    const findings: PenTestFinding[] = [];

    // Check for missing authorization header on sensitive methods
    if (['PUT', 'DELETE', 'PATCH'].includes(method) && !headers['authorization']) {
      findings.push(
        this.createFinding(
          'access_control',
          'high',
          'Missing Authorization on Sensitive Method',
          `${method} request to ${url} lacks authorization header`,
          url,
          `Method: ${method}, No Authorization header present`,
          'Require authentication for all state-changing operations',
          OWASP_CATEGORIES[0],
        ),
      );
    }

    // Check for path traversal patterns
    if (url.includes('..') || url.includes('%2e%2e')) {
      findings.push(
        this.createFinding(
          'access_control',
          'critical',
          'Path Traversal Detected',
          `URL contains path traversal patterns: ${url}`,
          url,
          `Path traversal pattern found in URL`,
          'Validate and sanitize all file path inputs; use allowlists',
          OWASP_CATEGORIES[0],
        ),
      );
    }

    return findings;
  }

  private checkCryptographicFailures(
    url: string,
    headers: Record<string, string>,
  ): PenTestFinding[] {
    const findings: PenTestFinding[] = [];

    if (url.startsWith('http://') && !url.includes('localhost')) {
      findings.push(
        this.createFinding(
          'cryptography',
          'high',
          'Unencrypted Transport',
          `Endpoint ${url} uses HTTP instead of HTTPS`,
          url,
          'URL scheme is http://',
          'Enforce HTTPS for all endpoints; enable HSTS',
          OWASP_CATEGORIES[1],
        ),
      );
    }

    if (headers['authorization']?.startsWith('Basic ')) {
      findings.push(
        this.createFinding(
          'cryptography',
          'medium',
          'Basic Authentication in Use',
          'Basic authentication transmits credentials in base64 (not encrypted)',
          url,
          'Authorization: Basic header detected',
          'Use token-based authentication (OAuth2, JWT) instead of Basic auth',
          OWASP_CATEGORIES[1],
        ),
      );
    }

    return findings;
  }

  private checkInjection(
    url: string,
    _method: string,
    _headers: Record<string, string>,
  ): PenTestFinding[] {
    const findings: PenTestFinding[] = [];
    const injectionPatterns = [
      { pattern: /['";].*(?:OR|AND|UNION|SELECT|DROP)/i, name: 'SQL Injection' },
      { pattern: /<script[^>]*>/i, name: 'XSS via Script Tag' },
      { pattern: /\$\{.*\}/, name: 'Template Injection' },
    ];

    for (const { pattern, name } of injectionPatterns) {
      if (pattern.test(url)) {
        findings.push(
          this.createFinding(
            'injection',
            'critical',
            `${name} Pattern Detected`,
            `URL contains potential ${name.toLowerCase()} payload`,
            url,
            `Pattern match: ${pattern.source}`,
            'Use parameterized queries; implement input validation; apply output encoding',
            OWASP_CATEGORIES[2],
          ),
        );
      }
    }

    return findings;
  }

  private checkSecurityMisconfiguration(
    url: string,
    headers: Record<string, string>,
  ): PenTestFinding[] {
    const findings: PenTestFinding[] = [];

    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'strict-transport-security',
    ];

    for (const header of securityHeaders) {
      if (!headers[header]) {
        findings.push(
          this.createFinding(
            'misconfiguration',
            'low',
            `Missing Security Header: ${header}`,
            `Response is missing the ${header} security header`,
            url,
            `Header ${header} not found in response headers`,
            `Add ${header} header to all responses`,
            OWASP_CATEGORIES[4],
          ),
        );
      }
    }

    return findings;
  }

  private checkAuthFailures(url: string, headers: Record<string, string>): PenTestFinding[] {
    const findings: PenTestFinding[] = [];

    if (headers['authorization']) {
      const token = headers['authorization'].replace('Bearer ', '');
      // Check for obviously weak tokens
      if (token.length < 20) {
        findings.push(
          this.createFinding(
            'authentication',
            'high',
            'Weak Authentication Token',
            'Authentication token appears to be too short',
            url,
            `Token length: ${token.length} characters`,
            'Use cryptographically secure tokens with at least 256 bits of entropy',
            OWASP_CATEGORIES[6],
          ),
        );
      }
    }

    return findings;
  }

  private checkLoggingFailures(url: string, headers: Record<string, string>): PenTestFinding[] {
    const findings: PenTestFinding[] = [];

    if (!headers['x-request-id'] && !headers['x-correlation-id']) {
      findings.push(
        this.createFinding(
          'logging',
          'low',
          'Missing Request Correlation ID',
          'No request ID or correlation ID header found for tracing',
          url,
          'Missing x-request-id and x-correlation-id headers',
          'Include unique request IDs for all requests to enable audit trail',
          OWASP_CATEGORIES[8],
        ),
      );
    }

    return findings;
  }

  private checkSSRF(url: string, _method: string): PenTestFinding[] {
    const findings: PenTestFinding[] = [];
    const internalPatterns = [
      /169\.254\.\d+\.\d+/, // AWS metadata
      /127\.0\.0\.1/,
      /0\.0\.0\.0/,
      /localhost/,
      /10\.\d+\.\d+\.\d+/,
      /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
      /192\.168\.\d+\.\d+/,
    ];

    for (const pattern of internalPatterns) {
      if (pattern.test(url) && !url.includes('localhost:')) {
        findings.push(
          this.createFinding(
            'ssrf',
            'critical',
            'Potential SSRF - Internal Network Access',
            `URL points to internal network address: ${url}`,
            url,
            `Internal IP pattern detected: ${pattern.source}`,
            'Validate and allowlist outbound URLs; block internal network ranges',
            OWASP_CATEGORIES[9],
          ),
        );
        break;
      }
    }

    return findings;
  }
}
