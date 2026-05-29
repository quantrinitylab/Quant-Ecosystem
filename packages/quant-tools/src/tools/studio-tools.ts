import type { ToolDefinition } from '../types.js';

export const studioTools: ToolDefinition[] = [
  {
    id: 'quant-studio.create-app',
    appId: 'quant-studio',
    name: 'Create App',
    description: 'Create a new application project in Quant Studio',
    inputSchema: {
      name: { type: 'string', required: true, description: 'Application name' },
      template: {
        type: 'string',
        required: false,
        description: 'Template to use (blank, web, mobile)',
        default: 'blank',
      },
      framework: {
        type: 'string',
        required: false,
        description: 'Framework (react, vue, native)',
        default: 'react',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'App creation result',
      fields: {
        appId: { type: 'string', description: 'Application ID' },
        projectUrl: { type: 'string', description: 'Project editor URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['studio', 'create', 'app'],
  },
  {
    id: 'quant-studio.publish',
    appId: 'quant-studio',
    name: 'Publish App',
    description: 'Publish an application to the Quant app store',
    inputSchema: {
      appId: { type: 'string', required: true, description: 'Application ID to publish' },
      version: { type: 'string', required: true, description: 'Version number' },
      changelog: { type: 'string', required: false, description: 'Release notes' },
    },
    outputSchema: {
      type: 'object',
      description: 'Publish result',
      fields: {
        success: { type: 'boolean', description: 'Whether publish succeeded' },
        publishedVersion: { type: 'string', description: 'Published version' },
        storeUrl: { type: 'string', description: 'App store URL' },
      },
    },
    permissionTier: 2,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['studio', 'publish', 'release'],
  },
  {
    id: 'quant-studio.test',
    appId: 'quant-studio',
    name: 'Run Tests',
    description: 'Run test suite for an application',
    inputSchema: {
      appId: { type: 'string', required: true, description: 'Application ID' },
      testSuite: {
        type: 'string',
        required: false,
        description: 'Test suite to run (unit, integration, e2e)',
        default: 'unit',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Test results',
      fields: {
        passed: { type: 'number', description: 'Tests passed' },
        failed: { type: 'number', description: 'Tests failed' },
        coverage: { type: 'number', description: 'Code coverage percentage' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['studio', 'test', 'quality'],
  },
  {
    id: 'quant-studio.deploy',
    appId: 'quant-studio',
    name: 'Deploy App',
    description: 'Deploy an application to a target environment',
    inputSchema: {
      appId: { type: 'string', required: true, description: 'Application ID to deploy' },
      environment: {
        type: 'string',
        required: true,
        description: 'Target environment (staging, production)',
      },
      strategy: {
        type: 'string',
        required: false,
        description: 'Deploy strategy (rolling, blue-green, canary)',
        default: 'rolling',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Deploy result',
      fields: {
        deploymentId: { type: 'string', description: 'Deployment ID' },
        url: { type: 'string', description: 'Deployed application URL' },
        status: { type: 'string', description: 'Deployment status' },
      },
    },
    permissionTier: 3,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['studio', 'deploy', 'infrastructure'],
  },
  {
    id: 'quant-studio.monitor',
    appId: 'quant-studio',
    name: 'Monitor App',
    description: 'Get monitoring metrics for a deployed application',
    inputSchema: {
      appId: { type: 'string', required: true, description: 'Application ID' },
      metrics: {
        type: 'array',
        required: false,
        description: 'Metrics to fetch (cpu, memory, requests, errors)',
        default: [],
      },
      period: {
        type: 'string',
        required: false,
        description: 'Time period (1h, 6h, 24h, 7d)',
        default: '1h',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Monitoring data',
      fields: {
        uptime: { type: 'number', description: 'Uptime percentage' },
        requestsPerSecond: { type: 'number', description: 'Current RPS' },
        errorRate: { type: 'number', description: 'Error rate percentage' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['studio', 'monitor', 'metrics'],
  },
];
