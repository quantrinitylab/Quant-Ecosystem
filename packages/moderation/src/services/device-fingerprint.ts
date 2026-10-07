// ============================================================================
// Moderation - Device Fingerprint Service
// Sybil detection via stable device identification from browser signals
// ============================================================================

import * as crypto from 'crypto';

import type { DeviceSignals, DeviceFingerprint, SybilCheckResult } from '../types';

interface DeviceFingerprintConfig {
  sybilThreshold: number; // max accounts per device before flagging
}

const DEFAULT_CONFIG: DeviceFingerprintConfig = {
  sybilThreshold: 3,
};

/**
 * DeviceFingerprintService - Stable device identification for sybil detection
 *
 * Accepts raw browser signals (userAgent, screen resolution, timezone, etc.)
 * and hashes them into a stable device ID. No IP storage for privacy.
 * Detects sybil attacks where the same device is used by multiple accounts.
 */
export class DeviceFingerprintService {
  private config: DeviceFingerprintConfig;
  private deviceToUsers: Map<string, Set<string>> = new Map();
  private userToDevices: Map<string, Set<string>> = new Map();

  constructor(config: Partial<DeviceFingerprintConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Compute a stable fingerprint from device signals */
  computeFingerprint(signals: DeviceSignals): DeviceFingerprint {
    const deviceId = this.hashSignals(signals);
    return {
      deviceId,
      signals,
      createdAt: Date.now(),
    };
  }

  /** Register a device-user association */
  registerDevice(deviceId: string, userId: string): void {
    if (!this.deviceToUsers.has(deviceId)) {
      this.deviceToUsers.set(deviceId, new Set());
    }
    this.deviceToUsers.get(deviceId)!.add(userId);

    if (!this.userToDevices.has(userId)) {
      this.userToDevices.set(userId, new Set());
    }
    this.userToDevices.get(userId)!.add(deviceId);
  }

  /** Check if a device is associated with sybil behavior */
  checkSybil(deviceId: string, userId: string): SybilCheckResult {
    // Register this association
    this.registerDevice(deviceId, userId);

    const associatedUsers = this.deviceToUsers.get(deviceId) || new Set();
    const linkedAccounts = Array.from(associatedUsers).filter((id) => id !== userId);

    const isSybil = linkedAccounts.length >= this.config.sybilThreshold;
    const confidence = Math.min(1, linkedAccounts.length / (this.config.sybilThreshold * 2));

    return {
      isSybil,
      confidence,
      linkedAccounts,
    };
  }

  /** Get all device IDs associated with a user */
  getDevicesForUser(userId: string): string[] {
    return Array.from(this.userToDevices.get(userId) || new Set());
  }

  /** Get all user IDs associated with a device */
  getUsersForDevice(deviceId: string): string[] {
    return Array.from(this.deviceToUsers.get(deviceId) || new Set());
  }

  // --- Private methods ---

  private hashSignals(signals: DeviceSignals): string {
    const components = [
      signals.userAgent,
      signals.screenResolution,
      signals.timezone,
      signals.language,
      signals.canvasHash || '',
      signals.webglHash || '',
      signals.installedFontsHash || '',
    ];

    const combined = components.join('|');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }
}
