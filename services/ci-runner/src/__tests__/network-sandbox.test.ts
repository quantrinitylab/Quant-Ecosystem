import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import {
  ALLOWED_REGISTRY_DOMAINS,
  isIpBlocked,
  parseIPv4,
  parseIPv6,
  validateEgressDestination,
  RestrictedEgressProxy,
  type EgressSecurityAuditEvent,
} from '../proxy.js';
import {
  NetworkSandbox,
  NetworkSandboxIsolationError,
  configureUnsharedNetworkCommand,
  validateNetworkSandbox,
  assertNetworkSandboxIsolation,
} from '../network-sandbox.js';

describe('Task W34-03: CI Sandbox Network Isolation & Restricted Egress Proxy', () => {
  describe('Strict Package Registry Domain Allowlist', () => {
    const mockDnsPublic = vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 });

    it.each(ALLOWED_REGISTRY_DOMAINS)(
      'allows outbound traffic to trusted package registry: %s',
      async (domain) => {
        const result = await validateEgressDestination(`https://${domain}/`, {
          dnsLookup: mockDnsPublic,
        });

        expect(result.allowed).toBe(true);
        expect(result.hostname).toBe(domain);
        expect(result.port).toBe(443);
        expect(result.resolvedIp).toBe('93.184.216.34');
      },
    );

    it('allows registries with deep resource paths and query parameters', async () => {
      const npmPkg = await validateEgressDestination(
        'https://registry.npmjs.org/@quant/core/-/core-1.0.0.tgz?token=xyz',
        { dnsLookup: mockDnsPublic },
      );
      expect(npmPkg.allowed).toBe(true);

      const pypiWheel = await validateEgressDestination(
        'https://files.pythonhosted.org/packages/source/n/numpy/numpy-1.26.0.tar.gz',
        { dnsLookup: mockDnsPublic },
      );
      expect(pypiWheel.allowed).toBe(true);

      const cratesApi = await validateEgressDestination(
        'https://crates.io/api/v1/crates/serde/1.0.190/download',
        { dnsLookup: mockDnsPublic },
      );
      expect(cratesApi.allowed).toBe(true);
    });

    it('accepts URL instances as input', async () => {
      const targetUrl = new URL('https://github.com/quant-ecosystem/runner');
      const result = await validateEgressDestination(targetUrl, {
        dnsLookup: mockDnsPublic,
      });

      expect(result.allowed).toBe(true);
      expect(result.hostname).toBe('github.com');
    });

    it('normalizes uppercase domain names to lowercase', async () => {
      const result = await validateEgressDestination('HTTPS://PYPI.ORG/project/pip/', {
        dnsLookup: mockDnsPublic,
      });

      expect(result.allowed).toBe(true);
      expect(result.hostname).toBe('pypi.org');
    });

    it('blocks arbitrary and unlisted internet domains', async () => {
      const auditFn = vi.fn();
      const forbiddenDomains = [
        'https://evil-attacker.com',
        'https://malicious-c2.org/exfiltrate',
        'https://pastebin.com/raw/secret',
        'https://webhook.site/uuid',
        'https://google.com',
      ];

      for (const url of forbiddenDomains) {
        const result = await validateEgressDestination(url, {
          onAuditLog: auditFn,
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not in the allowed package registry allowlist');
      }

      expect(auditFn).toHaveBeenCalledTimes(forbiddenDomains.length);
    });

    it('blocks non-HTTP and non-HTTPS protocols', async () => {
      const resultFtp = await validateEgressDestination('ftp://registry.npmjs.org/file.tgz');
      expect(resultFtp.allowed).toBe(false);
      expect(resultFtp.reason).toContain('Unsupported protocol');

      const resultFile = await validateEgressDestination('file:///etc/passwd');
      expect(resultFile.allowed).toBe(false);
      expect(resultFile.reason).toContain('Unsupported protocol');
    });
  });

  describe('Adversarial IP Blocking (IMDS, Private CIDR, Loopback, IPv6)', () => {
    describe('IP Range Block Checks (isIpBlocked / validateEgressDestination)', () => {
      it('blocks AWS/Cloud IMDS metadata IP (169.254.169.254) and 169.254.0.0/16 subnet', async () => {
        const imdsTargets = [
          'http://169.254.169.254',
          'http://169.254.169.254/latest/meta-data/',
          'http://169.254.169.254/latest/api/token',
          'http://169.254.1.1',
          'http://169.254.254.254',
        ];

        for (const target of imdsTargets) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/Cloud IMDS|Link-local/i);
        }

        expect(isIpBlocked('169.254.169.254').blocked).toBe(true);
        expect(isIpBlocked('169.254.0.1').blocked).toBe(true);
      });

      it('blocks RFC 1918 Private CIDR 10.0.0.0/8', async () => {
        const targets = ['http://10.0.0.1', 'http://10.10.10.10', 'http://10.255.255.254'];

        for (const target of targets) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/RFC 1918/i);
        }

        expect(isIpBlocked('10.0.0.1').blocked).toBe(true);
        expect(isIpBlocked('10.254.0.1').blocked).toBe(true);
      });

      it('blocks RFC 1918 Private CIDR 172.16.0.0/12', async () => {
        const targets = ['http://172.16.0.1', 'http://172.24.1.5', 'http://172.31.255.254'];

        for (const target of targets) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/RFC 1918/i);
        }

        expect(isIpBlocked('172.16.0.1').blocked).toBe(true);
        expect(isIpBlocked('172.31.255.254').blocked).toBe(true);
      });

      it('blocks RFC 1918 Private CIDR 192.168.0.0/16', async () => {
        const targets = ['http://192.168.0.1', 'http://192.168.1.1', 'http://192.168.254.254'];

        for (const target of targets) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/RFC 1918/i);
        }

        expect(isIpBlocked('192.168.0.1').blocked).toBe(true);
        expect(isIpBlocked('192.168.1.1').blocked).toBe(true);
      });

      it('blocks Loopback (127.0.0.0/8) and localhost', async () => {
        const loopbacks = [
          'http://127.0.0.1',
          'http://127.0.0.2',
          'http://127.255.255.254',
          'http://localhost',
          'http://localhost:8080',
          'http://sub.localhost',
        ];

        for (const target of loopbacks) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/Loopback/i);
        }

        expect(isIpBlocked('127.0.0.1').blocked).toBe(true);
        expect(isIpBlocked('127.1.2.3').blocked).toBe(true);
      });

      it('blocks Current Network 0.0.0.0/8', async () => {
        const result = await validateEgressDestination('http://0.0.0.0');
        expect(result.allowed).toBe(false);
        expect(isIpBlocked('0.0.0.0').blocked).toBe(true);
      });

      it('blocks IPv6 loopback (::1)', async () => {
        const loopbacks = ['http://[::1]', 'http://[0000:0000:0000:0000:0000:0000:0000:0001]'];

        for (const target of loopbacks) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/IPv6 loopback/i);
        }

        expect(isIpBlocked('::1').blocked).toBe(true);
        expect(isIpBlocked('0:0:0:0:0:0:0:1').blocked).toBe(true);
      });

      it('blocks IPv6 link-local addresses (fe80::/10)', async () => {
        const targets = ['http://[fe80::1]', 'http://[fe80::20c:29ff:fe4b:8f3c]'];

        for (const target of targets) {
          const result = await validateEgressDestination(target);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(/IPv6 link-local/i);
        }

        expect(isIpBlocked('fe80::1').blocked).toBe(true);
        expect(isIpBlocked('febf::ffff').blocked).toBe(true);
      });

      it('blocks IPv4-mapped IPv6 addresses mapping to IMDS, Private CIDRs, and Loopback', async () => {
        const mappedTargets = [
          { url: 'http://[::ffff:169.254.169.254]', expected: /IMDS|Link-local/i },
          { url: 'http://[::ffff:10.0.0.1]', expected: /RFC 1918/i },
          { url: 'http://[::ffff:172.16.0.1]', expected: /RFC 1918/i },
          { url: 'http://[::ffff:192.168.1.1]', expected: /RFC 1918/i },
          { url: 'http://[::ffff:127.0.0.1]', expected: /Loopback/i },
        ];

        for (const item of mappedTargets) {
          const result = await validateEgressDestination(item.url);
          expect(result.allowed).toBe(false);
          expect(result.reason).toMatch(item.expected);
        }

        expect(isIpBlocked('::ffff:169.254.169.254').blocked).toBe(true);
        expect(isIpBlocked('::ffff:10.0.0.1').blocked).toBe(true);
        expect(isIpBlocked('::ffff:172.16.0.1').blocked).toBe(true);
        expect(isIpBlocked('::ffff:192.168.1.1').blocked).toBe(true);
        expect(isIpBlocked('::ffff:127.0.0.1').blocked).toBe(true);
      });

      it('correctly parses and validates IPv4 octets and IPv6 words', () => {
        expect(parseIPv4('192.168.1.1')).toBe(3232235777);
        expect(parseIPv4('256.0.0.1')).toBeNull();
        expect(parseIPv4('invalid.ip')).toBeNull();
        expect(parseIPv4('010.0.0.1')).toBeNull(); // Leading zero octal reject

        const parsedV6 = parseIPv6('::1');
        expect(parsedV6).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);

        const mappedV6 = parseIPv6('::ffff:192.168.1.1');
        expect(mappedV6).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
      });
    });
  });

  describe('Security Audit Log Emission (EGRESS_DESTINATION_BLOCKED)', () => {
    it('emits audit event when egress to IMDS metadata IP is blocked', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];
      const onAuditLog = (evt: EgressSecurityAuditEvent) => auditEvents.push(evt);

      await validateEgressDestination('http://169.254.169.254/latest/meta-data', {
        onAuditLog,
      });

      expect(auditEvents).toHaveLength(1);
      const event = auditEvents[0]!;
      expect(event.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(event.destination).toBe('http://169.254.169.254/latest/meta-data');
      expect(event.reason).toMatch(/Cloud IMDS|Link-local/i);
      expect(event.resolvedIp).toBe('169.254.169.254');
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    });

    it('emits audit event when egress to RFC 1918 private CIDR is blocked', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];

      await validateEgressDestination('http://10.0.0.1:8080/internal-api', {
        onAuditLog: (evt) => auditEvents.push(evt),
      });

      expect(auditEvents).toHaveLength(1);
      const event = auditEvents[0]!;
      expect(event.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(event.destination).toBe('http://10.0.0.1:8080/internal-api');
      expect(event.reason).toMatch(/RFC 1918/i);
      expect(event.resolvedIp).toBe('10.0.0.1');
    });

    it('emits audit event when egress to unlisted domain is blocked', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];

      await validateEgressDestination('https://internal-wiki.corp.local', {
        onAuditLog: (evt) => auditEvents.push(evt),
      });

      expect(auditEvents).toHaveLength(1);
      const event = auditEvents[0]!;
      expect(event.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(event.destination).toBe('https://internal-wiki.corp.local');
      expect(event.reason).toContain('not in the allowed package registry allowlist');
    });

    it('emits audit event on HTTP CONNECT tunnel non-443 port inspection failure', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];

      await validateEgressDestination('registry.npmjs.org:80', {
        isConnectTunnel: true,
        port: 80,
        onAuditLog: (evt) => auditEvents.push(evt),
      });

      expect(auditEvents).toHaveLength(1);
      const event = auditEvents[0]!;
      expect(event.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(event.reason).toContain('only port 443 is allowed');
    });
  });

  describe('DNS Rebinding Defense (TOCTOU Protection)', () => {
    it('detects and blocks DNS rebinding resolving to IMDS IP 169.254.169.254', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];
      const maliciousDns = vi.fn().mockResolvedValue({
        address: '169.254.169.254',
        family: 4,
      });

      const result = await validateEgressDestination('https://registry.npmjs.org/package', {
        dnsLookup: maliciousDns,
        onAuditLog: (evt) => auditEvents.push(evt),
      });

      expect(result.allowed).toBe(false);
      expect(result.resolvedIp).toBe('169.254.169.254');
      expect(result.reason).toContain('DNS rebinding defense');
      expect(result.reason).toMatch(/Cloud IMDS/i);

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]!.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(auditEvents[0]!.resolvedIp).toBe('169.254.169.254');
    });

    it('detects and blocks DNS rebinding resolving to RFC 1918 private IP 10.0.0.1', async () => {
      const auditEvents: EgressSecurityAuditEvent[] = [];
      const maliciousDns = vi.fn().mockResolvedValue({
        address: '10.0.0.1',
        family: 4,
      });

      const result = await validateEgressDestination('https://pypi.org/simple/flask', {
        dnsLookup: maliciousDns,
        onAuditLog: (evt) => auditEvents.push(evt),
      });

      expect(result.allowed).toBe(false);
      expect(result.resolvedIp).toBe('10.0.0.1');
      expect(result.reason).toContain('DNS rebinding defense');
      expect(result.reason).toMatch(/RFC 1918/i);
    });

    it('detects and blocks DNS rebinding resolving to loopback 127.0.0.1', async () => {
      const maliciousDns = vi.fn().mockResolvedValue({
        address: '127.0.0.1',
        family: 4,
      });

      const result = await validateEgressDestination('https://crates.io/api/v1', {
        dnsLookup: maliciousDns,
      });

      expect(result.allowed).toBe(false);
      expect(result.resolvedIp).toBe('127.0.0.1');
      expect(result.reason).toContain('DNS rebinding defense');
      expect(result.reason).toMatch(/Loopback/i);
    });

    it('detects and blocks DNS rebinding resolving to IPv4-mapped IPv6 IMDS', async () => {
      const maliciousDns = vi.fn().mockResolvedValue({
        address: '::ffff:169.254.169.254',
        family: 6,
      });

      const result = await validateEgressDestination('https://proxy.golang.org', {
        dnsLookup: maliciousDns,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('DNS rebinding defense');
    });

    it('verifies DNS lookup is performed exactly once (TOCTOU single resolution)', async () => {
      const singleDnsLookup = vi.fn().mockResolvedValue({
        address: '104.16.27.34',
        family: 4,
      });

      const result = await validateEgressDestination('https://registry.npmjs.org/express', {
        dnsLookup: singleDnsLookup,
      });

      expect(result.allowed).toBe(true);
      expect(singleDnsLookup).toHaveBeenCalledTimes(1);
      expect(result.resolvedIp).toBe('104.16.27.34');
    });
  });

  describe('HTTP CONNECT Tunnel Port Inspection', () => {
    const mockDnsPublic = vi.fn().mockResolvedValue({ address: '140.82.121.4', family: 4 });

    it('allows CONNECT tunnel strictly on port 443', async () => {
      const result = await validateEgressDestination('github.com:443', {
        isConnectTunnel: true,
        port: 443,
        dnsLookup: mockDnsPublic,
      });

      expect(result.allowed).toBe(true);
      expect(result.port).toBe(443);
    });

    it('rejects CONNECT tunnel on port 80', async () => {
      const result = await validateEgressDestination('github.com:80', {
        isConnectTunnel: true,
        port: 80,
        dnsLookup: mockDnsPublic,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('only port 443 is allowed');
    });

    it('rejects CONNECT tunnel on port 8080 and 8443', async () => {
      const result8080 = await validateEgressDestination('registry.npmjs.org:8080', {
        isConnectTunnel: true,
        port: 8080,
        dnsLookup: mockDnsPublic,
      });
      expect(result8080.allowed).toBe(false);
      expect(result8080.reason).toContain('only port 443 is allowed');

      const result8443 = await validateEgressDestination('registry.npmjs.org:8443', {
        isConnectTunnel: true,
        port: 8443,
        dnsLookup: mockDnsPublic,
      });
      expect(result8443.allowed).toBe(false);
      expect(result8443.reason).toContain('only port 443 is allowed');
    });
  });

  describe('Network Sandbox Isolation Config (unshare -n & Fail-Closed)', () => {
    it('wraps execution command with unshare -n flags', () => {
      const sandbox = new NetworkSandbox();
      const wrapped = sandbox.wrapCommand(['npm', 'test']);

      expect(wrapped).toEqual(['unshare', '-n', '--', 'npm', 'test']);
    });

    it('configureUnsharedNetworkCommand helper supports custom flags and rootless mapping', () => {
      const rootlessCmd = configureUnsharedNetworkCommand(['pytest'], { rootless: true });
      expect(rootlessCmd).toEqual(['unshare', '-n', '-r', '--', 'pytest']);

      const customCmd = configureUnsharedNetworkCommand(['cargo', 'build'], {
        unsharePath: '/usr/bin/unshare',
        useDoubleDash: false,
      });
      expect(customCmd).toEqual(['/usr/bin/unshare', '-n', 'cargo', 'build']);
    });

    it('generates sandbox proxy environment variables when proxyUrl is configured', () => {
      const sandbox = new NetworkSandbox({
        proxyUrl: 'http://127.0.0.1:9090',
        unshareNetwork: true,
      });

      const env = sandbox.getSandboxEnv();
      expect(env['QUANT_SANDBOX_NETWORK_ISOLATED']).toBe('true');
      expect(env['HTTP_PROXY']).toBe('http://127.0.0.1:9090');
      expect(env['HTTPS_PROXY']).toBe('http://127.0.0.1:9090');
      expect(env['http_proxy']).toBe('http://127.0.0.1:9090');
      expect(env['https_proxy']).toBe('http://127.0.0.1:9090');
      expect(env['ALL_PROXY']).toBe('http://127.0.0.1:9090');
      expect(env['NO_PROXY']).toBe('localhost,127.0.0.1');
    });

    it('fails closed when unshareNetwork is disabled', async () => {
      const sandbox = new NetworkSandbox({
        unshareNetwork: false,
        failClosed: true,
      });

      expect(() => sandbox.wrapCommand(['ls'])).toThrow(NetworkSandboxIsolationError);
      await expect(sandbox.validateIsolation()).rejects.toThrow(NetworkSandboxIsolationError);
      await expect(sandbox.assertIsolated()).rejects.toThrow(NetworkSandboxIsolationError);
    });

    it('fails closed when namespace probe detects host network namespace', async () => {
      const hostProbe = vi.fn().mockResolvedValue({
        isIsolated: false,
        interfaceNames: ['eth0', 'wlan0', 'lo'],
        reason: 'Host physical interface eth0 detected in network namespace',
      });

      const sandbox = new NetworkSandbox({
        unshareNetwork: true,
        failClosed: true,
      });

      await expect(sandbox.assertIsolated(hostProbe)).rejects.toThrow(NetworkSandboxIsolationError);
      await expect(assertNetworkSandboxIsolation({ failClosed: true }, hostProbe)).rejects.toThrow(
        NetworkSandboxIsolationError,
      );
    });

    it('succeeds when namespace probe confirms isolated network namespace', async () => {
      const isolatedProbe = vi.fn().mockResolvedValue({
        isIsolated: true,
        namespaceId: 'net:[4026532200]',
        interfaceNames: ['lo'],
      });

      const sandbox = new NetworkSandbox({
        unshareNetwork: true,
        proxyUrl: 'http://127.0.0.1:8080',
      });

      const result = await sandbox.validateIsolation(isolatedProbe);
      expect(result.isolated).toBe(true);
      expect(result.rulesEnforced.unsharedNamespace).toBe(true);
      expect(result.rulesEnforced.proxyConfigured).toBe(true);
      expect(result.details.proxyUrl).toBe('http://127.0.0.1:8080');

      await expect(sandbox.assertIsolated(isolatedProbe)).resolves.toBeUndefined();
    });

    it('validateNetworkSandbox functional helper enforces rules', async () => {
      const result = await validateNetworkSandbox({
        unshareNetwork: true,
        failClosed: false,
      });

      expect(result.isolated).toBe(true);
      expect(result.rulesEnforced.unsharedNamespace).toBe(true);
    });
  });

  describe('RestrictedEgressProxy End-to-End Server', () => {
    let proxy: RestrictedEgressProxy;
    let proxyPort: number;
    let auditEvents: EgressSecurityAuditEvent[] = [];

    beforeEach(async () => {
      auditEvents = [];
      proxy = new RestrictedEgressProxy({
        onAuditLog: (evt) => auditEvents.push(evt),
        dnsLookup: vi.fn().mockImplementation((host: string) => {
          if (host === 'registry.npmjs.org') {
            return Promise.resolve({ address: '104.16.27.34', family: 4 });
          }
          if (host === 'github.com') {
            return Promise.resolve({ address: '140.82.121.4', family: 4 });
          }
          return Promise.resolve({ address: '93.184.216.34', family: 4 });
        }),
      });

      const addr = await proxy.start(0, '127.0.0.1');
      proxyPort = addr.port;
    });

    afterEach(async () => {
      if (proxy.isRunning()) {
        await proxy.stop();
      }
    });

    it('starts proxy and exposes valid url and port', () => {
      expect(proxy.isRunning()).toBe(true);
      expect(proxy.getPort()).toBe(proxyPort);
      expect(proxy.getUrl()).toBe(`http://127.0.0.1:${proxyPort}`);
    });

    it('blocks HTTP request to AWS IMDS metadata IP with 403 Forbidden', async () => {
      const response = await new Promise<{ statusCode: number; body: string }>(
        (resolve, reject) => {
          const req = http.request(
            `http://127.0.0.1:${proxyPort}/latest/meta-data/`,
            {
              headers: { host: '169.254.169.254' },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
            },
          );
          req.on('error', reject);
          req.end();
        },
      );

      expect(response.statusCode).toBe(403);
      const parsedBody = JSON.parse(response.body);
      expect(parsedBody.error).toBe('EGRESS_DESTINATION_BLOCKED');

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]!.event).toBe('EGRESS_DESTINATION_BLOCKED');
      expect(auditEvents[0]!.reason).toMatch(/Cloud IMDS|Link-local/i);
    });

    it('blocks HTTP request to RFC 1918 private IP with 403 Forbidden', async () => {
      const response = await new Promise<{ statusCode: number; body: string }>(
        (resolve, reject) => {
          const req = http.request(
            `http://127.0.0.1:${proxyPort}/private-data`,
            {
              headers: { host: '10.0.0.1' },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
            },
          );
          req.on('error', reject);
          req.end();
        },
      );

      expect(response.statusCode).toBe(403);
      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]!.reason).toMatch(/RFC 1918/i);
    });

    it('blocks HTTP CONNECT tunnel to non-443 port with 403 Forbidden', async () => {
      const connectResponse = await new Promise<string>((resolve, reject) => {
        const client = net.connect({ port: proxyPort, host: '127.0.0.1' }, () => {
          client.write(
            'CONNECT registry.npmjs.org:8080 HTTP/1.1\r\nHost: registry.npmjs.org:8080\r\n\r\n',
          );
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
        });
        client.on('close', () => resolve(data));
        client.on('error', reject);
      });

      expect(connectResponse).toContain('403 Forbidden');
      expect(connectResponse).toContain('EGRESS_DESTINATION_BLOCKED');
      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('blocks HTTP CONNECT tunnel to AWS metadata IP with 403 Forbidden', async () => {
      const connectResponse = await new Promise<string>((resolve, reject) => {
        const client = net.connect({ port: proxyPort, host: '127.0.0.1' }, () => {
          client.write('CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n');
        });

        let data = '';
        client.on('data', (chunk) => {
          data += chunk.toString();
        });
        client.on('close', () => resolve(data));
        client.on('error', reject);
      });

      expect(connectResponse).toContain('403 Forbidden');
      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]!.reason).toMatch(/Cloud IMDS|Link-local/i);
    });
  });
});
