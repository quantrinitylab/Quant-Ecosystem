import { describe, it, expect } from 'vitest';
import { ContainerSecurityScanner } from './container-security';

describe('ContainerSecurityScanner', () => {
  const scanner = new ContainerSecurityScanner();

  describe('validateDockerfile', () => {
    it('should pass a secure Dockerfile', () => {
      const dockerfile = `
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm ci

FROM gcr.io/distroless/nodejs22-debian12
USER 65532
COPY --from=builder /app /app
CMD ["dist/index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should detect running as root', () => {
      const dockerfile = `
FROM node:22
WORKDIR /app
COPY . .
CMD ["node", "index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      const rootIssue = result.issues.find((i) => i.rule === 'no-root-user');
      expect(rootIssue).toBeDefined();
      expect(rootIssue!.severity).toBe('critical');
    });

    it('should detect secrets in ENV', () => {
      const dockerfile = `
FROM node:22
ENV DATABASE_PASSWORD=mysecret123
USER node
CMD ["node", "index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      const secretIssue = result.issues.find((i) => i.rule === 'no-secrets');
      expect(secretIssue).toBeDefined();
      expect(secretIssue!.severity).toBe('critical');
    });

    it('should detect :latest tag', () => {
      const dockerfile = `
FROM node:latest
FROM node:22 AS prod
USER 65532
CMD ["node", "index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      const tagIssue = result.issues.find((i) => i.rule === 'use-specific-tag');
      expect(tagIssue).toBeDefined();
    });

    it('should detect curl pipe to shell', () => {
      const dockerfile = `
FROM node:22 AS builder
RUN curl -fsSL https://example.com/install.sh | bash
FROM gcr.io/distroless/nodejs22-debian12
USER 65532
CMD ["index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      const curlIssue = result.issues.find((i) => i.rule === 'no-curl-pipe');
      expect(curlIssue).toBeDefined();
      expect(curlIssue!.severity).toBe('high');
    });

    it('should detect single-stage builds', () => {
      const dockerfile = `
FROM node:22
USER node
CMD ["node", "index.js"]
`;
      const result = scanner.validateDockerfile(dockerfile);
      const stageIssue = result.issues.find((i) => i.rule === 'multi-stage');
      expect(stageIssue).toBeDefined();
    });
  });

  describe('generateSecureDockerfile', () => {
    it('should generate a multi-stage Dockerfile', () => {
      const dockerfile = scanner.generateSecureDockerfile('identity', 'node:22-slim');
      expect(dockerfile).toContain('FROM node:22-slim AS builder');
      expect(dockerfile).toContain('gcr.io/distroless/nodejs22-debian12');
      expect(dockerfile).toContain('USER 65532:65532');
    });

    it('should include the service name', () => {
      const dockerfile = scanner.generateSecureDockerfile('mail-api');
      expect(dockerfile).toContain('mail-api');
    });

    it('should set NODE_ENV to production', () => {
      const dockerfile = scanner.generateSecureDockerfile('test-service');
      expect(dockerfile).toContain('NODE_ENV=production');
    });
  });

  describe('scanImage', () => {
    it('should return empty results when no Trivy output provided', () => {
      const result = scanner.scanImage('myapp:1.0.0');
      expect(result.imageRef).toBe('myapp:1.0.0');
      expect(result.vulnerabilities).toEqual([]);
    });

    it('should pass through Trivy output when provided', () => {
      const trivyOutput = {
        imageRef: 'myapp:1.0.0',
        vulnerabilities: [
          {
            id: 'CVE-2024-1234',
            package: 'openssl',
            severity: 'critical' as const,
            installedVersion: '1.0.0',
            fixedVersion: '1.0.1',
            title: 'Critical OpenSSL vulnerability',
          },
        ],
        scanTime: Date.now(),
      };
      const result = scanner.scanImage('myapp:1.0.0', trivyOutput);
      expect(result.vulnerabilities.length).toBe(1);
      expect(result.vulnerabilities[0]!.id).toBe('CVE-2024-1234');
    });
  });
});
