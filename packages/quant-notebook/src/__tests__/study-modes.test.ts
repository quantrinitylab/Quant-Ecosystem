import { StudyModeGenerator } from '../study/study-modes.js';
import type { DocumentChunk } from '../types.js';

describe('StudyModeGenerator', () => {
  const generator = new StudyModeGenerator();
  const chunks: DocumentChunk[] = [
    {
      id: 'c1',
      sourceId: 's1',
      text: 'Photosynthesis is the process by which plants convert sunlight into energy using chlorophyll in their leaves for growth',
      index: 0,
      position: { page: 1 },
    },
    {
      id: 'c2',
      sourceId: 's1',
      text: 'Mitosis is a type of cell division that results in two daughter cells each having the same number of chromosomes',
      index: 1,
      position: { page: 2 },
    },
  ];

  describe('generateFlashcards', () => {
    it('produces flashcards with question and answer', () => {
      const cards = generator.generateFlashcards(chunks);
      expect(cards).toHaveLength(2);
      expect(cards[0]!.question).toBeDefined();
      expect(cards[0]!.answer).toBeDefined();
      expect(cards[0]!.sourceChunkId).toBe('c1');
    });

    it('links each flashcard to source chunk', () => {
      const cards = generator.generateFlashcards(chunks);
      expect(cards[1]!.sourceChunkId).toBe('c2');
    });
  });

  describe('generateQuiz', () => {
    it('creates quiz with 4 options each', () => {
      const quizzes = generator.generateQuiz(chunks);
      expect(quizzes).toHaveLength(2);
      expect(quizzes[0]!.options).toHaveLength(4);
    });

    it('has valid correctIndex', () => {
      const quizzes = generator.generateQuiz(chunks);
      quizzes.forEach((q) => {
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.options.length);
      });
    });

    it('includes explanation', () => {
      const quizzes = generator.generateQuiz(chunks);
      expect(quizzes[0]!.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('generateOutline', () => {
    it('produces hierarchical outline', () => {
      const outline = generator.generateOutline(chunks);
      expect(outline).toHaveLength(2);
      expect(outline[0]!.depth).toBe(0);
      expect(outline[0]!.children.length).toBeGreaterThan(0);
      expect(outline[0]!.children[0]!.depth).toBe(1);
    });

    it('each node has title', () => {
      const outline = generator.generateOutline(chunks);
      outline.forEach((node) => {
        expect(node.title.length).toBeGreaterThan(0);
      });
    });
  });
});
