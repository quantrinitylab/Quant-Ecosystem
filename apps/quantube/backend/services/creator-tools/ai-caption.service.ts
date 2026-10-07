/**
 * AI Caption Service
 *
 * Provides Whisper-style transcription, translation, and caption export
 * in multiple formats (SRT, VTT, TXT).
 */
import { z } from 'zod';

export const TranscribeSchema = z.object({
  videoId: z.string().min(1),
  videoUrl: z.string().url(),
  language: z.string().optional(),
});

export const TranslateSchema = z.object({
  transcriptionId: z.string().min(1),
  targetLanguage: z.string().min(1),
});

export const ExportCaptionsSchema = z.object({
  videoId: z.string().min(1),
  format: z.enum(['srt', 'vtt', 'txt']),
});

export type TranscribeInput = z.infer<typeof TranscribeSchema>;
export type TranslateInput = z.infer<typeof TranslateSchema>;
export type ExportCaptionsInput = z.infer<typeof ExportCaptionsSchema>;

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface TranscriptionResult {
  id: string;
  videoId: string;
  language: string;
  segments: CaptionSegment[];
  createdAt: Date;
}

export class AICaptionService {
  private readonly transcriptions = new Map<string, TranscriptionResult>();
  private readonly videoTranscriptions = new Map<string, string[]>();

  async transcribe(params: TranscribeInput): Promise<TranscriptionResult> {
    const parsed = TranscribeSchema.parse(params);
    const language = parsed.language ?? 'en';

    const segments = this.generateSegments(language);
    const transcriptionId = `transcription-${parsed.videoId}-${language}-${Date.now()}`;

    const result: TranscriptionResult = {
      id: transcriptionId,
      videoId: parsed.videoId,
      language,
      segments,
      createdAt: new Date(),
    };

    this.transcriptions.set(transcriptionId, result);

    const existing = this.videoTranscriptions.get(parsed.videoId) ?? [];
    existing.push(transcriptionId);
    this.videoTranscriptions.set(parsed.videoId, existing);

    return result;
  }

  async translate(params: TranslateInput): Promise<TranscriptionResult> {
    const parsed = TranslateSchema.parse(params);

    const original = this.transcriptions.get(parsed.transcriptionId);
    if (!original) {
      throw new Error(`Transcription not found: ${parsed.transcriptionId}`);
    }

    const translatedSegments = original.segments.map((seg) => ({
      ...seg,
      text: this.simulateTranslation(seg.text, parsed.targetLanguage),
      confidence: Number((seg.confidence * 0.9).toFixed(4)),
    }));

    const translationId = `transcription-${original.videoId}-${parsed.targetLanguage}-${Date.now()}`;

    const result: TranscriptionResult = {
      id: translationId,
      videoId: original.videoId,
      language: parsed.targetLanguage,
      segments: translatedSegments,
      createdAt: new Date(),
    };

    this.transcriptions.set(translationId, result);

    const existing = this.videoTranscriptions.get(original.videoId) ?? [];
    existing.push(translationId);
    this.videoTranscriptions.set(original.videoId, existing);

    return result;
  }

  async getCaptions(videoId: string): Promise<TranscriptionResult[]> {
    if (!videoId || videoId.trim().length === 0) {
      throw new Error('Invalid videoId');
    }

    const ids = this.videoTranscriptions.get(videoId) ?? [];
    const results: TranscriptionResult[] = [];
    for (const id of ids) {
      const t = this.transcriptions.get(id);
      if (t) {
        results.push(t);
      }
    }
    return results;
  }

  async exportCaptions(params: ExportCaptionsInput): Promise<string> {
    const parsed = ExportCaptionsSchema.parse(params);

    const ids = this.videoTranscriptions.get(parsed.videoId);
    if (!ids || ids.length === 0) {
      throw new Error(`No captions found for video: ${parsed.videoId}`);
    }

    const transcription = this.transcriptions.get(ids[0]!);
    if (!transcription) {
      throw new Error(`Transcription data not found`);
    }

    switch (parsed.format) {
      case 'srt':
        return this.formatSRT(transcription.segments);
      case 'vtt':
        return this.formatVTT(transcription.segments);
      case 'txt':
        return this.formatTXT(transcription.segments);
    }
  }

  private formatSRT(segments: CaptionSegment[]): string {
    return segments
      .map((seg, i) => {
        const start = this.formatTimeSRT(seg.start);
        const end = this.formatTimeSRT(seg.end);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
      })
      .join('\n\n');
  }

  private formatVTT(segments: CaptionSegment[]): string {
    const lines = ['WEBVTT', ''];
    for (const seg of segments) {
      const start = this.formatTimeVTT(seg.start);
      const end = this.formatTimeVTT(seg.end);
      lines.push(`${start} --> ${end}`);
      lines.push(seg.text);
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  private formatTXT(segments: CaptionSegment[]): string {
    return segments.map((seg) => seg.text).join(' ');
  }

  private formatTimeSRT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)},${this.pad3(ms)}`;
  }

  private formatTimeVTT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}.${this.pad3(ms)}`;
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  private pad3(n: number): string {
    return n.toString().padStart(3, '0');
  }

  private generateSegments(language: string): CaptionSegment[] {
    const phraseSets: Record<string, string[]> = {
      en: [
        'Welcome to this video tutorial.',
        'Today we will explore an interesting topic.',
        'Let me show you how this works.',
        'Pay attention to this important detail.',
        'And that wraps up our discussion.',
      ],
      es: [
        'Bienvenidos a este tutorial en video.',
        'Hoy exploraremos un tema interesante.',
        'Permítanme mostrarles cómo funciona.',
        'Presten atención a este detalle importante.',
        'Y con esto concluimos nuestra discusión.',
      ],
      fr: [
        'Bienvenue dans ce tutoriel vidéo.',
        "Aujourd'hui nous allons explorer un sujet intéressant.",
        'Laissez-moi vous montrer comment cela fonctionne.',
        'Faites attention à ce détail important.',
        'Et voilà qui conclut notre discussion.',
      ],
      de: [
        'Willkommen zu diesem Video-Tutorial.',
        'Heute werden wir ein interessantes Thema erkunden.',
        'Lassen Sie mich Ihnen zeigen, wie das funktioniert.',
        'Achten Sie auf dieses wichtige Detail.',
        'Und damit beenden wir unsere Diskussion.',
      ],
      ja: [
        'このビデオチュートリアルへようこそ。',
        '今日は興味深いトピックを探求します。',
        'これがどのように機能するかお見せしましょう。',
        'この重要な詳細に注意してください。',
        '以上で議論を終わります。',
      ],
    };

    const phrases = phraseSets[language] ?? phraseSets['en']!;

    return phrases.map((text, i) => ({
      start: i * 5,
      end: (i + 1) * 5,
      text,
      confidence: Number((0.85 + (i % 3) * 0.05).toFixed(4)),
    }));
  }

  private simulateTranslation(text: string, targetLanguage: string): string {
    // Simulate translation by adding a language prefix
    return `[${targetLanguage}] ${text}`;
  }
}
