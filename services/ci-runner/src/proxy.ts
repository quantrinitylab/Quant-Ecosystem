import * as http from 'node:http';
import * as net from 'node:net';
import * as dns from 'node:dns';
import type * as stream from 'node:stream';

/**
 * Strict Package Registry Domain Allowlist
 * Only trusted package manager registries and Git source providers are permitted.
 */
export const ALLOWED_REGISTRY_DOMAINS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'pypi.org',
  'files.pythonhosted.org',
  'crates.io',
  'proxy.golang.org',
  'github.com',
] as const;

export type AllowedRegistryDomain = (typeof ALLOWED_REGISTRY_DOMAINS)[number];

/**
 * Security Audit Log Event for Blocked Egress Attempts
 */
export interface EgressSecurityAuditEvent {
  event: 'EGRESS_DESTINATION_BLOCKED';
  destination: string;
  reason: string;
  resolvedIp?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type SecurityAuditLogCallback = (event: EgressSecurityAuditEvent) => void;

let globalAuditLogger: SecurityAuditLogCallback | null = null;

export function setGlobalSecurityAuditLogger(logger: SecurityAuditLogCallback | null): void {
  globalAuditLogger = logger;
}

export function getGlobalSecurityAuditLogger(): SecurityAuditLogCallback | null {
  return globalAuditLogger;
}

export interface ValidateEgressOptions {
  allowedDomains?: readonly string[];
  dnsLookup?: (hostname: string) => Promise<{ address: string; family: number } | string>;
  onAuditLog?: SecurityAuditLogCallback;
  auditLogger?: SecurityAuditLogCallback;
  isConnectTunnel?: boolean;
  port?: number;
}

export interface EgressValidationResult {
  allowed: boolean;
  targetUrl: string;
  hostname: string;
  port: number;
  resolvedIp?: string;
  reason?: string;
}

/**
 * Parses an IPv4 address string into a 32-bit unsigned integer.
 * Returns null if the string is not a valid dotted-decimal IPv4 address.
 */
export function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (!part || !/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    // Reject leading zeroes (octal ambiguity) e.g. 010.0.0.1
    if (part.length > 1 && part.startsWith('0')) return null;
    num = num * 256 + n;
  }
  return num >>> 0;
}

/**
 * Parses an IPv6 address string into an array of 8 16-bit word values.
 * Handles IPv4-mapped addresses (::ffff:192.168.1.1) and shorthand '::'.
 * Returns null if invalid.
 */
export function parseIPv6(rawIp: string): number[] | null {
  let ip = rawIp.toLowerCase().replace(/^\[|\]$/g, '');

  // Handle embedded IPv4 notation at the tail (e.g. ::ffff:192.168.1.1)
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1) {
    const tail = ip.slice(lastColon + 1);
    if (tail.includes('.')) {
      const v4Num = parseIPv4(tail);
      if (v4Num === null) return null;
      const high16 = (v4Num >>> 16) & 0xffff;
      const low16 = v4Num & 0xffff;
      ip = ip.slice(0, lastColon) + `:${high16.toString(16)}:${low16.toString(16)}`;
    }
  }

  // Handle '::' compression
  const doubleColonIndex = ip.indexOf('::');
  if (doubleColonIndex !== -1) {
    if (ip.indexOf('::', doubleColonIndex + 2) !== -1) {
      return null; // More than one '::' is strictly invalid
    }
    const leftStr = ip.slice(0, doubleColonIndex);
    const rightStr = ip.slice(doubleColonIndex + 2);
    const leftParts = leftStr ? leftStr.split(':') : [];
    const rightParts = rightStr ? rightStr.split(':') : [];
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 1) return null;
    const middle = new Array<string>(missing).fill('0');
    const allParts = [...leftParts, ...middle, ...rightParts];
    if (allParts.length !== 8) return null;
    return allParts.map((p) => {
      const val = parseInt(p, 16);
      return isNaN(val) ? 0 : val;
    });
  }

  const parts = ip.split(':');
  if (parts.length !== 8) return null;
  return parts.map((p) => {
    const val = parseInt(p, 16);
    return isNaN(val) ? 0 : val;
  });
}

