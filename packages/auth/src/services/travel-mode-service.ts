// ============================================================================
// Auth - Travel Mode Service
// ============================================================================

import type { TravelModeConfig } from '../types';

/** Request context for access checks */
export interface AccessRequestContext {
  deviceId: string;
  region?: string;
  ipAddress?: string;
}

/**
 * Travel Mode Service
 *
 * When enabled, restricts access to only trusted devices and blocks
 * sensitive operations from new locations. Useful for users traveling
 * through regions with elevated security concerns.
 */
export class TravelModeService {
  private configs: Map<string, TravelModeConfig> = new Map();

  /**
   * Enable travel mode for a user
   */
  enableTravelMode(userId: string, config: Omit<TravelModeConfig, 'enabled'>): TravelModeConfig {
    const travelConfig: TravelModeConfig = {
      enabled: true,
      restrictedRegions: config.restrictedRegions,
      allowedDeviceIds: config.allowedDeviceIds,
    };
    this.configs.set(userId, travelConfig);
    return travelConfig;
  }

  /**
   * Disable travel mode for a user
   */
  disableTravelMode(userId: string): boolean {
    const config = this.configs.get(userId);
    if (!config) return false;
    config.enabled = false;
    this.configs.set(userId, config);
    return true;
  }

  /**
   * Get travel mode status for a user
   */
  getTravelModeStatus(userId: string): TravelModeConfig | null {
    return this.configs.get(userId) ?? null;
  }

  /**
   * Check if access is allowed based on travel mode restrictions
   */
  isAccessAllowed(userId: string, requestContext: AccessRequestContext): boolean {
    const config = this.configs.get(userId);

    // No config or travel mode disabled means access is allowed
    if (!config || !config.enabled) return true;

    // Check if device is in allowed list
    if (!config.allowedDeviceIds.includes(requestContext.deviceId)) {
      return false;
    }

    // Check if region is restricted
    if (requestContext.region && config.restrictedRegions.includes(requestContext.region)) {
      return false;
    }

    return true;
  }
}
