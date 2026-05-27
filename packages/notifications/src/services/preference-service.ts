// ============================================================================
// Notifications - Preference Service
// Per-user, per-app, per-event-type notification preferences
// ============================================================================

import type {
  NotificationPreferences,
  NotificationType,
  DeliveryChannel,
  NotificationPriority,
  ChannelPreferences,
  TypePreference,
  QuietHoursConfig,
} from '../types';

/** Default channel preferences */
const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  push: { enabled: true, sound: true, badge: true, vibrate: true },
  in_app: { enabled: true, popup: true, sound: false },
  email: { enabled: true, frequency: 'daily' },
  sms: { enabled: false, criticalOnly: true },
  webhook: { enabled: false },
};

/** Default quiet hours */
const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '08:00',
  timezone: 'UTC',
  allowCritical: true,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * PreferenceService - User notification preference management
 *
 * Manages per-user, per-type, and per-channel notification preferences.
 * Supports quiet hours, muting, and channel routing based on event type.
 * Determines whether a notification should be delivered and through which channels.
 */
export class PreferenceService {
  private preferences: Map<string, NotificationPreferences>;
  private appDefaults: Map<string, Partial<NotificationPreferences>>;
  private muteTimers: Map<string, { userId: string; type: NotificationType; until: number }>;

  constructor() {
    this.preferences = new Map();
    this.appDefaults = new Map();
    this.muteTimers = new Map();
  }

  /**
   * Get preferences for a user (creates defaults if none exist)
   */
  public getPreferences(userId: string): NotificationPreferences {
    let prefs = this.preferences.get(userId);
    if (!prefs) {
      prefs = this.createDefaultPreferences(userId);
      this.preferences.set(userId, prefs);
    }
    return prefs;
  }

  /**
   * Update user preferences
   */
  public updatePreferences(
    userId: string,
    updates: {
      globalEnabled?: boolean;
      channels?: Partial<ChannelPreferences>;
      typePreferences?: Array<{ type: NotificationType; preference: Partial<TypePreference> }>;
      quietHours?: Partial<QuietHoursConfig>;
    },
  ): NotificationPreferences {
    const prefs = this.getPreferences(userId);
    const now = Date.now();

    if (updates.globalEnabled !== undefined) {
      prefs.globalEnabled = updates.globalEnabled;
    }

    if (updates.channels) {
      if (updates.channels.push) {
        prefs.channels.push = { ...prefs.channels.push, ...updates.channels.push };
      }
      if (updates.channels.in_app) {
        prefs.channels.in_app = { ...prefs.channels.in_app, ...updates.channels.in_app };
      }
      if (updates.channels.email) {
        prefs.channels.email = { ...prefs.channels.email, ...updates.channels.email };
      }
      if (updates.channels.sms) {
        prefs.channels.sms = { ...prefs.channels.sms, ...updates.channels.sms };
      }
      if (updates.channels.webhook) {
        prefs.channels.webhook = { ...prefs.channels.webhook, ...updates.channels.webhook };
      }
    }

    if (updates.typePreferences) {
      for (const { type, preference } of updates.typePreferences) {
        const existing = prefs.typePreferences.get(type) || this.getDefaultTypePreference();
        prefs.typePreferences.set(type, { ...existing, ...preference });
      }
    }

    if (updates.quietHours) {
      prefs.quietHours = { ...prefs.quietHours, ...updates.quietHours };
    }

    prefs.updatedAt = now;
    return prefs;
  }

  /**
   * Get which channels should be used for a specific event type
   */
  public getChannelsForEvent(
    userId: string,
    eventType: NotificationType,
    priority: NotificationPriority,
  ): DeliveryChannel[] {
    const prefs = this.getPreferences(userId);

    if (!prefs.globalEnabled) return [];

    // Check quiet hours
    if (this.isInQuietHours(prefs.quietHours)) {
      if (priority !== 'critical' || !prefs.quietHours.allowCritical) {
        return [];
      }
      // During quiet hours, only push for critical
      return ['push'];
    }

    // Check type-specific preferences
    const typePref = prefs.typePreferences.get(eventType);
    if (typePref) {
      if (!typePref.enabled) return [];
      if (typePref.muted && typePref.muteUntil && typePref.muteUntil > Date.now()) return [];
      if (typePref.channels.length > 0) {
        return typePref.channels.filter((ch) => this.isChannelEnabled(prefs, ch));
      }
    }

    // Fall back to default channels based on priority
    const channels: DeliveryChannel[] = [];

    if (prefs.channels.in_app.enabled) channels.push('in_app');

    if (priority === 'critical' || priority === 'high') {
      if (prefs.channels.push.enabled) channels.push('push');
      if (priority === 'critical' && prefs.channels.sms.enabled) channels.push('sms');
    }

    if (prefs.channels.push.enabled && priority !== 'low') {
      if (!channels.includes('push')) channels.push('push');
    }

    if (prefs.channels.email.enabled && prefs.channels.email.frequency === 'realtime') {
      channels.push('email');
    }

    return channels;
  }