/**
 * Checks an IPv4 32-bit unsigned integer against restricted network ranges:
 * - 0.0.0.0/8: Current network / unspecified
 * - 10.0.0.0/8: RFC 1918 Private
 * - 127.0.0.0/8: Loopback
 * - 169.254.0.0/16: IMDS / Link-local
 * - 172.16.0.0/12: RFC 1918 Private
 * - 192.168.0.0/16: RFC 1918 Private
 * - 100.64.0.0/10: Shared Address Space (Carrier-grade NAT)
 * - 192.0.2.0/24: TEST-NET-1
 * - 198.51.100.0/24: TEST-NET-2
 * - 203.0.113.0/24: TEST-NET-3
 * - 224.0.0.0/4: Multicast
 * - 240.0.0.0/4: Reserved / future use
 * - 255.255.255.255/32: Broadcast
 */
function checkIPv4Blocked(num: number): { blocked: boolean; reason?: string } {
  // 0.0.0.0/8 - Unspecified / current network
  if ((num & 0xff000000) >>> 0 === 0x00000000) {
    return { blocked: true, reason: 'Current network / unspecified address (0.0.0.0/8)' };
  }
  // 10.0.0.0/8 - RFC 1918 private
  if ((num & 0xff000000) >>> 0 === 0x0a000000) {
    return { blocked: true, reason: 'RFC 1918 private network (10.0.0.0/8)' };
  }
  // 127.0.0.0/8 - Loopback
  if ((num & 0xff000000) >>> 0 === 0x7f000000) {
    return { blocked: true, reason: 'Loopback address (127.0.0.0/8)' };
  }
  // 169.254.0.0/16 - Link-local / AWS IMDS
  if ((num & 0xffff0000) >>> 0 === 0xa9fe0000) {
    return { blocked: true, reason: 'Cloud IMDS / Link-local address (169.254.0.0/16)' };
  }
  // 172.16.0.0/12 - RFC 1918 private
  if ((num & 0xfff00000) >>> 0 === 0xac100000) {
    return { blocked: true, reason: 'RFC 1918 private network (172.16.0.0/12)' };
  }
  // 192.168.0.0/16 - RFC 1918 private
  if ((num & 0xffff0000) >>> 0 === 0xc0a80000) {
    return { blocked: true, reason: 'RFC 1918 private network (192.168.0.0/16)' };
  }
  // 100.64.0.0/10 - Shared address space (Carrier-grade NAT)
  if ((num & 0xffc00000) >>> 0 === 0x64400000) {
    return { blocked: true, reason: 'Carrier-grade NAT shared address space (100.64.0.0/10)' };
  }
  // 192.0.2.0/24 - TEST-NET-1
  if ((num & 0xffffff00) >>> 0 === 0xc0000200) {
    return { blocked: true, reason: 'Documentation TEST-NET-1 (192.0.2.0/24)' };
  }
  // 198.51.100.0/24 - TEST-NET-2
  if ((num & 0xffffff00) >>> 0 === 0xc6336400) {
    return { blocked: true, reason: 'Documentation TEST-NET-2 (198.51.100.0/24)' };
  }
  // 203.0.113.0/24 - TEST-NET-3
  if ((num & 0xffffff00) >>> 0 === 0xcb007100) {
    return { blocked: true, reason: 'Documentation TEST-NET-3 (203.0.113.0/24)' };
  }
  // 224.0.0.0/4 - Multicast
  if ((num & 0xf0000000) >>> 0 === 0xe0000000) {
    return { blocked: true, reason: 'Multicast address range (224.0.0.0/4)' };
  }
  // 240.0.0.0/4 - Reserved
  if ((num & 0xf0000000) >>> 0 === 0xf0000000) {
    return { blocked: true, reason: 'Reserved address range (240.0.0.0/4)' };
  }
  return { blocked: false };
}

/**
 * Checks whether an IP address (IPv4, IPv6, or IPv4-mapped IPv6) belongs
 * to a private, loopback, link-local, or cloud IMDS restricted range.
 */
