export enum QuantLanguage {
  hindi = 'hindi',
  english = 'english',
  tamil = 'tamil',
  telugu = 'telugu',
  bengali = 'bengali',
  marathi = 'marathi',
  gujarati = 'gujarati',
  kannada = 'kannada',
  malayalam = 'malayalam',
  punjabi = 'punjabi',
  odia = 'odia',
  hinglish = 'hinglish',
}

export enum ScriptType {
  Devanagari = 'Devanagari',
  Tamil = 'Tamil',
  Telugu = 'Telugu',
  Bengali = 'Bengali',
  Gujarati = 'Gujarati',
  Gurmukhi = 'Gurmukhi',
  Kannada = 'Kannada',
  Malayalam = 'Malayalam',
  Odia = 'Odia',
  Latin = 'Latin',
}

export interface LocaleConfig {
  language: QuantLanguage;
  script: ScriptType;
  region?: string;
}

export interface TranslationEntry {
  key: string;
  value: string;
  language: QuantLanguage;
}

export interface FestivalEvent {
  name: string;
  /** Month-day in MM-DD format (year-agnostic) */
  date: string;
  languages: QuantLanguage[];
  states: string[];
  greetings: Record<string, string>;
}

export interface LiteConfig {
  maxAssetSizeKb: number;
  compressionEnabled: boolean;
  offlineFirst: boolean;
  queueBasedSend: boolean;
  connectionQualityThreshold: number;
  maxQueueSize?: number;
}

export interface ASRConfig {
  language: QuantLanguage;
  sampleRate?: number;
  enableCodeSwitching?: boolean;
}

export interface TTSConfig {
  language: QuantLanguage;
  voice?: string;
  speed?: number;
}

export interface ASRResult {
  text: string;
  language: QuantLanguage;
  confidence: number;
  segments?: Array<{ text: string; start: number; end: number }>;
}

export interface TTSResult {
  audio: Uint8Array;
  duration: number;
  language: QuantLanguage;
}
