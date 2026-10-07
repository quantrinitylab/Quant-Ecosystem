import type { DemoModeConfig, OnboardingRole, SampleDataSet } from './types.js';

const DEFAULT_EXPIRY_HOURS = 72;

export function createDemoMode(config?: Partial<DemoModeConfig>): DemoModeConfig {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);

  return {
    enabled: config?.enabled ?? true,
    sampleDataSets: config?.sampleDataSets ?? [],
    expiresAt: config?.expiresAt ?? expiresAt,
  };
}

function generateEmailSamples(): SampleDataSet {
  return {
    name: 'emails',
    description: 'Sample email conversations and threads',
    items: [
      { subject: 'Welcome to Quant', from: 'team@quant.app', read: false },
      { subject: 'Project Update', from: 'alice@example.com', read: true },
      { subject: 'Meeting Notes', from: 'bob@example.com', read: true },
    ],
  };
}

function generateDocSamples(): SampleDataSet {
  return {
    name: 'docs',
    description: 'Sample documents and notes',
    items: [
      { title: 'Getting Started Guide', type: 'document', pages: 3 },
      { title: 'Meeting Notes Template', type: 'template', pages: 1 },
      { title: 'Project Plan', type: 'spreadsheet', pages: 2 },
    ],
  };
}

function generateChatSamples(): SampleDataSet {
  return {
    name: 'chats',
    description: 'Sample chat conversations',
    items: [
      { channel: 'general', messages: 15, participants: 5 },
      { channel: 'engineering', messages: 8, participants: 3 },
      { channel: 'design', messages: 12, participants: 4 },
    ],
  };
}

function generateFileSamples(): SampleDataSet {
  return {
    name: 'files',
    description: 'Sample files and folders',
    items: [
      { name: 'presentation.pdf', size: 2048, type: 'pdf' },
      { name: 'budget.xlsx', size: 512, type: 'spreadsheet' },
      { name: 'logo.png', size: 1024, type: 'image' },
    ],
  };
}

function generateMeetingSamples(): SampleDataSet {
  return {
    name: 'meetings',
    description: 'Sample calendar events and meetings',
    items: [
      { title: 'Team Standup', duration: 15, recurring: true },
      { title: 'Sprint Planning', duration: 60, recurring: true },
      { title: 'Design Review', duration: 30, recurring: false },
    ],
  };
}

function generateTaskSamples(): SampleDataSet {
  return {
    name: 'tasks',
    description: 'Sample tasks and projects',
    items: [
      { title: 'Review pull request', priority: 'high', status: 'in-progress' },
      { title: 'Update documentation', priority: 'medium', status: 'pending' },
      { title: 'Fix login bug', priority: 'critical', status: 'completed' },
    ],
  };
}

const roleSampleGenerators: Record<OnboardingRole, () => SampleDataSet[]> = {
  personal: () => [
    generateEmailSamples(),
    generateDocSamples(),
    generateFileSamples(),
    generateTaskSamples(),
  ],
  'team-admin': () => [
    generateEmailSamples(),
    generateChatSamples(),
    generateDocSamples(),
    generateMeetingSamples(),
    generateTaskSamples(),
  ],
  creator: () => [generateDocSamples(), generateFileSamples(), generateTaskSamples()],
  advertiser: () => [generateEmailSamples(), generateDocSamples(), generateTaskSamples()],
  developer: () => [
    generateDocSamples(),
    generateFileSamples(),
    generateTaskSamples(),
    generateChatSamples(),
  ],
};

export function generateSampleData(role: OnboardingRole): SampleDataSet[] {
  return roleSampleGenerators[role]();
}

export function getSampleDataSets(): SampleDataSet[] {
  return [
    generateEmailSamples(),
    generateDocSamples(),
    generateChatSamples(),
    generateFileSamples(),
    generateMeetingSamples(),
    generateTaskSamples(),
  ];
}
