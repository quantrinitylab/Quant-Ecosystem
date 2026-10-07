import { z } from 'zod';

export const PlatformSchema = z.enum(['ios', 'android', 'desktop']);
export type Platform = z.infer<typeof PlatformSchema>;

export interface OsCommandResult {
  success: boolean;
  output: string;
  exitCode: number;
  platform: Platform;
  timestamp: number;
}

export interface SystemInfo {
  platform: Platform;
  osVersion: string;
  deviceModel: string;
  availableMemoryMb: number;
  batteryLevel: number;
}

export class Tier2OsController {
  private readonly platform: Platform;
  private clipboard: string = '';

  constructor(platform?: Platform) {
    this.platform = platform ?? this.detectPlatform();
  }

  private detectPlatform(): Platform {
    if (typeof globalThis !== 'undefined') {
      const userAgent =
        (globalThis as Record<string, unknown>)['navigator'] !== undefined ? 'browser' : 'node';
      if (userAgent === 'node') {
        return 'desktop';
      }
    }
    return 'desktop';
  }

  getPlatform(): Platform {
    return this.platform;
  }

  async executeOsCommand(command: string): Promise<OsCommandResult> {
    // Platform bridge simulation - actual implementation would use native bridges
    const result: OsCommandResult = {
      success: true,
      output: `Executed: ${command}`,
      exitCode: 0,
      platform: this.platform,
      timestamp: Date.now(),
    };

    return result;
  }

  getSystemInfo(): SystemInfo {
    return {
      platform: this.platform,
      osVersion: this.platform === 'ios' ? '17.0' : this.platform === 'android' ? '14' : '24.04',
      deviceModel:
        this.platform === 'ios' ? 'iPhone 15' : this.platform === 'android' ? 'Pixel 8' : 'Desktop',
      availableMemoryMb: 4096,
      batteryLevel: 85,
    };
  }

  async openUrl(url: string): Promise<OsCommandResult> {
    const openCommand =
      this.platform === 'ios'
        ? `open -a Safari "${url}"`
        : this.platform === 'android'
          ? `am start -a android.intent.action.VIEW -d "${url}"`
          : `xdg-open "${url}"`;

    return this.executeOsCommand(openCommand);
  }

  async setClipboard(text: string): Promise<OsCommandResult> {
    this.clipboard = text;
    return {
      success: true,
      output: 'Clipboard updated',
      exitCode: 0,
      platform: this.platform,
      timestamp: Date.now(),
    };
  }

  getClipboard(): string {
    return this.clipboard;
  }
}