export function isIpBlocked(ipStr: string): {
  blocked: boolean;
  reason?: string;
  normalizedIp: string;
} {
  const cleaned = ipStr.trim().replace(/^\[|\]$/g, '');

  // Check IPv4
  const v4Num = parseIPv4(cleaned);
  if (v4Num !== null) {
    const res = checkIPv4Blocked(v4Num);
    return {
      blocked: res.blocked,
      reason: res.reason,
      normalizedIp: cleaned,
    };
  }

  // Check IPv6
  const v6Words = parseIPv6(cleaned);
  if (v6Words !== null) {
    // IPv6 unspecified ::
    const allZero = v6Words.every((w) => w === 0);
    if (allZero) {
      return { blocked: true, reason: 'IPv6 unspecified address (::)', normalizedIp: '::' };
    }

    // IPv6 loopback ::1
    const isLoopback = v6Words.slice(0, 7).every((w) => w === 0) && v6Words[7] === 1;
    if (isLoopback) {
      return { blocked: true, reason: 'IPv6 loopback address (::1)', normalizedIp: '::1' };
    }

    // IPv4-mapped IPv6 ::ffff:a.b.c.d
    const isV4Mapped = v6Words.slice(0, 5).every((w) => w === 0) && v6Words[5] === 0xffff;
    if (isV4Mapped) {
      const mappedV4Num = ((v6Words[6]! << 16) | v6Words[7]!) >>> 0;
      const v4Part = `${(mappedV4Num >>> 24) & 0xff}.${(mappedV4Num >>> 16) & 0xff}.${(mappedV4Num >>> 8) & 0xff}.${mappedV4Num & 0xff}`;
      const v4Check = checkIPv4Blocked(mappedV4Num);
      if (v4Check.blocked) {
        return {
          blocked: true,
          reason: `IPv4-mapped IPv6 maps to restricted IPv4 (${v4Part}): ${v4Check.reason}`,
          normalizedIp: v4Part,
        };
      }
      return { blocked: false, normalizedIp: v4Part };
    }

    // IPv4-compatible IPv6 ::a.b.c.d
    const isV4Compat = v6Words.slice(0, 6).every((w) => w === 0);
    if (isV4Compat) {
      const mappedV4Num = ((v6Words[6]! << 16) | v6Words[7]!) >>> 0;
      const v4Part = `${(mappedV4Num >>> 24) & 0xff}.${(mappedV4Num >>> 16) & 0xff}.${(mappedV4Num >>> 8) & 0xff}.${mappedV4Num & 0xff}`;
      const v4Check = checkIPv4Blocked(mappedV4Num);
      if (v4Check.blocked) {
        return {
          blocked: true,
          reason: `IPv4-compatible IPv6 maps to restricted IPv4 (${v4Part}): ${v4Check.reason}`,
          normalizedIp: v4Part,
        };
      }
      return { blocked: false, normalizedIp: v4Part };
    }

    // IPv6 link-local fe80::/10
    if ((v6Words[0]! & 0xffc0) === 0xfe80) {
      return {
        blocked: true,
        reason: 'IPv6 link-local address (fe80::/10)',
        normalizedIp: cleaned,
      };
    }

    // IPv6 unique local fc00::/7
    if ((v6Words[0]! & 0xfe00) === 0xfc00) {
      return {
        blocked: true,
        reason: 'IPv6 unique local address (fc00::/7)',
        normalizedIp: cleaned,
      };
    }

    return { blocked: false, normalizedIp: cleaned };
  }

  // Not an IP address format
  return { blocked: false, normalizedIp: cleaned };
}

function dispatchAuditLog(result: EgressValidationResult, options: ValidateEgressOptions): void {
  if (result.allowed) return;
  const event: EgressSecurityAuditEvent = {
    event: 'EGRESS_DESTINATION_BLOCKED',
    destination: result.targetUrl,
    reason: result.reason ?? 'Egress destination blocked by security policy',
    resolvedIp: result.resolvedIp,
    timestamp: new Date().toISOString(),
    details: {
      hostname: result.hostname,
      port: result.port,
    },
  };

  if (options.onAuditLog) {
    try {
      options.onAuditLog(event);
    } catch {
      // Prevent user callback errors from breaking egress enforcement
    }
  }

  if (options.auditLogger) {
    try {
      options.auditLogger(event);
    } catch {
      // Prevent user callback errors from breaking egress enforcement
    }
  }

  if (globalAuditLogger) {
    try {
      globalAuditLogger(event);
    } catch {
      // Prevent global callback errors from breaking egress enforcement
    }
  }
}

/**
 * Validates an egress destination against security boundaries:
 * 1. URL syntax & HTTP/HTTPS protocol validation
 * 2. HTTP CONNECT tunnel port inspection (strictly port 443 allowed)
 * 3. Strict Package Registry allowlist enforcement
 * 4. IMDS (169.254.169.254 / 169.254.0.0/16) and RFC 1918 private CIDR defense
 * 5. IPv6 normalization (drops IPv4-mapped, ::1, fe80::/10, fc00::/7)
 * 6. DNS Rebinding Defense: Resolves IP once and connects directly to resolved IP (TOCTOU protection)
 * 7. Security audit log callback emission on any blocked attempt (EGRESS_DESTINATION_BLOCKED)
 */
