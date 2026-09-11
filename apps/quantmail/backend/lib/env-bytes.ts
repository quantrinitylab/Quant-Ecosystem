export function byteEnv(name: string, defaultBytes: number, maxBytes?: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultBytes;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.warn(`[quantmail] Ignoring invalid ${name}; using ${defaultBytes} bytes`);
    return defaultBytes;
  }
  if (maxBytes !== undefined && parsed > maxBytes) {
    console.warn(`[quantmail] Clamping ${name} from ${parsed} to ${maxBytes} bytes`);
    return maxBytes;
  }
  return parsed;
}
