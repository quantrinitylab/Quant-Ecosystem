// ============================================================================
// Notifications - Push Service
// Real Firebase Admin SDK (FCM) and APNs HTTP/2 integration
// ============================================================================

import * as admin from 'firebase-admin';
import { ApnsProvider, ApnsNotificationBuilder } from './apns-client';
import type { ApnsProviderOptions } from './apns-client';
import { z } from 'zod';

/**
 * Zod schema for push notification payload validation
 */
export const PushPayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.string()).optional(),
  imageUrl: z.string().url().optional(),
  badge: z.number().int().nonnegative().optional(),
  sound: z.string().optional(),
  /**
   * Optional per-send APNs topic (the target app's bundle id). Lets a single
   * PushService serving multiple apps route each iOS notification to the correct
   * bundle id; falls back to the instance's configured `apnTopic` when omitted.
   */
  topic: z.string().min(1).optional(),
});

export type PushPayload = z.infer<typeof PushPayloadSchema>;

/** Supported push notification platforms */
export type PushPlatform = 'android' | 'ios' | 'web';

/** Result of a push notification send attempt */
export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Configuration for initializing the PushService */
export interface PushServiceConfig {
  firebaseCredential: admin.ServiceAccount;
  apnOptions?: ApnsProviderOptions;
  apnTopic?: string; // iOS bundle identifier
}

/**
 * PushService - Cross-platform push notification delivery
 *
 * Routes notifications to Firebase Cloud Messaging for Android/Web
 * and Apple Push Notification service for iOS. Provides graceful
 * error handling - returns PushResult with success:false rather than throwing.
 */
export class PushService {
  private fcmApp: admin.app.App | null = null;
  private apnProvider: ApnsProvider | null = null;
  private apnTopic: string = 'com.quant.app';

  /**
   * Initialize the push service with Firebase and APNs credentials
   * @param config - Service account and APNs configuration
   */
  initialize(config: PushServiceConfig): void {
    this.fcmApp = admin.initializeApp({
      credential: admin.credential.cert(config.firebaseCredential),
    });

    if (config.apnOptions) {
      this.apnProvider = new ApnsProvider(config.apnOptions);
    }

    if (config.apnTopic) {
      this.apnTopic = config.apnTopic;
    }
  }

  /**
   * Send a push notification to a single device
   * Routes to FCM for android/web, APNs for ios
   * @param token - Device push token
   * @param platform - Target platform
   * @param payload - Notification payload
   * @returns Push result (never throws)
   */
  async sendPush(token: string, platform: PushPlatform, payload: PushPayload): Promise<PushResult> {
    try {
      const validated = PushPayloadSchema.parse(payload);

      if (platform === 'ios') {
        return await this.sendApns(token, validated);
      }

      return await this.sendFcm(token, platform, validated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Send push notifications to multiple devices, routing each by platform:
   * iOS tokens go to APNs, android/web tokens go to FCM (batched via
   * `sendEachForMulticast`). Results are returned in the SAME order as the input
   * `targets`. Previously this was FCM-only, so iOS/APNs tokens were sent to FCM
   * (meaningless) and silently failed.
   *
   * @param targets - Device tokens paired with their platform
   * @param payload - Notification payload
   * @returns Array of push results, one per target (input order preserved)
   */
  async sendMulticast(
    targets: Array<{ token: string; platform: PushPlatform }>,
    payload: PushPayload,
  ): Promise<PushResult[]> {
    try {
      const validated = PushPayloadSchema.parse(payload);
      const results: PushResult[] = new Array<PushResult>(targets.length);

      // Partition into FCM (android/web) and APNs (ios), remembering positions.
      const fcmIndices: number[] = [];
      const fcmTokens: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        if (targets[i]!.platform === 'ios') continue;
        fcmIndices.push(i);
        fcmTokens.push(targets[i]!.token);
      }

      // FCM batch for android/web.
      if (fcmTokens.length > 0) {
        if (!this.fcmApp) {
          for (const i of fcmIndices) results[i] = { success: false, error: 'FCM not initialized' };
        } else {
          const message: admin.messaging.MulticastMessage = {
            tokens: fcmTokens,
            notification: {
              title: validated.title,
              body: validated.body,
              imageUrl: validated.imageUrl,
            },
            data: validated.data,
          };
          const response = await this.fcmApp.messaging().sendEachForMulticast(message);
          response.responses.forEach((resp, j) => {
            const idx = fcmIndices[j]!;
            results[idx] = resp.success
              ? { success: true, messageId: resp.messageId }
              : { success: false, error: resp.error?.message ?? 'Send failed' };
          });
        }
      }

      // APNs per-token for ios (no APNs multicast API; send individually).
      for (let i = 0; i < targets.length; i++) {
        if (targets[i]!.platform === 'ios') {
          results[i] = await this.sendApns(targets[i]!.token, validated);
        }
      }

      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return targets.map(() => ({ success: false, error: message }));
    }
  }

  /**
   * Gracefully shut down the push service, releasing resources
   */
  async shutdown(): Promise<void> {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
      this.apnProvider = null;
    }

    if (this.fcmApp) {
      await this.fcmApp.delete();
      this.fcmApp = null;
    }
  }

  // ---- Private Methods ----

  private async sendFcm(
    token: string,
    platform: PushPlatform,
    payload: PushPayload,
  ): Promise<PushResult> {
    if (!this.fcmApp) {
      return { success: false, error: 'FCM not initialized' };
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: payload.data,
    };

    if (platform === 'android') {
      message.android = {
        notification: {
          sound: payload.sound ?? 'default',
        },
      };
    } else {
      message.webpush = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
      };
    }

    const messageId = await this.fcmApp.messaging().send(message);
    return { success: true, messageId };
  }

  private async sendApns(token: string, payload: PushPayload): Promise<PushResult> {
    if (!this.apnProvider) {
      return { success: false, error: 'APNs provider not initialized' };
    }

    const notification = new ApnsNotificationBuilder();
    notification.alert = {
      title: payload.title,
      body: payload.body,
    };
    if (payload.badge !== undefined) {
      notification.badge = payload.badge;
    }
    notification.sound = payload.sound ?? 'default';
    // Per-send topic (target app bundle id) wins over the instance default, so a
    // shared PushService can deliver to the correct app per notification.
    notification.topic = payload.topic ?? this.apnTopic;

    if (payload.data) {
      notification.payload = payload.data;
    }

    const result = await this.apnProvider.send(notification, token);

    if (result.failed.length > 0) {
      const failure = result.failed[0];
      const errorResponse = failure?.response;
      return {
        success: false,
        error: errorResponse?.reason ?? 'APNs delivery failed',
      };
    }

    return { success: true, messageId: `apns_${token.substring(0, 8)}` };
  }
}

// Re-export with the old name for backward compatibility
export { PushService as PushNotificationService };
