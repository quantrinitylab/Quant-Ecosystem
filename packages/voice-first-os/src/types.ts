// prettier-ignore
export interface VoiceFirstConfig { enabled: boolean; lockScreenActive: boolean; ambientContext: AmbientContext | null }
// prettier-ignore
export interface AmbientContext { type: 'walking' | 'driving' | 'home' | 'meeting'; confidence: number }
// prettier-ignore
export interface NotificationAction { id: string; action: 'read' | 'dismiss' | 'reply' | 'snooze'; payload: string }
// prettier-ignore
export interface ElderModeConfig { enabled: boolean; fontSize: 'large' | 'xlarge'; emergencyContact: string; familyRemoteEnabled: boolean }
// prettier-ignore
export interface VoiceCommand { id: string; phrase: string; category: string; handler: string }
