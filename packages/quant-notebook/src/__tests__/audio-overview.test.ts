import { AudioOverviewGenerator } from '../audio/audio-overview.js';
import type { DocumentChunk } from '../types.js';

describe('AudioOverviewGenerator', () => {
  const generator = new AudioOverviewGenerator();
  const chunks: DocumentChunk[] = [
    {
      id: 'c1',
      sourceId: 's1',
      text: Array(200).fill('word').join(' '),
      index: 0,
      position: { page: 1 },
    },
    {
      id: 'c2',
      sourceId: 's1',
      text: Array(200).fill('content').join(' '),
      index: 1,
      position: { page: 2 },
    },
    {
      id: 'c3',
      sourceId: 's1',
      text: Array(200).fill('data').join(' '),
      index: 2,
      position: { page: 3 },
    },
    {
      id: 'c4',
      sourceId: 's1',
      text: Array(200).fill('info').join(' '),
      index: 3,
      position: { page: 4 },
    },
  ];

  it('generates alternating host and expert speakers', () => {
    const script = generator.generate(chunks, { length: 5, language: 'en' });
    expect(script.turns.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < script.turns.length - 1; i++) {
      expect(script.turns[i]!.speaker).not.toBe(script.turns[i + 1]!.speaker);
    }
  });

  it('respects word count target for 5 min', () => {
    const script = generator.generate(chunks, { length: 5, language: 'en' });
    expect(script.wordCount).toBeGreaterThanOrEqual(500);
    expect(script.wordCount).toBeLessThanOrEqual(800);
  });

  it('sets language field correctly', () => {
    const en = generator.generate(chunks, { length: 5, language: 'en' });
    expect(en.language).toBe('en');

    const hi = generator.generate(chunks, { length: 5, language: 'hi' });
    expect(hi.language).toBe('hi');
  });

  it('has both host and expert turns', () => {
    const script = generator.generate(chunks, { length: 15, language: 'en' });
    const speakers = new Set(script.turns.map((t) => t.speaker));
    expect(speakers.has('host')).toBe(true);
    expect(speakers.has('expert')).toBe(true);
  });

  it('returns estimated duration matching length option', () => {
    const script = generator.generate(chunks, { length: 15, language: 'en' });
    expect(script.estimatedDuration).toBe(15);
  });
});
