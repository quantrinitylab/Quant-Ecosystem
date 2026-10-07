import { z } from 'zod';
import type { NotificationPreferences } from './types.js';

const notificationSchema = z.object({
  channels: z.array(z.enum(['email', 'push', 'in-app', 'sms'])).min(1),
  frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']),
  categories: z.record(z.string(), z.boolean()),
});

interface NotificationCategory {
  key: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

const defaultCategories: NotificationCategory[] = [
  {
    key: 'messages',
    name: 'Messages',
    description: 'Direct messages and chat notifications',
    defaultEnabled: true,
  },
  {
    key: 'mentions',
    name: 'Mentions',
    description: 'When someone mentions you in a conversation or document',
    defaultEnabled: true,
  },
  {
    key: 'updates',
    name: 'Updates',
    description: 'Updates to documents, tasks, and projects you follow',
    defaultEnabled: true,
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Product announcements, tips, and promotional content',
    defaultEnabled: false,
  },
  {
    key: 'security',
    name: 'Security',
    description: 'Login alerts, password changes, and security notifications',
    defaultEnabled: true,
  },
];

const defaultPreferences: NotificationPreferences = {
  channels: ['email', 'push', 'in-app'],
  frequency: 'realtime',
  categories: Object.fromEntries(defaultCategories.map((c) => [c.key, c.defaultEnabled])),
};

export function createNotificationSetup(
  prefs?: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    ...defaultPreferences,
    ...prefs,
    categories: {
      ...defaultPreferences.categories,
      ...prefs?.categories,
    },
  };
}

export function getDefaultNotificationCategories(): NotificationCategory[] {
  return defaultCategories;
}

export function validateNotificationSetup(
  config: unknown,
): { success: true; data: NotificationPreferences } | { success: false; errors: z.ZodError } {
  const result = notificationSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
