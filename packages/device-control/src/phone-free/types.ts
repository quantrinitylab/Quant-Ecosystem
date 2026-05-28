export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface PhoneFreeConfig {
  timeout: number;
  emergencyContacts: EmergencyContact[];
  panicPhrase: string;
}

export interface PhoneFreeState {
  enabled: boolean;
  activatedAt: number | null;
  config: PhoneFreeConfig;
  sessionId: string | null;
}

export interface PhoneFreeSession {
  id: string;
  startTime: number;
  endTime: number | null;
  endReason: string | null;
}

export interface UIVisibility {
  visibleElements: string[];
  hiddenElements: string[];
  voiceAccessible: string[];
}

export interface BiometricAuthProvider {
  authenticate(): Promise<boolean>;
}