export async function validateEgressDestination(
  targetUrl: string | URL,
  options: ValidateEgressOptions = {},
): Promise<EgressValidationResult> {
  const rawString = typeof targetUrl === 'string' ? targetUrl.trim() : targetUrl.toString();

  let parsed: URL;
  try {
    if (!rawString.includes('://')) {
      if (rawString.startsWith('//')) {
        parsed = new URL(`https:${rawString}`);
      } else {
        parsed = new URL(`https://${rawString}`);
      }
    } else {
      parsed = new URL(rawString);
    }
  } catch {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: '',
      port: 0,
      reason: `Invalid URL format: ${rawString}`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: parsed.hostname,
      port: 0,
      reason: `Unsupported protocol: ${protocol}. Only http: and https: are allowed for CI sandbox egress.`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  const defaultPort = protocol === 'https:' ? 443 : 80;
  const port = options.port ?? (parsed.port ? parseInt(parsed.port, 10) : defaultPort);

  // HTTP CONNECT tunnel inspection: only port 443 allowed
  if (options.isConnectTunnel && port !== 443) {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: parsed.hostname,
      port,
      reason: `HTTP CONNECT tunnel inspection violation: only port 443 is allowed, requested port is ${port}`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  const rawHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Loopback hostname check
  if (rawHostname === 'localhost' || rawHostname.endsWith('.localhost')) {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: rawHostname,
      port,
      resolvedIp: '127.0.0.1',
      reason: 'Loopback destination blocked (localhost)',
    };
    dispatchAuditLog(result, options);
    return result;
  }

  // Direct IP destination check
  const directIpCheck = isIpBlocked(rawHostname);
  const isDirectIp =
    net.isIP(rawHostname) !== 0 ||
    parseIPv4(rawHostname) !== null ||
    parseIPv6(rawHostname) !== null;

  if (isDirectIp) {
    const reason = directIpCheck.blocked
      ? `Blocked IP destination: ${directIpCheck.reason}`
      : `Direct IP destination '${rawHostname}' is not permitted. Only allowed package registry domains are permitted.`;
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: rawHostname,
      port,
      resolvedIp: directIpCheck.normalizedIp,
      reason,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  // Domain allowlist check
  const allowedList = options.allowedDomains ?? ALLOWED_REGISTRY_DOMAINS;
  const isAllowedDomain = allowedList.some((d) => rawHostname === d.toLowerCase());
  if (!isAllowedDomain) {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: rawHostname,
      port,
      reason: `Destination domain '${rawHostname}' is not in the allowed package registry allowlist`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  // DNS Rebinding Defense: Resolve IP once using dns.promises.lookup
  // and verify resolved IP against denylist (TOCTOU protection)
  let resolvedIp: string;
  try {
    if (options.dnsLookup) {
      const lookupRes = await options.dnsLookup(rawHostname);
      resolvedIp = typeof lookupRes === 'string' ? lookupRes : lookupRes.address;
    } else {
      const lookupRes = await dns.promises.lookup(rawHostname, { all: false });
      resolvedIp = lookupRes.address;
    }
  } catch (dnsErr: any) {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: rawHostname,
      port,
      reason: `DNS lookup failed for '${rawHostname}': ${dnsErr?.message ?? String(dnsErr)}`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  // Validate the resolved IP against private / IMDS / loopback / IPv6 ranges
  const resolvedIpCheck = isIpBlocked(resolvedIp);
  if (resolvedIpCheck.blocked) {
    const result: EgressValidationResult = {
      allowed: false,
      targetUrl: rawString,
      hostname: rawHostname,
      port,
      resolvedIp,
      reason: `DNS rebinding defense: domain '${rawHostname}' resolved to restricted IP ${resolvedIp} (${resolvedIpCheck.reason})`,
    };
    dispatchAuditLog(result, options);
    return result;
  }

  // Destination passes all security validations
  return {
    allowed: true,
    targetUrl: parsed.toString(),
    hostname: rawHostname,
    port,
    resolvedIp,
  };
}

export interface RestrictedEgressProxyOptions {
  port?: number;
  host?: string;
  allowedDomains?: readonly string[];
  dnsLookup?: (hostname: string) => Promise<{ address: string; family: number } | string>;
  onAuditLog?: SecurityAuditLogCallback;
}

/**
 * Restricted Egress HTTP & CONNECT Proxy Server
 * Enforces registry allowlisting, IMDS blocking, RFC 1918 isolation,
 * IPv6 normalization, HTTP CONNECT port 443 tunnel inspection,
 * and TOCTOU DNS rebinding defense by connecting directly to resolved IPs.
 */
export class RestrictedEgressProxy {
  private server: http.Server | null = null;
  private activeSockets = new Set<net.Socket | stream.Duplex>();
  private options: RestrictedEgressProxyOptions;
  private auditLogListeners: SecurityAuditLogCallback[] = [];

  constructor(options: RestrictedEgressProxyOptions = {}) {
    this.options = options;
    if (options.onAuditLog) {
      this.auditLogListeners.push(options.onAuditLog);
    }
  }

  onAuditLog(callback: SecurityAuditLogCallback): void {
    this.auditLogListeners.push(callback);
  }

  private dispatchAuditLog(event: EgressSecurityAuditEvent): void {
    for (const listener of this.auditLogListeners) {
      try {
        listener(event);
      } catch {
        // Safe callback execution
      }
    }
  }

  /**
   * Starts the egress proxy HTTP and CONNECT server.
   */
  async start(
    port = this.options.port ?? 0,
    host = this.options.host ?? '127.0.0.1',
  ): Promise<{ port: number; host: string }> {
    if (this.server) {
      throw new Error('Proxy server is already running');
    }

    this.server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    this.server.on('connect', (req, clientSocket, head) => {
      void this.handleConnect(req, clientSocket, head);
    });

    this.server.on('connection', (socket) => {
      this.activeSockets.add(socket);
      socket.on('close', () => this.activeSockets.delete(socket));
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, host, () => resolve());
      this.server!.once('error', reject);
    });

    const addr = this.server.address() as net.AddressInfo;
    return { port: addr.port, host: addr.address };
  }

  /**
   * Gracefully stops the proxy and destroys all active client/server sockets.
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
  }

  getPort(): number {
    if (!this.server) throw new Error('Proxy server is not running');
    const addr = this.server.address() as net.AddressInfo;
    return addr.port;
  }

  getUrl(): string {
    const port = this.getPort();
    return `http://127.0.0.1:${port}`;
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const urlStr = req.url ?? '';
    const fullUrl =
      urlStr.startsWith('http://') || urlStr.startsWith('https://')
        ? urlStr
        : `http://${req.headers.host ?? 'unknown'}${urlStr}`;

    const validation = await validateEgressDestination(fullUrl, {
      allowedDomains: this.options.allowedDomains,
      dnsLookup: this.options.dnsLookup,
      onAuditLog: (evt) => this.dispatchAuditLog(evt),
      isConnectTunnel: false,
    });

    if (!validation.allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'EGRESS_DESTINATION_BLOCKED',
          reason: validation.reason,
          destination: validation.targetUrl,
        }),
      );
      return;
    }

    // TOCTOU Protection: Connect directly to the validated resolvedIp
    const targetUrl = new URL(validation.targetUrl);
    const proxyReq = http.request(
      {
        host: validation.resolvedIp,
        port: validation.port,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: validation.hostname, // Retain original Host header
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: err.message }));
      }
    });

    req.pipe(proxyReq);
  }

  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: stream.Duplex,
    head: Buffer,
  ): Promise<void> {
    this.activeSockets.add(clientSocket);
    clientSocket.on('close', () => this.activeSockets.delete(clientSocket));

    const urlStr = req.url ?? '';
    const [, portPart] = urlStr.split(':');
    const port = portPart ? parseInt(portPart, 10) : 443;

    const validation = await validateEgressDestination(urlStr, {
      allowedDomains: this.options.allowedDomains,
      dnsLookup: this.options.dnsLookup,
      onAuditLog: (evt) => this.dispatchAuditLog(evt),
      isConnectTunnel: true,
      port,
    });

    if (!validation.allowed) {
      clientSocket.write(
        'HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nEGRESS_DESTINATION_BLOCKED: ' +
          (validation.reason ?? '') +
          '\r\n',
      );
      clientSocket.destroy();
      return;
    }

    // TOCTOU Protection: Connect directly to the validated resolvedIp on port 443
    const serverSocket = net.connect(
      {
        host: validation.resolvedIp,
        port: validation.port,
      },
      () => {
        this.activeSockets.add(serverSocket);
        serverSocket.on('close', () => this.activeSockets.delete(serverSocket));

        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          serverSocket.write(head);
        }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      },
    );

    serverSocket.on('error', () => {
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      } catch {
        // Socket may already be closed
      }
      clientSocket.destroy();
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  }
}
