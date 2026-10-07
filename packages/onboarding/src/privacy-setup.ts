import { z } from 'zod';
import type { PrivacyLevel, PrivacyPreferences } from './types.js';

const privacySchema = z.object({
  level: z.enum(['strict', 'balanced', 'open']),
  dataSharing: z.boolean(),
  aiDataAccess: z.boolean(),
  profileVisibility: z.enum(['public', 'private', 'contacts-only']),
  activityVisibility: z.enum(['public', 'private', 'contacts-only']),
});

interface PrivacyPreset {
  level: PrivacyLevel;
  name: string;
  description: string;
  defaults: PrivacyPreferences;
}

const privacyPresets: PrivacyPreset[] = [
  {
    level: 'strict',
    name: 'Strict Privacy',
    description: 'Maximum privacy: no data sharing, no AI access, fully private profile',
    defaults: {
      level: 'strict',
      dataSharing: false,
      aiDataAccess: false,
      profileVisibility: 'private',
      activityVisibility: 'private',
    },
  },
  {
    level: 'balanced',
    name: 'Balanced',
    description:
      'Moderate privacy: limited sharing, AI access for personal features, contacts-only visibility',
    defaults: {
      level: 'balanced',
      dataSharing: false,
      aiDataAccess: true,
      profileVisibility: 'contacts-only',
      activityVisibility: 'contacts-only',
    },
  },
  {
    level: 'open',
    name: 'Open',
    description: 'Maximum discoverability: sharing enabled, full AI access, public profile',
    defaults: {
      level: 'open',
      dataSharing: true,
      aiDataAccess: true,
      profileVisibility: 'public',
      activityVisibility: 'public',
    },
  },
];

export function createPrivacySetup(level?: PrivacyLevel): PrivacyPreferences {
  const targetLevel = level ?? 'balanced';
  const preset = privacyPresets.find((p) => p.level === targetLevel);
  return preset?.defaults ?? privacyPresets[1]!.defaults;
}

export function getPrivacyPresets(): PrivacyPreset[] {
  return privacyPresets;
}

export function validatePrivacySetup(
  config: unknown,
): { success: true; data: PrivacyPreferences } | { success: false; errors: z.ZodError } {
  const result = privacySchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
