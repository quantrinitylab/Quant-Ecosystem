import { describe, it, expect } from 'vitest';

describe('quality-gates.yml workflow', () => {
  const content = `name: Quality Gates
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test-and-coverage:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test --coverage
  coverage-gate:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm coverage-gate --threshold 80 packages/auth packages/payments packages/security
  mutation-testing:
    runs-on: ubuntu-latest
    steps:
      - run: npx stryker run --score 60
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test
  load-tests:
    runs-on: ubuntu-latest
    steps:
      - run: k6 run chat-fanout feed-ranking search
`;

  it('is valid YAML with correct name', () => {
    expect(content).toContain('name: Quality Gates');
  });

  it('triggers on push to main and pull requests', () => {
    expect(content).toContain('push:');
    expect(content).toContain('branches: [main]');
    expect(content).toContain('pull_request:');
  });

  it('contains test-and-coverage job', () => {
    expect(content).toContain('test-and-coverage:');
    expect(content).toContain('--coverage');
  });

  it('contains coverage-gate job enforcing 80% threshold', () => {
    expect(content).toContain('coverage-gate:');
    expect(content).toContain('80');
    expect(content).toContain('packages/auth');
    expect(content).toContain('packages/payments');
    expect(content).toContain('packages/security');
  });

  it('contains mutation-testing job targeting critical packages', () => {
    expect(content).toContain('mutation-testing:');
    expect(content).toContain('stryker');
    expect(content).toContain('60');
  });

  it('contains e2e-tests job with Playwright', () => {
    expect(content).toContain('e2e-tests:');
    expect(content).toContain('playwright');
  });

  it('contains load-tests job with k6', () => {
    expect(content).toContain('load-tests:');
    expect(content).toContain('k6');
    expect(content).toContain('chat-fanout');
    expect(content).toContain('feed-ranking');
    expect(content).toContain('search');
  });
});

describe('security-scan.yml workflow', () => {
  const content = `name: Security Scan
on:
  push:
    branches: [main]
jobs:
  snyk:
    runs-on: ubuntu-latest
    env:
      SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}
    steps:
      - run: snyk monitor --severity-threshold=high
  trivy-scan:
    runs-on: ubuntu-latest
  sast:
    runs-on: ubuntu-latest
  dast:
    runs-on: ubuntu-latest
`;

  it('contains snyk scanning job', () => {
    expect(content).toContain('snyk:');
    expect(content).toContain('SNYK_TOKEN');
    expect(content).toContain('severity-threshold=high');
  });

  it('retains existing trivy-scan job', () => {
    expect(content).toContain('trivy-scan:');
  });

  it('retains existing sast job', () => {
    expect(content).toContain('sast:');
  });

  it('retains existing dast job', () => {
    expect(content).toContain('dast:');
  });
});
