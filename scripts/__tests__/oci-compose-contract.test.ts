import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Contract for compose/quant-stack.yml, the stack that runs on the Oracle VM.
// Plain text on purpose: the root workspace has no YAML parser and this file
// has a simple, flat shape. The checks below are the operational rules that
// were learned the hard way (full disks, forgotten restart policies, services
// accidentally published to the internet).

const composePath = resolve(__dirname, '../../compose/quant-stack.yml');
const text = readFileSync(composePath, 'utf8').replace(/\r\n/g, '\n');

const afterServices = text.split(/^services:\s*$/m)[1] ?? '';
const servicesBlock = afterServices.split(/^volumes:\s*$/m)[0] ?? '';

type Service = { name: string; body: string };

function parseServices(block: string): Service[] {
  const found: Service[] = [];
  const header = /^ {2}([a-z0-9][a-z0-9-]*):\s*$/gm;
  const matches = [...block.matchAll(header)];
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? block.length) : block.length;
    found.push({ name: m[1], body: block.slice(start, end) });
  });
  return found;
}

const services = parseServices(servicesBlock);

describe('compose/quant-stack.yml contract', () => {
  it('declares the six app services, the proxy and redis', () => {
    expect(services.map((s) => s.name).sort()).toEqual(
      [
        'quant-proxy',
        'quant-redis',
        'quantai',
        'quantai-backend',
        'quantchat',
        'quantchat-backend',
        'quantmail-backend',
        'quantmail-frontend',
      ].sort(),
    );
  });

  it('defines one shared log rotation anchor with a size and a file limit', () => {
    const anchor = text.match(/^x-logging:\s*&default-logging\n((?: {2}.*\n)+)/m);
    expect(anchor, 'x-logging anchor is missing').not.toBeNull();
    const body = anchor?.[1] ?? '';
    expect(body).toMatch(/driver:\s*json-file/);
    expect(body).toMatch(/max-size:\s*"?\d+[kmg]"?/i);
    expect(body).toMatch(/max-file:\s*"?\d+"?/);
  });

  it.each(services.map((s) => [s.name, s.body] as const))(
    '%s restarts on failure and rotates its logs',
    (_name, body) => {
      expect(body).toMatch(/^ {4}restart:\s*unless-stopped\s*$/m);
      expect(body).toMatch(/^ {4}logging:\s*\*default-logging\s*$/m);
    },
  );

  it.each(services.filter((s) => /ghcr\.io/.test(s.body)).map((s) => [s.name, s.body] as const))(
    '%s pins its image through IMAGE_TAG so a deploy can roll back',
    (_name, body) => {
      expect(body).toMatch(/image:\s*ghcr\.io\/quantrinitylab\/quant-oci-[a-z-]+:\$\{IMAGE_TAG:-latest\}/);
    },
  );

  it('publishes ports only on the reverse proxy, and only 80 and 443', () => {
    const publishers = services.filter((s) => /^ {4}ports:\s*$/m.test(s.body));
    expect(publishers.map((s) => s.name)).toEqual(['quant-proxy']);
    const proxy = publishers[0]?.body ?? '';
    const published = [...proxy.matchAll(/^ {6}- "(\d+):(\d+)"\s*$/gm)].map((m) => m[1]);
    expect(published.sort()).toEqual(['443', '80']);
  });

  it('keeps secrets on the VM: services read /etc/quant/secrets.env and nothing else', () => {
    const withEnvFile = services.filter((s) => /^ {4}env_file:\s*$/m.test(s.body));
    expect(withEnvFile.length).toBeGreaterThan(0);
    for (const s of withEnvFile) {
      expect(s.body, s.name).toMatch(/^ {6}- \/etc\/quant\/secrets\.env\s*$/m);
    }
    // No credential-looking literal may live in the compose file itself.
    expect(text).not.toMatch(/(SECRET|PASSWORD|TOKEN|ACCESS_KEY)[A-Z_]*\s*[:=]\s*["']?[A-Za-z0-9+/_-]{12,}/);
  });
});
