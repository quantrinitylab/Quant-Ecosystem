import { z } from 'zod';
import type { AIPersonality, AISetupPreferences } from './types.js';

const aiSetupSchema = z.object({
  personality: z.enum(['professional', 'friendly', 'concise', 'creative', 'technical']),
  memoryEnabled: z.boolean(),
  contextSources: z.array(z.string()),
  autoSuggest: z.boolean(),
});

interface PersonalityOption {
  personality: AIPersonality;
  name: string;
  description: string;
}

const personalityOptions: PersonalityOption[] = [
  {
    personality: 'professional',
    name: 'Professional',
    description: 'Formal, precise communication focused on accuracy and clarity',
  },
  {
    personality: 'friendly',
    name: 'Friendly',
    description: 'Warm and approachable with conversational language',
  },
  {
    personality: 'concise',
    name: 'Concise',
    description: 'Brief, to-the-point responses that minimize verbosity',
  },
  {
    personality: 'creative',
    name: 'Creative',
    description: 'Imaginative and expressive with novel suggestions',
  },
  {
    personality: 'technical',
    name: 'Technical',
    description: 'Detailed technical language suited for developers and engineers',
  },
];

const defaultPreferences: AISetupPreferences = {
  personality: 'professional',
  memoryEnabled: true,
  contextSources: ['documents', 'emails', 'calendar'],
  autoSuggest: true,
};

export function createAISetup(prefs?: Partial<AISetupPreferences>): AISetupPreferences {
  return {
    ...defaultPreferences,
    ...prefs,
  };
}

export function getPersonalityOptions(): PersonalityOption[] {
  return personalityOptions;
}

export function validateAISetup(
  config: unknown,
): { success: true; data: AISetupPreferences } | { success: false; errors: z.ZodError } {
  const result = aiSetupSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
