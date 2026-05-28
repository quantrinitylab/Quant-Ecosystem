export type SourceType = 'pdf' | 'docx' | 'audio' | 'video' | 'url' | 'epub' | 'text';

export interface Source {
  id: string;
  type: SourceType;
  uri: string;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentChunk {
  id: string;
  sourceId: string;
  text: string;
  index: number;
  position: { page?: number; paragraph?: number; timestamp?: number };
}

export interface Embedding {
  id: string;
  chunkId: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface Notebook {
  id: string;
  title: string;
  sources: Source[];
  embeddingsReady: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  text: string;
  position: { page?: number; paragraph?: number; timestamp?: number };
}

export interface QAResult {
  answer: string;
  citations: Citation[];
  fromWebMode: boolean;
}

export interface AudioTurn {
  speaker: 'host' | 'expert';
  text: string;
}

export interface AudioScript {
  turns: AudioTurn[];
  language: string;
  estimatedDuration: number;
  wordCount: number;
}

export type AudioLength = 5 | 15 | 45;

export interface StudyFlashcard {
  id: string;
  question: string;
  answer: string;
  sourceChunkId: string;
}

export interface StudyQuiz {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceChunkId: string;
}

export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
  depth: number;
  summary?: string;
}

export type ScoredChunk = DocumentChunk & { score: number };
