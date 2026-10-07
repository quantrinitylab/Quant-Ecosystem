// Quantads - Biometric Authentication Service
// Mobile biometric authentication for advertising platform

export interface BiometricCapabilities {
  fingerprint: boolean;
  faceId: boolean;
  iris: boolean;
  deviceCredential: boolean;
}

export interface BiometricConfig {
  allowDeviceCredentialFallback: boolean;
  invalidateOnNewEnrollment: boolean;
  confirmationRequired: boolean;
  title: string;
  subtitle: string;
  negativeButtonText: string;
}

export interface BiometricResult {
  success: boolean;
  method: 'fingerprint' | 'face_id' | 'iris' | 'device_credential' | 'none';
  timestamp: number;
  error?: BiometricError;
}

export interface BiometricError {
  code: BiometricErrorCode;
  message: string;
  recoverable: boolean;
}

export type BiometricErrorCode =
  | 'not_available'
  | 'not_enrolled'
  | 'lockout'
  | 'lockout_permanent'
  | 'user_cancelled'
  | 'system_cancelled'
  | 'hw_unavailable'
  | 'timeout';

export interface BiometricKeyEntry {
  keyId: string;
  createdAt: number;
  lastUsed: number;
  biometricBound: boolean;
  purpose: string;
}

export interface SessionInfo {
  sessionId: string;
  expiresAt: number;
  biometricVerified: boolean;
  lastExtension: number;
}

export class BiometricAuthService {
  private capabilities: BiometricCapabilities | null = null;
  private keyStore: Map<string, BiometricKeyEntry> = new Map();
  private currentSession: SessionInfo | null = null;
  private failedAttempts: number = 0;
  private lockoutUntil: number = 0;
  private maxAttempts: number = 5;

  public async checkAvailability(): Promise<BiometricCapabilities> {
    const capabilities: BiometricCapabilities = {
      fingerprint: await this.checkSensor('fingerprint'),
      faceId: await this.checkSensor('face_id'),
      iris: await this.checkSensor('iris'),
      deviceCredential: await this.checkDeviceCredential(),
    };
    this.capabilities = capabilities;
    return capabilities;
  }

  private async checkSensor(type: string): Promise<boolean> {
    return type === 'fingerprint' || type === 'face_id';
  }

  private async checkDeviceCredential(): Promise<boolean> {
    return true;
  }

  public async authenticate(config?: Partial<BiometricConfig>): Promise<BiometricResult> {
    if (this.isLockedOut()) {
      return {
        success: false,
        method: 'none',
        timestamp: Date.now(),
        error: {
          code: 'lockout',
          message: 'Too many failed attempts. Try again later.',
          recoverable: true,
        },
      };
    }

    const fullConfig: BiometricConfig = {
      allowDeviceCredentialFallback: true,
      invalidateOnNewEnrollment: false,
      confirmationRequired: true,
      title: 'Verify Identity',
      subtitle: 'Authenticate to access advertising platform',
      negativeButtonText: 'Cancel',
      ...config,
    };

    const result = await this.performBiometricPrompt(fullConfig);
    if (!result.success) {
      this.failedAttempts++;
      if (this.failedAttempts >= this.maxAttempts) {
        this.lockoutUntil = Date.now() + 30000;
      }
    } else {
      this.failedAttempts = 0;
    }
    return result;
  }

  private async performBiometricPrompt(_config: BiometricConfig): Promise<BiometricResult> {
    if (!this.capabilities) await this.checkAvailability();
    const method = this.capabilities?.faceId
      ? 'face_id'
      : this.capabilities?.fingerprint
        ? 'fingerprint'
        : 'device_credential';
    return { success: true, method, timestamp: Date.now() };
  }

  private isLockedOut(): boolean {
    return Date.now() < this.lockoutUntil;
  }

  public async enrollBiometric(userId: string): Promise<BiometricResult> {
    const capabilities = await this.checkAvailability();
    if (!capabilities.fingerprint && !capabilities.faceId) {
      return {
        success: false,
        method: 'none',
        timestamp: Date.now(),
        error: {
          code: 'not_available',
          message: 'No biometric sensor available',
          recoverable: false,
        },
      };
    }
    const keyId = `bio_key_${userId}_${Date.now()}`;
    this.keyStore.set(keyId, {
      keyId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      biometricBound: true,
      purpose: 'authentication',
    });
    return {
      success: true,
      method: capabilities.faceId ? 'face_id' : 'fingerprint',
      timestamp: Date.now(),
    };
  }

  public async protectSensitiveAction(action: string): Promise<BiometricResult> {
    const sensitiveActions = [
      'approve_budget',
      'launch_campaign',
      'delete_account',
      'change_password',
      'export_data',
    ];
    if (!sensitiveActions.includes(action)) {
      return { success: true, method: 'none', timestamp: Date.now() };
    }
    return this.authenticate({
      title: 'Confirm Action',
      subtitle: `Verify to ${action.replace(/_/g, ' ')}`,
      confirmationRequired: true,
    });
  }

  public async sessionExtend(): Promise<SessionInfo | null> {
    if (!this.currentSession) return null;
    const result = await this.authenticate({
      title: 'Extend Session',
      subtitle: 'Verify to stay logged in',
      confirmationRequired: false,
    });
    if (result.success) {
      this.currentSession.expiresAt = Date.now() + 3600000;
      this.currentSession.lastExtension = Date.now();
      this.currentSession.biometricVerified = true;
      return this.currentSession;
    }
    return null;
  }

  public createSession(sessionId: string, durationMs: number): SessionInfo {
    this.currentSession = {
      sessionId,
      expiresAt: Date.now() + durationMs,
      biometricVerified: false,
      lastExtension: Date.now(),
    };
    return this.currentSession;
  }

  public isSessionValid(): boolean {
    return this.currentSession !== null && Date.now() < this.currentSession.expiresAt;
  }

  public addToKeyStore(keyId: string, purpose: string): BiometricKeyEntry {
    const entry: BiometricKeyEntry = {
      keyId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      biometricBound: true,
      purpose,
    };
    this.keyStore.set(keyId, entry);
    return entry;
  }

  public removeFromKeyStore(keyId: string): boolean {
    return this.keyStore.delete(keyId);
  }

  public getKeyStoreEntries(): BiometricKeyEntry[] {
    return Array.from(this.keyStore.values());
  }

  public getFailedAttempts(): number {
    return this.failedAttempts;
  }

  public resetFailedAttempts(): void {
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
  }
}
