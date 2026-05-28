import type { TTSProvider } from '../types.js';
import { ElevenLabsTTSProvider, type ElevenLabsConfig } from './elevenlabs-provider.js';
import { KokoroTTSProvider, type KokoroConfig } from './kokoro-provider.js';

export type TTSProviderType = 'elevenlabs' | 'kokoro';

export class TTSProviderFactory {
  static create(type: TTSProviderType, config: ElevenLabsConfig | KokoroConfig): TTSProvider {
    switch (type) {
      case 'elevenlabs':
        return new ElevenLabsTTSProvider(config as ElevenLabsConfig);
      case 'kokoro':
        return new KokoroTTSProvider(config as KokoroConfig);
      default:
        throw new Error(`Unknown TTS provider type: ${type as string}`);
    }
  }
}
