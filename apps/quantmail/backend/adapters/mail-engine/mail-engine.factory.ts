import type { IMailEngineAdapter } from './mail-engine.interface';
import { SesMailEngineAdapter, type SesEngineAdapterOptions } from './ses-engine.adapter';
import { StalwartMailEngineAdapter, type StalwartEngineAdapterOptions } from './stalwart-engine.adapter';
import { SmtpRelayMailEngineAdapter, type SmtpRelayAdapterOptions } from './smtp-relay.adapter';

export type MailEngineAdapterType = 'stalwart' | 'smtp_relay' | 'ses';

let cachedAdapter: IMailEngineAdapter | null = null;

/**
 * Returns a singleton instance of the configured mail engine adapter.
 * Selects adapter via MAIL_ENGINE_ADAPTER ('stalwart' | 'smtp_relay' | 'ses'),
 * defaulting to 'ses' so existing environments and test suites run uninterrupted.
 */
export function getMailEngineAdapter(
  type?: string,
  options?: Record<string, unknown>,
): IMailEngineAdapter {
  const resolvedType = (
    type ??
    process.env['MAIL_ENGINE_ADAPTER'] ??
    'ses'
  ).toLowerCase() as MailEngineAdapterType;

  if (cachedAdapter && !type && !options && cachedAdapter.name === resolvedType) {
    return cachedAdapter;
  }

  const adapter = createMailEngineAdapter(resolvedType, options);
  if (!type && !options) {
    cachedAdapter = adapter;
  }
  return adapter;
}

/**
 * Factory function to create a new mail engine adapter instance by type.
 */
export function createMailEngineAdapter(
  type: string,
  options?: Record<string, unknown>,
): IMailEngineAdapter {
  const normalized = type.toLowerCase();
  switch (normalized) {
    case 'stalwart':
      return new StalwartMailEngineAdapter(options as StalwartEngineAdapterOptions);
    case 'smtp_relay':
    case 'smtp':
      return new SmtpRelayMailEngineAdapter(options as SmtpRelayAdapterOptions);
    case 'ses':
    default:
      return new SesMailEngineAdapter(options as SesEngineAdapterOptions);
  }
}

/**
 * Reset the cached singleton (useful in test suites).
 */
export function resetMailEngineAdapterCache(): void {
  cachedAdapter = null;
}
