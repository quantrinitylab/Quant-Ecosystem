export type QuantySessionMode = 'chat' | 'voice' | 'hybrid';
export type QuantySessionStatus = 'active' | 'paused' | 'ending' | 'ended';
export type QuantyVoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'asking' | 'confirming' | 'executing' | 'waiting' | 'verifying' | 'completed' | 'failed' | 'paused' | 'muted';

export interface QuantySession {
  sessionId: string; userId: string; tenantId?: string;
  mode: QuantySessionMode; platform: 'web' | 'android' | 'ios' | 'tauri' | 'desktop';
  activeProduct?: string; activeRoute?: string; status: QuantySessionStatus;
  startedAt: string; lastActivityAt: string; voiceState: QuantyVoiceState;
  currentTaskId?: string; contextScope: string[]; version: number;
}
