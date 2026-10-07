import { z } from 'zod';
import type { ImportDataType, ImportFlowConfig, ImportSource } from './types.js';

const importConfigSchema = z.object({
  source: z.enum(['google', 'microsoft', 'apple', 'github', 'csv', 'custom']),
  dataTypes: z.array(z.enum(['email', 'calendar', 'contacts', 'files', 'repos'])).min(1),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed']),
});

interface ImportSourceCapabilities {
  source: ImportSource;
  name: string;
  supportedDataTypes: ImportDataType[];
  requiresOAuth: boolean;
}

const importSourceCapabilities: ImportSourceCapabilities[] = [
  {
    source: 'google',
    name: 'Google',
    supportedDataTypes: ['email', 'calendar', 'contacts', 'files'],
    requiresOAuth: true,
  },
  {
    source: 'microsoft',
    name: 'Microsoft',
    supportedDataTypes: ['email', 'calendar', 'contacts', 'files'],
    requiresOAuth: true,
  },
  {
    source: 'apple',
    name: 'Apple',
    supportedDataTypes: ['email', 'calendar', 'contacts'],
    requiresOAuth: true,
  },
  {
    source: 'github',
    name: 'GitHub',
    supportedDataTypes: ['repos', 'files'],
    requiresOAuth: true,
  },
  {
    source: 'csv',
    name: 'CSV Import',
    supportedDataTypes: ['contacts', 'files'],
    requiresOAuth: false,
  },
  {
    source: 'custom',
    name: 'Custom Source',
    supportedDataTypes: ['email', 'calendar', 'contacts', 'files', 'repos'],
    requiresOAuth: false,
  },
];

export function createImportFlow(
  source: ImportSource,
  dataTypes: ImportDataType[],
): ImportFlowConfig {
  return {
    source,
    dataTypes,
    status: 'pending',
  };
}

export function getAvailableImportSources(): ImportSourceCapabilities[] {
  return importSourceCapabilities;
}

export function validateImportConfig(
  config: unknown,
): { success: true; data: ImportFlowConfig } | { success: false; errors: z.ZodError } {
  const result = importConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as ImportFlowConfig };
  }
  return { success: false, errors: result.error };
}
