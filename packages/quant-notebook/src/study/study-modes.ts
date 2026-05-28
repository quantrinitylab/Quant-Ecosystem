import type { DocumentChunk, StudyFlashcard, StudyQuiz, OutlineNode } from '../types.js';

export class StudyModeGenerator {
  generateFlashcards(chunks: DocumentChunk[]): StudyFlashcard[] {
    return chunks.map((chunk, i) => {
      const words = chunk.text.split(/\s+/);
      const concept = words.slice(0, 5).join(' ');
      return {
        id: `flash-${i}`,
        question: `What is ${concept}?`,
        answer: words.slice(0, 20).join(' '),
        sourceChunkId: chunk.id,
      };
    });
  }

  generateQuiz(chunks: DocumentChunk[]): StudyQuiz[] {
    return chunks.map((chunk, i) => {
      const words = chunk.text.split(/\s+/);
      const concept = words.slice(0, 5).join(' ');
      return {
        id: `quiz-${i}`,
        question: `Which statement best describes: ${concept}?`,
        options: [
          words.slice(0, 10).join(' '),
          words.slice(10, 20).join(' '),
          words.slice(20, 30).join(' '),
          words.slice(30, 40).join(' '),
        ],
        correctIndex: 0,
        explanation: `The first option directly describes ${concept}.`,
        sourceChunkId: chunk.id,
      };
    });
  }

  generateOutline(chunks: DocumentChunk[]): OutlineNode[] {
    const root: OutlineNode[] = [];
    for (const chunk of chunks) {
      const words = chunk.text.split(/\s+/);
      const title = words.slice(0, 4).join(' ');
      const child: OutlineNode = {
        id: `outline-${chunk.index}-detail`,
        title: words.slice(4, 8).join(' '),
        children: [],
        depth: 1,
        summary: words.slice(0, 15).join(' '),
      };
      root.push({
        id: `outline-${chunk.index}`,
        title,
        children: [child],
        depth: 0,
        summary: words.slice(0, 10).join(' '),
      });
    }
    return root;
  }
}
