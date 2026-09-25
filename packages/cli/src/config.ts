import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface QuantConfig {
  apiUrl: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  defaultWorkspace?: string;
}

export const CONFIG_DIR = path.join(os.homedir(), '.quant');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Returns the default API URL from environment or production endpoint.
 */
export function getDefaultApiUrl(): string {
  return process.env.QUANT_API_URL || 'https://quantmail.in';
}

/**
 * Loads the Quant configuration from ~/.quant/config.json.
 * If missing or corrupted, returns the default configuration.
 */
export function loadConfig(): QuantConfig {
  const defaultApiUrl = getDefaultApiUrl();
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {
        apiUrl: defaultApiUrl,
      };
    }

    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    return {
      apiUrl: parsed.apiUrl || defaultApiUrl,
      token: parsed.token || undefined,
      user: parsed.user || undefined,
      defaultWorkspace: parsed.defaultWorkspace || undefined,
    };
  } catch {
    return {
      apiUrl: defaultApiUrl,
    };
  }
}

/**
 * Saves or updates partial configuration into ~/.quant/config.json.
 */
export function saveConfig(config: Partial<QuantConfig>): void {
  const current = loadConfig();
  const merged: QuantConfig = {
    ...current,
    ...config,
    apiUrl: config.apiUrl || current.apiUrl || getDefaultApiUrl(),
  };

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Clears saved authentication credentials from ~/.quant/config.json.
 */
export function clearConfig(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  } catch {
    try {
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ apiUrl: getDefaultApiUrl() }, null, 2),
        'utf-8',
      );
    } catch {
      // Ignore fallback write error
    }
  }
}

/**
 * Retrieves the active API token from environment variable or saved config.
 */
export function getToken(): string | undefined {
  if (process.env.QUANT_TOKEN) {
    return process.env.QUANT_TOKEN;
  }
  const config = loadConfig();
  return config.token;
}

/**
 * Retrieves the active API endpoint URL from environment variable or saved config.
 */
export function getApiUrl(): string {
  if (process.env.QUANT_API_URL) {
    return process.env.QUANT_API_URL;
  }
  const config = loadConfig();
  return config.apiUrl || getDefaultApiUrl();
}
