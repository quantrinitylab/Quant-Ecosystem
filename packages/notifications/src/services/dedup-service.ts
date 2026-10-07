// ============================================================================
// Notifications - Cross-Device Deduplication Service
// Ensures each notification appears only once across all user devices
// ============================================================================

import type { DedupRecord } from '../types';

/**
 * DedupService - Cross-device notification deduplication
 *
 * Tracks notification delivery per user+device. When a notification is marked
 * delivered on one device, it is suppressed on others (still stored for
 * read-later but not pushed again).
 */
export class DedupService {
  private records: Map<string, DedupRecord> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Check if a notification should be delivered to a specific device.
   * Returns true if it should be delivered (not yet delivered to any device).
   * Returns false if it was already delivered to another device.
   */
  public shouldDeliver(notificationId: string, userId: string, _deviceId: string): boolean {
    const key = this.getKey(notificationId, userId);
    const record = this.records.get(key);

    if (!record) {
      return true;
    }

    // Already delivered to this or another device
    return false;
  }

  /**
   * Mark a notification as delivered to a specific device.
   * Subsequent calls to shouldDeliver for the same notification+user
   * but different devices will return false.
   */
  public markDelivered(notificationId: string, userId: string, deviceId: string): void {
    const key = this.getKey(notificationId, userId);
    const existing = this.records.get(key);

    if (existing) {
      if (!existing.deliveredToDevices.includes(deviceId)) {
        existing.deliveredToDevices.push(deviceId);
      }
    } else {
      this.records.set(key, {
        notificationId,
        userId,
        deliveredToDevices: [deviceId],
        firstDeliveredAt: Date.now(),
      });
    }
  }

  /**
   * Check if a notification has been delivered to any device for a user
   */
  public isDelivered(notificationId: string, userId: string): boolean {
    const key = this.getKey(notificationId, userId);
    return this.records.has(key);
  }

  /**
   * Get the delivery record for a notification
   */
  public getRecord(notificationId: string, userId: string): DedupRecord | undefined {
    const key = this.getKey(notificationId, userId);
    return this.records.get(key);
  }

  /**
   * Clean up expired dedup records
   */
  public cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.records) {
      if (now - record.firstDeliveredAt > this.ttlMs) {
        this.records.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get the total number of tracked records
   */
  public getRecordCount(): number {
    return this.records.size;
  }

  /**
   * Clear all records (for testing)
   */
  public clear(): void {
    this.records.clear();
  }

  // ---- Private Methods ----

  private getKey(notificationId: string, userId: string): string {
    return `${userId}:${notificationId}`;
  }
}
