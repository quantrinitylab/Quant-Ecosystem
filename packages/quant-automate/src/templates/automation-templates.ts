import type { AutomationTemplate } from '../types.js';

export const dailyReelTemplate: AutomationTemplate = {
  id: 'daily-reel',
  name: 'Daily Reel Post',
  description: 'Post a reel to Neon every day at 9:00 AM',
  triggers: [
    {
      type: 'schedule',
      config: { type: 'schedule', cron: '0 9 * * *' },
      enabled: true,
    },
  ],
  actions: [
    {
      toolId: 'neon.post',
      params: { type: 'reel', visibility: 'public' },
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
      timeoutMs: 30000,
      order: 1,
    },
  ],
  category: 'social',
};

export const weeklyBackupTemplate: AutomationTemplate = {
  id: 'weekly-backup',
  name: 'Weekly File Backup',
  description: 'Sync important files to drive every Monday at midnight',
  triggers: [
    {
      type: 'schedule',
      config: { type: 'schedule', cron: '0 0 * * 1' },
      enabled: true,
    },
  ],
  actions: [
    {
      toolId: 'drive.sync-files',
      params: { source: 'documents', destination: 'backup', recursive: true },
      retryPolicy: { maxRetries: 5, backoffMs: 2000, backoffMultiplier: 2 },
      timeoutMs: 120000,
      order: 1,
    },
  ],
  category: 'productivity',
};

export const notificationRoutingTemplate: AutomationTemplate = {
  id: 'notification-routing',
  name: 'Notification Routing',
  description: 'Forward important emails to team chat',
  triggers: [
    {
      type: 'event',
      config: { type: 'event', eventName: 'quantmail.received', appId: 'quantmail' },
      enabled: true,
    },
  ],
  actions: [
    {
      toolId: 'quantchat.send',
      params: { channel: 'notifications', format: 'summary' },
      retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
      timeoutMs: 10000,
      order: 1,
    },
  ],
  category: 'communication',
};

export const emailForwardTemplate: AutomationTemplate = {
  id: 'email-forward',
  name: 'Email Forwarding',
  description: 'Forward emails matching filter to another recipient',
  triggers: [
    {
      type: 'event',
      config: {
        type: 'event',
        eventName: 'quantmail.received',
        appId: 'quantmail',
        filter: { from: '@boss.com', subject_contains: 'urgent' },
      },
      enabled: true,
    },
  ],
  actions: [
    {
      toolId: 'quantmail.send',
      params: { to: 'team@company.com', prefix: '[FWD]' },
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
      timeoutMs: 15000,
      order: 1,
    },
  ],
  category: 'communication',
};

export const meetingPrepTemplate: AutomationTemplate = {
  id: 'meeting-prep',
  name: 'Daily Meeting Prep',
  description: 'Create meeting prep doc and check calendar every weekday morning',
  triggers: [
    {
      type: 'schedule',
      config: { type: 'schedule', cron: '0 8 * * 1-5' },
      enabled: true,
    },
  ],
  actions: [
    {
      toolId: 'quantcalendar.list-today',
      params: { includeDetails: true },
      retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
      timeoutMs: 10000,
      order: 1,
    },
    {
      toolId: 'quantdocs.create',
      params: { template: 'meeting-prep', title: 'Daily Prep' },
      retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
      timeoutMs: 15000,
      order: 2,
    },
  ],
  category: 'productivity',
};

export const builtinAutomationTemplates: AutomationTemplate[] = [
  dailyReelTemplate,
  weeklyBackupTemplate,
  notificationRoutingTemplate,
  emailForwardTemplate,
  meetingPrepTemplate,
];
