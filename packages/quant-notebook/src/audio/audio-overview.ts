import type { DocumentChunk, AudioScript, AudioLength, AudioTurn } from '../types.js';

const WORD_TARGETS: Record<AudioLength, number> = { 5: 750, 15: 2250, 45: 6750 };

export class AudioOverviewGenerator {
  generate(
    chunks: DocumentChunk[],
    options: { length: AudioLength; language: 'en' | 'hi' },
  ): AudioScript {
    const targetWords = WORD_TARGETS[options.length];
    const turns: AudioTurn[] = [];
    let wordCount = 0;
    const material = chunks
      .map((c) => c.text)
      .join(' ')
      .split(/\s+/);

    let i = 0;
    while (wordCount < targetWords && i < material.length) {
      const hostWords = Math.min(
        Math.ceil((targetWords * 0.3) / Math.max(chunks.length, 1)),
        material.length - i,
        targetWords - wordCount,
      );
      const hostText = material.slice(i, i + hostWords).join(' ');
      turns.push({ speaker: 'host', text: hostText });
      wordCount += hostWords;
      i += hostWords;

      if (wordCount >= targetWords || i >= material.length) break;

      const expertWords = Math.min(
        Math.ceil((targetWords * 0.7) / Math.max(chunks.length, 1)),
        material.length - i,
        targetWords - wordCount,
      );
      const expertText = material.slice(i, i + expertWords).join(' ');
      turns.push({ speaker: 'expert', text: expertText });
      wordCount += expertWords;
      i += expertWords;
    }

    if (turns.length === 0) {
      turns.push({ speaker: 'host', text: 'Welcome to this overview.' });
      turns.push({ speaker: 'expert', text: 'Let us discuss the content.' });
      wordCount = 8;
    }

    return {
      turns,
      language: options.language,
      estimatedDuration: options.length,
      wordCount,
    };
  }
}
