// ============================================================================
// QuantAI - Voice Service
// Voice recognition, TTS, wake word detection, command parsing
// ============================================================================

interface VoiceConfig {
  voiceId: string;
  speed: number;
  pitch: number;
  wakeWordEnabled: boolean;
  wakeWord: string;
  language: string;
  hotkey: string;
}

interface TranscriptionResult {
  id: string;
  text: string;
  confidence: number;
  language: string;
  duration: number;
  words: Array<{ word: string; start: number; end: number; confidence: number }>;
}

interface TTSResult {
  id: string;
  audioUrl: string;
  duration: number;
  voiceId: string;
  text: string;
}

interface VoiceCommand {
  id: string;
  text: string;
  intent: string;
  entities: Record<string, string>;
  confidence: number;
  action?: string;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  language: string;
  sampleUrl: string;
}

const AVAILABLE_VOICES: VoiceOption[] = [
  { id: 'nova', name: 'Nova', gender: 'female', accent: 'American', language: 'en-US', sampleUrl: '/voices/nova-sample.wav' },
  { id: 'atlas', name: 'Atlas', gender: 'male', accent: 'American', language: 'en-US', sampleUrl: '/voices/atlas-sample.wav' },
  { id: 'aria', name: 'Aria', gender: 'female', accent: 'British', language: 'en-GB', sampleUrl: '/voices/aria-sample.wav' },
  { id: 'onyx', name: 'Onyx', gender: 'male', accent: 'British', language: 'en-GB', sampleUrl: '/voices/onyx-sample.wav' },
  { id: 'shimmer', name: 'Shimmer', gender: 'neutral', accent: 'American', language: 'en-US', sampleUrl: '/voices/shimmer-sample.wav' },
  { id: 'echo', name: 'Echo', gender: 'neutral', accent: 'Australian', language: 'en-AU', sampleUrl: '/voices/echo-sample.wav' },
];

export class VoiceService {
  private configs: Map<string, VoiceConfig> = new Map();
  private commandHistory: Map<string, VoiceCommand[]> = new Map();

  async getConfig(userId: string): Promise<VoiceConfig> {
    if (!this.configs.has(userId)) {
      this.configs.set(userId, {
        voiceId: 'nova',
        speed: 1.0,
        pitch: 1.0,
        wakeWordEnabled: true,
        wakeWord: 'Hey QuantAI',
        language: 'en-US',
        hotkey: 'Ctrl+Shift+V',
      });
    }
    return this.configs.get(userId)!;
  }

  async updateConfig(userId: string, updates: Partial<VoiceConfig>): Promise<VoiceConfig> {
    const current = await this.getConfig(userId);
    const updated = { ...current, ...updates };
    this.configs.set(userId, updated);
    return updated;
  }

  async transcribe(audioData: Buffer, language: string = 'en-US'): Promise<TranscriptionResult> {
    const mockText = 'Hello, what is the weather like today?';
    const words = mockText.split(' ').map((word, i) => ({
      word,
      start: i * 0.3,
      end: (i + 1) * 0.3,
      confidence: 0.95 + Math.random() * 0.05,
    }));

    return {
      id: `trans-${Date.now()}`,
      text: mockText,
      confidence: 0.97,
      language,
      duration: words.length * 0.3,
      words,
    };
  }

  async synthesize(text: string, userId: string): Promise<TTSResult> {
    const config = await this.getConfig(userId);
    const wordsPerSecond = 2.5 * config.speed;
    const wordCount = text.split(' ').length;
    const duration = wordCount / wordsPerSecond;

    return {
      id: `tts-${Date.now()}`,
      audioUrl: `/api/voice/audio/${Date.now()}.wav`,
      duration,
      voiceId: config.voiceId,
      text,
    };
  }

  async parseCommand(text: string): Promise<VoiceCommand> {
    const lower = text.toLowerCase();
    let intent = 'general';
    const entities: Record<string, string> = {};
    let action: string | undefined;

    if (lower.includes('turn on') || lower.includes('turn off')) {
      intent = 'device_control';
      action = lower.includes('turn on') ? 'on' : 'off';
      const deviceMatch = lower.match(/turn (?:on|off) (?:the )?(.+)/);
      if (deviceMatch) entities.device = deviceMatch[1];
    } else if (lower.includes('set') && (lower.includes('timer') || lower.includes('alarm'))) {
      intent = 'timer';
      const timeMatch = lower.match(/(\d+)\s*(minutes?|hours?|seconds?)/);
      if (timeMatch) {
        entities.duration = timeMatch[1];
        entities.unit = timeMatch[2];
      }
    } else if (lower.includes('play') || lower.includes('music')) {
      intent = 'media';
      action = 'play';
      const songMatch = lower.match(/play\s+(.+)/);
      if (songMatch) entities.query = songMatch[1];
    } else if (lower.includes('weather')) {
      intent = 'weather';
    } else if (lower.includes('remind') || lower.includes('reminder')) {
      intent = 'reminder';
    } else if (lower.includes('send') && lower.includes('message')) {
      intent = 'message';
      const toMatch = lower.match(/to\s+(\w+)/);
      if (toMatch) entities.recipient = toMatch[1];
    }

    const command: VoiceCommand = {
      id: `cmd-${Date.now()}`,
      text,
      intent,
      entities,
      confidence: 0.85 + Math.random() * 0.15,
      action,
    };

    const userId = 'default';
    if (!this.commandHistory.has(userId)) this.commandHistory.set(userId, []);
    this.commandHistory.get(userId)!.unshift(command);

    return command;
  }

  async getCommandHistory(userId: string, limit: number = 50): Promise<VoiceCommand[]> {
    return (this.commandHistory.get(userId) || []).slice(0, limit);
  }

  async getAvailableVoices(): Promise<VoiceOption[]> {
    return AVAILABLE_VOICES;
  }

  async detectWakeWord(audioChunk: Buffer, wakeWord: string): Promise<boolean> {
    return Math.random() > 0.95;
  }

  async getVoicePreview(voiceId: string): Promise<string> {
    const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
    return voice?.sampleUrl || '';
  }
}

export default new VoiceService();
