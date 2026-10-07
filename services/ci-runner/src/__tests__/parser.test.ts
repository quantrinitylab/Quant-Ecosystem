import { describe, it, expect } from 'vitest';
import { CIConfigParser } from '../parser.js';

describe('CIConfigParser', () => {
  let parser: CIConfigParser;

  beforeEach(() => {
    parser = new CIConfigParser();
  });

  describe('parseConfig', () => {
    it('parses a valid CI config YAML', () => {
      const yaml = `
version: "1"
stages:
  - build
  - test
  - deploy
variables:
  NODE_ENV: production
jobs:
  install:
    name: install
    stage: build
    script:
      - npm ci
  lint:
    name: lint
    stage: test
    script:
      - npm run lint
  deploy:
    name: deploy
    stage: deploy
    script:
      - npm run deploy
`;
      const config = parser.parseConfig(yaml);

      expect(config.version).toBe('1');
      expect(config.stages).toEqual(['build', 'test', 'deploy']);
      expect(config.variables).toEqual({ NODE_ENV: 'production' });
      expect(Object.keys(config.jobs)).toHaveLength(3);
      expect(config.jobs['install']!.script).toEqual(['npm ci']);
    });

    it('applies default values for optional fields', () => {
      const yaml = `
jobs:
  test:
    name: test
    script:
      - npm test
`;
      const config = parser.parseConfig(yaml);

      expect(config.version).toBe('1');
      expect(config.stages).toEqual(['build', 'test', 'deploy']);
      expect(config.jobs['test']!.image).toBe('node:22');
      expect(config.jobs['test']!.stage).toBe('default');
      expect(config.jobs['test']!.timeout).toBe('30m');
      expect(config.jobs['test']!.allowFailure).toBe(false);
    });

    it('parses jobs with artifacts configuration', () => {
      const yaml = `
jobs:
  build:
    name: build
    stage: build
    script:
      - npm run build
    artifacts:
      paths:
        - dist/
        - coverage/
      expireIn: 7d
`;
      const config = parser.parseConfig(yaml);
      const buildJob = config.jobs['build']!;

      expect(buildJob.artifacts).toBeDefined();
      expect(buildJob.artifacts!.paths).toEqual(['dist/', 'coverage/']);
      expect(buildJob.artifacts!.expireIn).toBe('7d');
    });

    it('parses jobs with dependencies and environment', () => {
      const yaml = `
jobs:
  deploy:
    name: deploy
    stage: deploy
    script:
      - npm run deploy
    dependencies:
      - build
    environment:
      AWS_REGION: us-east-1
`;
      const config = parser.parseConfig(yaml);
      const deployJob = config.jobs['deploy']!;

      expect(deployJob.dependencies).toEqual(['build']);
      expect(deployJob.environment).toEqual({ AWS_REGION: 'us-east-1' });
    });

    it('throws on invalid YAML structure', () => {
      expect(() => parser.parseConfig('not: valid: yaml: [')).toThrow();
    });

    it('throws on missing required fields', () => {
      const yaml = `
jobs:
  test:
    name: test
`;
      expect(() => parser.parseConfig(yaml)).toThrow();
    });
  });

  describe('getJobsForStage', () => {
    it('returns jobs filtered by stage', () => {
      const yaml = `
jobs:
  lint:
    name: lint
    stage: test
    script:
      - npm run lint
  unit:
    name: unit
    stage: test
    script:
      - npm test
  build:
    name: build
    stage: build
    script:
      - npm run build
`;
      const config = parser.parseConfig(yaml);
      const testJobs = parser.getJobsForStage(config, 'test');

      expect(testJobs).toHaveLength(2);
      expect(testJobs.map((j) => j.name)).toContain('lint');
      expect(testJobs.map((j) => j.name)).toContain('unit');
    });

    it('returns empty array for non-existent stage', () => {
      const yaml = `
jobs:
  test:
    name: test
    stage: test
    script:
      - npm test
`;
      const config = parser.parseConfig(yaml);
      const jobs = parser.getJobsForStage(config, 'deploy');

      expect(jobs).toHaveLength(0);
    });
  });

  describe('getExecutionOrder', () => {
    it('returns jobs grouped by stage in order', () => {
      const yaml = `
stages:
  - build
  - test
  - deploy
jobs:
  install:
    name: install
    stage: build
    script:
      - npm ci
  lint:
    name: lint
    stage: test
    script:
      - npm run lint
  unit:
    name: unit
    stage: test
    script:
      - npm test
  release:
    name: release
    stage: deploy
    script:
      - npm run deploy
`;
      const config = parser.parseConfig(yaml);
      const order = parser.getExecutionOrder(config);

      expect(order).toHaveLength(3);
      expect(order[0]).toEqual(['install']);
      expect(order[1]).toEqual(expect.arrayContaining(['lint', 'unit']));
      expect(order[2]).toEqual(['release']);
    });

    it('includes default stage jobs at the end', () => {
      const yaml = `
stages:
  - build
jobs:
  compile:
    name: compile
    stage: build
    script:
      - npm run build
  misc:
    name: misc
    script:
      - echo hello
`;
      const config = parser.parseConfig(yaml);
      const order = parser.getExecutionOrder(config);

      expect(order).toHaveLength(2);
      expect(order[0]).toEqual(['compile']);
      expect(order[1]).toEqual(['misc']);
    });
  });
});
