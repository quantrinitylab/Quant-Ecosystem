// Live session state machine
export type LiveSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'ended';

// VAD configuration
export interface VADConfig {
  threshold: number;
  silenceDuration: number;
  minSpeechDuration: number;
}

// Session configuration
export interface LiveSessionConfig {
  asrProvider: string;
  vadConfig: VADConfig;
  enableInterruption: boolean;
  maxSessionDuration: number;
  language: string;
}

// Transcript segment
export interface TranscriptSegment {
  id: string;
  speaker: 'user' | 'assistant';
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isFinal: boolean;
}

// Live session
export interface LiveSession {
  id: string;
  state: LiveSessionState;
  createdAt: number;
  config: LiveSessionConfig;
  transcript: TranscriptSegment[];
}

// Audio chunk for streaming
export interface AudioChunk {
  data: Float32Array;
  sampleRate: number;
  channels: number;
  timestamp: number;
  duration: number;
}

// ASR result
export interface ASRResult {
  segments: TranscriptSegment[];
  isFinal: boolean;
  latencyMs: number;
}

// ASR provider interface
export interface ASRProvider {
  start(): void;
  stop(): void;
  feedAudio(chunk: AudioChunk): void;
  onResult(cb: (result: ASRResult) => void): void;
  onError(cb: (error: Error) => void): void;
}

// VAD event types
export interface VADEvent {
  type: 'speech-start' | 'speech-end' | 'silence';
  timestamp: number;
  confidence: number;
}

// Turn state
export interface TurnState {
  currentSpeaker: 'user' | 'assistant' | 'none';
  canInterrupt: boolean;
  turnStartedAt: number | null;
}

// Pipeline stages
export type PipelineStage = 'asr' | 'llm' | 'tts' | 'playback' | 'grounding';

// Latency metrics per stage
export interface LatencyMetrics {
  stage: PipelineStage;
  p50: number;
  p95: number;
  p99: number;
  samples: number;
  lastValue: number;
}

// TTS options
export interface TTSOptions {
  voice?: string;
  speed?: number;
  language?: string;
  format?: 'pcm' | 'mp3' | 'opus';
}

// TTS event types
export interface TTSEvent {
  type: 'start' | 'chunk' | 'end' | 'error';
  timestamp: number;
  data?: unknown;
}

// TTS provider interface
export interface TTSProvider {
  readonly isStreaming: boolean;
  synthesize(text: string, options?: TTSOptions): AsyncIterable<AudioChunk>;
  stop(): void;
}

// Adaptive VAD configuration
export interface AdaptiveVADConfig extends VADConfig {
  calibrationDurationMs: number;
  adaptiveThreshold: number;
  noiseFloorSmoothing: number;
}

// LLM tool definition (local to quant-live)
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
}

// LLM stream chunk
export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  toolCall?: { id: string; name: string; args: Record<string, unknown> };
  toolResult?: { id: string; result: unknown };
}

// Live conversation context
export interface LiveConversationContext {
  sessionId: string;
  transcript: TranscriptSegment[];
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

// Live LLM provider interface
export interface LiveLLMProvider {
  streamResponse(context: LiveConversationContext): AsyncIterable<LLMStreamChunk>;
  abort(): void;
}

// Capture frame from camera or screen
export interface CaptureFrame {
  data: string; // base64-encoded image
  timestamp: number;
  source: 'camera' | 'screen';
}

// Camera configuration
export interface CameraConfig {
  fps?: number;
  resolution?: { width: number; height: number };
}

// Screen capture configuration
export interface ScreenCaptureConfig {
  fps?: number;
  captureType?: 'screen' | 'window' | 'tab';
}

// Grounding request
export interface GroundingRequest {
  frames: CaptureFrame[];
  query: string;
  context?: LiveConversationContext;
  mode: 'identify' | 'assist' | 'retrieve';
}

// Grounding result
export interface GroundingResult {
  text: string;
  sources: ContextSource[];
  confidence: number;
}

// Context source from cross-app search
export interface ContextSource {
  app: string;
  type: string;
  snippet: string;
  timestamp: number;
}
