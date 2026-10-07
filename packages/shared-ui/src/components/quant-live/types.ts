// ============================================================================
// QuantLive - Component Types
// ============================================================================

export type QuantLiveState = 'idle' | 'active' | 'minimized';

export type OrbColorState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type QuantLivePosition = 'bottom-right' | 'bottom-center' | 'fullscreen';

export interface CaptionEntry {
  id: string;
  speaker: 'user' | 'assistant';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface ActionChipInfo {
  label: string;
  icon?: string;
  toolName?: string;
}

export interface PrivacyState {
  micActive: boolean;
  cameraActive: boolean;
  screenSharing: boolean;
}

export interface QuantLiveProps {
  onActivate?: () => void;
  onDeactivate?: () => void;
  className?: string;
  position?: QuantLivePosition;
  captions?: CaptionEntry[];
  currentAction?: ActionChipInfo | null;
  orbColorState?: OrbColorState;
}

export interface QuantLiveOrbProps {
  colorState: OrbColorState;
  onClick?: () => void;
  size?: 'sm' | 'lg';
  disabled?: boolean;
  className?: string;
}

export interface QuantLiveCaptionsProps {
  captions: CaptionEntry[];
  maxVisible?: number;
  className?: string;
}

export interface QuantLiveActionChipProps {
  action: ActionChipInfo | null;
  className?: string;
}

export interface QuantLivePrivacyIndicatorProps {
  micActive: boolean;
  cameraActive: boolean;
  screenSharing: boolean;
  className?: string;
}

export interface QuantLiveControlsProps {
  micMuted: boolean;
  cameraActive: boolean;
  screenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera?: () => void;
  onToggleScreen?: () => void;
  onEndSession: () => void;
  onToggleMinimize?: () => void;
  isMinimized?: boolean;
  className?: string;
}