  /**
   * Determine if a notification should be delivered
   */
  public shouldNotify(
    userId: string,
    eventType: NotificationType,
    priority: NotificationPriority,
  ): boolean {
    const prefs = this.getPreferences(userId);

    // Global kill switch
    if (!prefs.globalEnabled) return false;

    // Check quiet hours (allow critical)
    if (this.isInQuietHours(prefs.quietHours)) {
      if (priority !== 'critical' || !prefs.quietHours.allowCritical) {
        return false;
      }
    }

    // Check type-specific preferences
    const typePref = prefs.typePreferences.get(eventType);
    if (typePref) {
      if (!typePref.enabled) return false;
      if (typePref.muted) {
        if (!typePref.muteUntil || typePref.muteUntil > Date.now()) {
          return false;
        }
        // Mute expired, unmute
        typePref.muted = false;
        typePref.muteUntil = undefined;
      }
    }

    // Check if any channel is available
    const channels = this.getChannelsForEvent(userId, eventType, priority);
    return channels.length > 0;
  }

  /**
   * Set quiet hours for a user
   */
  public setQuietHours(userId: string, config: Partial<QuietHoursConfig>): QuietHoursConfig {
    const prefs = this.getPreferences(userId);
    prefs.quietHours = { ...prefs.quietHours, ...config };
    prefs.updatedAt = Date.now();
    return prefs.quietHours;
  }

  /**
   * Mute a notification type temporarily
   */
  public muteType(userId: string, type: NotificationType, durationMs: number): void {
    const prefs = this.getPreferences(userId);
    const until = Date.now() + durationMs;

    let typePref = prefs.typePreferences.get(type);
    if (!typePref) {
      typePref = this.getDefaultTypePreference();
      prefs.typePreferences.set(type, typePref);
    }

    typePref.muted = true;
    typePref.muteUntil = until;

    this.muteTimers.set(`${userId}_${type}`, { userId, type, until });
  }

  /**
   * Unmute a notification type
   */
  public unmuteType(userId: string, type: NotificationType): void {
    const prefs = this.getPreferences(userId);
    const typePref = prefs.typePreferences.get(type);
    if (typePref) {
      typePref.muted = false;
      typePref.muteUntil = undefined;
    }
    this.muteTimers.delete(`${userId}_${type}`);
  }

  /**
   * Get default preferences template
   */
  public getDefaults(): {
    channels: ChannelPreferences;
    quietHours: QuietHoursConfig;
    typePreference: TypePreference;
  } {
    return {
      channels: { ...DEFAULT_CHANNEL_PREFERENCES },
      quietHours: { ...DEFAULT_QUIET_HOURS },
      typePreference: this.getDefaultTypePreference(),
    };
  }

  /**
   * Set app-level default preferences
   */
  public setAppDefaults(appId: string, defaults: Partial<NotificationPreferences>): void {
    this.appDefaults.set(appId, defaults);
  }

  /**
   * Reset user preferences to defaults
   */
  public resetPreferences(userId: string): NotificationPreferences {
    const defaults = this.createDefaultPreferences(userId);
    this.preferences.set(userId, defaults);
    return defaults;
  }

  /**
   * Delete user preferences
   */
  public deletePreferences(userId: string): boolean {
    return this.preferences.delete(userId);
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    totalUsers: number;
    usersWithQuietHours: number;
    mutedTypes: number;
    disabledUsers: number;
  } {
    let usersWithQuietHours = 0;
    let disabledUsers = 0;

    for (const [, prefs] of this.preferences) {
      if (prefs.quietHours.enabled) usersWithQuietHours++;
      if (!prefs.globalEnabled) disabledUsers++;
    }

    return {
      totalUsers: this.preferences.size,
      usersWithQuietHours,
      mutedTypes: this.muteTimers.size,
      disabledUsers,
    };
  }

  /**
   * Process expired mutes
   */
  public processExpiredMutes(): number {
    const now = Date.now();
    let processed = 0;

    for (const [key, mute] of this.muteTimers) {
      if (mute.until <= now) {
        this.unmuteType(mute.userId, mute.type);
        this.muteTimers.delete(key);
        processed++;
      }
    }

    return processed;
  }

  // ---- Private Methods ----

  private createDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      globalEnabled: true,
      channels: { ...DEFAULT_CHANNEL_PREFERENCES },
      typePreferences: new Map(),
      quietHours: { ...DEFAULT_QUIET_HOURS },
      digest: {
        id: `digest_${userId}`,
        userId,
        frequency: 'daily',
        enabledTypes: ['message', 'mention', 'comment', 'system'],
        preferredTime: '09:00',
        timezone: 'UTC',
        isActive: true,
      },
      updatedAt: Date.now(),
    };
  }

  private getDefaultTypePreference(): TypePreference {
    return {
      enabled: true,
      channels: [],
      priority: 'normal',
      muted: false,
    };
  }

  private isChannelEnabled(prefs: NotificationPreferences, channel: DeliveryChannel): boolean {
    switch (channel) {
      case 'push':
        return prefs.channels.push.enabled;
      case 'in_app':
        return prefs.channels.in_app.enabled;
      case 'email':
        return prefs.channels.email.enabled;
      case 'sms':
        return prefs.channels.sms.enabled;
      case 'webhook':
        return prefs.channels.webhook.enabled;
      default:
        return false;
    }
  }

  private isInQuietHours(config: QuietHoursConfig): boolean {
    if (!config.enabled) return false;

    const now = new Date();
    const currentDay = now.getDay();

    // Check if current day is in quiet hours days
    if (!config.daysOfWeek.includes(currentDay)) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = config.startTime.split(':').map(Number);
    const [endH, endM] = config.endTime.split(':').map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}
