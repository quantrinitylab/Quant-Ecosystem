export interface ChatMessage {
  id: string;
  participantId: string;
  displayName: string;
  content: string;
  timestamp: Date;
}

export interface TranscriptEntry {
  id: string;
  participantId: string;
  displayName: string;
  text: string;
  timestamp: Date;
  confidence: number;
}

export interface VideoTileProps {
  participantId: string;
  stream: MediaStream | null;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking: boolean;
  isPinned: boolean;
  isScreenShare: boolean;
}

export interface ParticipantGridProps {
  participants: VideoTileProps[];
  layout: 'grid' | 'speaker' | 'sidebar';
  activeSpeakerId: string | null;
  pinnedParticipantId: string | null;
}

export interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  recordingActive: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleRecording: () => void;
  onLeave: () => void;
  onOpenChat: () => void;
  onOpenTranscript: () => void;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  participantId: string;
}

export interface TranscriptPanelProps {
  segments: TranscriptEntry[];
  isLive: boolean;
  onExport: () => void;
}

export interface BackgroundBlurConfig {
  enabled: boolean;
  mode: 'blur' | 'replace';
  blurIntensity: number;
  replacementImageUrl: string | null;
}
