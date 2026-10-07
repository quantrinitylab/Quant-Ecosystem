import { describe, it, expect } from 'vitest';
import { SelfHostConfig } from '../public-api/self-host-config.js';
import type { SelfHostConfigType } from '../public-api/self-host-config.js';

describe('SelfHostConfig', () => {
  const validConfig: SelfHostConfigType = {
    instanceName: 'My Quant Instance',
    domain: 'quant.example.com',
    adminEmail: 'admin@example.com',
    database: {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      name: 'quant_db',
      username: 'quant',
      password: 'secret',
      ssl: false,
    },
    storage: {
      type: 'local',
      path: '/data/storage',
    },
    federation: {
      enabled: true,
      domain: 'quant.example.com',
      protocols: ['activitypub', 'at-protocol'],
    },
    port: 3000,
    publicUrl: 'https://quant.example.com',
    registrationOpen: true,
  };

  it('initializes with valid config', () => {
    const config = new SelfHostConfig();
    expect(config.initialize(validConfig)).toBe(true);
  });

  it('fails to initialize with invalid config', () => {
    const config = new SelfHostConfig();
    expect(config.initialize({} as SelfHostConfigType)).toBe(false);
  });

  it('validates a correct config', () => {
    const config = new SelfHostConfig();
    const result = config.validateConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validates and reports errors for invalid config', () => {
    const config = new SelfHostConfig();
    const result = config.validateConfig({ instanceName: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('gets required services', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const services = config.getRequiredServices();
    expect(services).toContain('database');
    expect(services).toContain('storage');
    expect(services).toContain('federation');
    expect(services).toContain('activitypub');
    expect(services).toContain('at-protocol');
  });

  it('returns empty services when not initialized', () => {
    const config = new SelfHostConfig();
    expect(config.getRequiredServices()).toEqual([]);
  });

  it('gets database config', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const dbConfig = config.getDatabaseConfig();
    expect(dbConfig).not.toBeNull();
    expect(dbConfig!.type).toBe('postgres');
    expect(dbConfig!.host).toBe('localhost');
  });

  it('returns null database config when not initialized', () => {
    const config = new SelfHostConfig();
    expect(config.getDatabaseConfig()).toBeNull();
  });

  it('gets federation config', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const fedConfig = config.getFederationConfig();
    expect(fedConfig).not.toBeNull();
    expect(fedConfig!.enabled).toBe(true);
    expect(fedConfig!.protocols).toContain('activitypub');
  });

  it('gets storage config', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const storageConfig = config.getStorageConfig();
    expect(storageConfig).not.toBeNull();
    expect(storageConfig!.type).toBe('local');
  });

  it('exports config as JSON string', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const exported = config.exportConfig();
    expect(exported).not.toBeNull();

    const parsed = JSON.parse(exported!);
    expect(parsed.instanceName).toBe('My Quant Instance');
    expect(parsed.domain).toBe('quant.example.com');
  });

  it('returns null export when not initialized', () => {
    const config = new SelfHostConfig();
    expect(config.exportConfig()).toBeNull();
  });

  it('imports config from JSON string', () => {
    const config = new SelfHostConfig();
    const jsonStr = JSON.stringify(validConfig);

    expect(config.importConfig(jsonStr)).toBe(true);
    expect(config.getDatabaseConfig()).not.toBeNull();
  });

  it('fails to import invalid JSON', () => {
    const config = new SelfHostConfig();
    expect(config.importConfig('not valid json {')).toBe(false);
  });

  it('fails to import valid JSON with invalid schema', () => {
    const config = new SelfHostConfig();
    expect(config.importConfig('{"foo": "bar"}')).toBe(false);
  });

  it('round-trips export and import', () => {
    const config = new SelfHostConfig();
    config.initialize(validConfig);

    const exported = config.exportConfig()!;

    const config2 = new SelfHostConfig();
    expect(config2.importConfig(exported)).toBe(true);
    expect(config2.getDatabaseConfig()!.type).toBe('postgres');
    expect(config2.getFederationConfig()!.enabled).toBe(true);
  });
});
