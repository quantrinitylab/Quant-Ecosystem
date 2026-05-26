// ============================================================================
// Notifications - Push Service
// Real Firebase Admin SDK (FCM) and @parse/node-apn (APNs) integration
// ============================================================================

import * as admin from 'firebase-admin';
import apn from '@parse/node-apn';
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
  apnOptions?: apn.ProviderOptions;
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
  private apnProvider: apn.Provider | null = null;
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
      this.apnProvider = new apn.Provider(config.apnOptions);
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
   * Send push notifications to multiple devices via FCM multicast
   * @param tokens - Array of device tokens
   * @param payload - Notification payload
   * @returns Array of push results, one per token
   */
  async sendMulticast(tokens: string[], payload: PushPayload): Promise<PushResult[]> {
    try {
      const validated = PushPayloadSchema.parse(payload);

      if (!this.fcmApp) {
        return tokens.map(() => ({ success: false, error: 'FCM not initialized' }));
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: validated.title,
          body: validated.body,
          imageUrl: validated.imageUrl,
        },
        data: validated.data,
      };

      const response = await this.fcmApp.messaging().sendEachForMulticast(message);

      return response.responses.map((resp) => {
        if (resp.success) {
          return { success: true, messageId: resp.messageId };
        }
        return { success: false, error: resp.error?.message ?? 'Send failed' };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return tokens.map(() => ({ success: false, error: message }));
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

    const notification = new apn.Notification();
    notification.alert = {
      title: payload.title,
      body: payload.body,
    };
    if (payload.badge !== undefined) {
      notification.badge = payload.badge;
    }
    notification.sound = payload.sound ?? 'default';
    notification.topic = this.apnTopic;

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
