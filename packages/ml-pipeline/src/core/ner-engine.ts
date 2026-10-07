// ============================================================================
// ML Pipeline - Named Entity Recognition Engine (CRF-style with LLM backend)
// ============================================================================

import { NEREntity, EntityType } from '../types';

/** Backend interface for LLM-based NER */
export interface NERBackend {
  /** Extract entities from text using an LLM with structured output */
  extractEntities(
    text: string,
  ): Promise<{ text: string; type: EntityType; start: number; end: number; confidence: number }[]>;
  /** Whether the backend is available */
  isAvailable(): boolean;
}

/** Options for creating a NEREngine */
export interface NEREngineOptions {
  /** Optional AI backend for LLM-based NER (e.g., UnifiedAIService adapter) */
  backend?: NERBackend;
}

interface GazetteerEntry {
  text: string;
  type: EntityType;
  normalized: string;
}

interface PatternRule {
  pattern: RegExp;
  type: EntityType;
  confidence: number;
}

type BIOLabel = string;

const ENTITY_TYPES: EntityType[] = [
  'PERSON',
  'ORG',
  'LOCATION',
  'DATE',
  'MONEY',
  'EMAIL',
  'URL',
  'PHONE',
];

function generateBIOLabels(): BIOLabel[] {
  const labels: BIOLabel[] = ['O'];
  for (const type of ENTITY_TYPES) {
    labels.push(`B-${type}`);
    labels.push(`I-${type}`);
  }
  return labels;
}

const ALL_LABELS = generateBIOLabels();

export class NEREngine {
  private gazetteers: Map<EntityType, Map<string, GazetteerEntry>> = new Map();
  private patterns: PatternRule[] = [];
  private entityAliases: Map<string, string> = new Map();
  private transitionScores: Map<string, number> = new Map();
  private readonly backend: NERBackend | null;

  constructor(options?: NEREngineOptions) {
    this.backend = options?.backend ?? null;
    this.initializePatterns();
    this.initializeGazetteers();
    this.initializeTransitionScores();
  }

  /** Returns true if an AI backend is configured and available */
  hasBackend(): boolean {
    return this.backend !== null && this.backend.isAvailable();
  }

  /**
   * Extract entities using LLM backend when available, falling back to regex/CRF.
   * Returns entities with a `backend` field indicating the source.
   */
  async extractWithBackend(
    text: string,
  ): Promise<{ entities: NEREntity[]; backend: 'llm' | 'regex' }> {
    if (this.backend && this.backend.isAvailable()) {
      try {
        const rawEntities = await this.backend.extractEntities(text);
        const entities: NEREntity[] = rawEntities.map((e) => ({
          text: e.text,
          type: e.type,
          start: e.start,
          end: e.end,
          confidence: e.confidence,
          normalized: this.normalizeEntity(e.text, e.type),
        }));
        return { entities: this.resolveOverlaps(entities), backend: 'llm' };
      } catch {
        // Fall through to regex-based extraction on backend error
      }
    }

    const entities = this.extract(text);
    return { entities, backend: 'regex' };
  }

  private initializeTransitionScores(): void {
    for (const from of ALL_LABELS) {
      for (const to of ALL_LABELS) {
        let score = -1.0;
        if (from === 'O' && to === 'O') {
          score = 2.0;
        } else if (from === 'O' && to.startsWith('B-')) {
          score = 0.5;
        } else if (from.startsWith('B-') && to.startsWith('I-')) {
          const fromType = from.substring(2);
          const toType = to.substring(2);
          score = fromType === toType ? 3.0 : -5.0;
        } else if (from.startsWith('I-') && to.startsWith('I-')) {
          const fromType = from.substring(2);
          const toType = to.substring(2);
          score = fromType === toType ? 2.0 : -5.0;
        } else if (from.startsWith('I-') && to === 'O') {
          score = 1.0;
        } else if (from.startsWith('I-') && to.startsWith('B-')) {
          score = 0.3;
        } else if (from.startsWith('B-') && to === 'O') {
          score = 1.0;
        } else if (from.startsWith('B-') && to.startsWith('B-')) {
          score = -0.5;
        } else if (from === 'O' && to.startsWith('I-')) {
          score = -10.0;
        }
        this.transitionScores.set(`${from}->${to}`, score);
      }
    }
  }

  private getTransitionScore(from: BIOLabel, to: BIOLabel): number {
    return this.transitionScores.get(`${from}->${to}`) ?? -5.0;
  }

  private initializePatterns(): void {
    this.patterns.push({
      pattern: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g,
      type: 'DATE',
      confidence: 0.95,
    });
    this.patterns.push({
      pattern:
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?\b/gi,
      type: 'DATE',
      confidence: 0.95,
    });
    this.patterns.push({
      pattern:
        /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?\b/gi,
      type: 'DATE',
      confidence: 0.9,
    });
    this.patterns.push({
      pattern: /\$[\d,]+(?:\.\d{2})?\b/g,
      type: 'MONEY',
      confidence: 0.98,
    });
    this.patterns.push({
      pattern: /\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|JPY|dollars?|euros?|pounds?)\b/gi,
      type: 'MONEY',
      confidence: 0.95,
    });
    this.patterns.push({
      pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
      type: 'EMAIL',
      confidence: 0.99,
    });
    this.patterns.push({
      pattern: /https?:\/\/[^\s<>\"']+/g,
      type: 'URL',
      confidence: 0.99,
    });
    this.patterns.push({
      pattern: /www\.[^\s<>\"']+/g,
      type: 'URL',
      confidence: 0.95,
    });
    this.patterns.push({
      pattern: /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      type: 'PHONE',
      confidence: 0.9,
    });
    this.patterns.push({
      pattern: /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
      type: 'PHONE',
      confidence: 0.85,
    });
  }

  private initializeGazetteers(): void {
    for (const type of ENTITY_TYPES) {
      this.gazetteers.set(type, new Map());
    }
    const locations: [string, string][] = [
      ['new york', 'New York'],
      ['new york city', 'New York City'],
      ['nyc', 'New York City'],
      ['los angeles', 'Los Angeles'],
      ['la', 'Los Angeles'],
      ['chicago', 'Chicago'],
      ['san francisco', 'San Francisco'],
      ['sf', 'San Francisco'],
      ['london', 'London'],
      ['paris', 'Paris'],
      ['tokyo', 'Tokyo'],
      ['berlin', 'Berlin'],
      ['sydney', 'Sydney'],
      ['united states', 'United States'],
      ['usa', 'United States'],
      ['us', 'United States'],
      ['united kingdom', 'United Kingdom'],
      ['uk', 'United Kingdom'],
      ['canada', 'Canada'],
      ['australia', 'Australia'],
      ['germany', 'Germany'],
      ['france', 'France'],
      ['japan', 'Japan'],
      ['china', 'China'],
      ['india', 'India'],
      ['brazil', 'Brazil'],
      ['california', 'California'],
      ['texas', 'Texas'],
      ['florida', 'Florida'],
      ['washington', 'Washington'],
    ];
    const locMap = this.gazetteers.get('LOCATION')!;
    for (const [text, normalized] of locations) {
      locMap.set(text, { text, type: 'LOCATION', normalized });
      this.entityAliases.set(text, normalized);
    }
    const orgs: [string, string][] = [
      ['google', 'Google Inc.'],
      ['microsoft', 'Microsoft Corp.'],
      ['apple', 'Apple Inc.'],
      ['amazon', 'Amazon.com Inc.'],
      ['facebook', 'Meta Platforms Inc.'],
      ['meta', 'Meta Platforms Inc.'],
      ['netflix', 'Netflix Inc.'],
      ['tesla', 'Tesla Inc.'],
      ['ibm', 'IBM Corp.'],
      ['nasa', 'NASA'],
      ['fbi', 'FBI'],
      ['cia', 'CIA'],
      ['nato', 'NATO'],
      ['un', 'United Nations'],
      ['who', 'World Health Organization'],
      ['mit', 'MIT'],
      ['harvard', 'Harvard University'],
      ['stanford', 'Stanford University'],
    ];
    const orgMap = this.gazetteers.get('ORG')!;
    for (const [text, normalized] of orgs) {
      orgMap.set(text, { text, type: 'ORG', normalized });
      this.entityAliases.set(text, normalized);
    }
    const names: string[] = [
      'james',
      'john',
      'robert',
      'michael',
      'william',
      'david',
      'richard',
      'joseph',
      'mary',
      'patricia',
      'jennifer',
      'linda',
      'elizabeth',
      'barbara',
      'susan',
      'jessica',
      'thomas',
      'charles',
      'daniel',
      'matthew',
      'sarah',
      'karen',
      'nancy',
      'lisa',
    ];
    const personMap = this.gazetteers.get('PERSON')!;
    for (const name of names) {
      personMap.set(name, {
        text: name,
        type: 'PERSON',
        normalized: name.charAt(0).toUpperCase() + name.slice(1),
      });
    }
  }

  private tokenize(text: string): { tokens: string[]; offsets: { start: number; end: number }[] } {
    const tokens: string[] = [];
    const offsets: { start: number; end: number }[] = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[0]);
      offsets.push({ start: match.index, end: match.index + match[0].length });
    }
    return { tokens, offsets };
  }

  private getWordShape(word: string): string {
    let shape = '';
    for (const ch of word) {
      if (/[A-Z]/.test(ch)) shape += 'X';
      else if (/[a-z]/.test(ch)) shape += 'x';
      else if (/\d/.test(ch)) shape += 'd';
      else shape += ch;
    }
    let collapsed = shape[0] ?? '';
    for (let i = 1; i < shape.length; i++) {
      if (shape[i] !== shape[i - 1]) collapsed += shape[i];
    }
    return collapsed;
  }

  private getPatternMatches(text: string): Map<string, Map<EntityType, number>> {
    const matches = new Map<string, Map<EntityType, number>>();
    for (const rule of this.patterns) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const key = `${match.index}:${match.index + match[0].length}`;
        if (!matches.has(key)) matches.set(key, new Map());
        const existing = matches.get(key)!.get(rule.type) ?? 0;
        matches.get(key)!.set(rule.type, Math.max(existing, rule.confidence));
      }
    }
    return matches;
  }

  private getGazetteerMatch(token: string): { type: EntityType; normalized: string } | null {
    const lower = token.toLowerCase().replace(/[.,;:!?]$/, '');
    for (const [type, gazetteer] of this.gazetteers.entries()) {
      const entry = gazetteer.get(lower);
      if (entry) return { type, normalized: entry.normalized };
    }
    return null;
  }

  private getMultiTokenGazetteerMatch(
    tokens: string[],
    startIdx: number,
  ): { type: EntityType; normalized: string; length: number } | null {
    let best: { type: EntityType; normalized: string; length: number } | null = null;
    for (let len = 4; len >= 2; len--) {
      if (startIdx + len > tokens.length) continue;
      const phrase = tokens
        .slice(startIdx, startIdx + len)
        .map((t) => t.toLowerCase().replace(/[.,;:!?]$/, ''))
        .join(' ');
      for (const [type, gazetteer] of this.gazetteers.entries()) {
        const entry = gazetteer.get(phrase);
        if (entry) {
          if (!best || len > best.length) {
            best = { type, normalized: entry.normalized, length: len };
          }
        }
      }
    }
    return best;
  }

  private computeEmissionScores(
    tokens: string[],
    tokenIdx: number,
    _text: string,
    offsets: { start: number; end: number }[],
    patternMatches: Map<string, Map<EntityType, number>>,
  ): Map<BIOLabel, number> {
    const scores = new Map<BIOLabel, number>();
    for (const label of ALL_LABELS) {
      scores.set(label, 0);
    }

    const token = tokens[tokenIdx]!;
    const cleanToken = token.replace(/[.,;:!?]$/, '');
    const offset = offsets[tokenIdx]!;
    const posKey = `${offset.start}:${offset.end}`;

    const patternTypeMap = patternMatches.get(posKey);
    if (patternTypeMap) {
      for (const [type, confidence] of patternTypeMap.entries()) {
        const bLabel = `B-${type}`;
        const iLabel = `I-${type}`;
        scores.set(bLabel, (scores.get(bLabel) ?? 0) + confidence * 5);
        scores.set(iLabel, (scores.get(iLabel) ?? 0) + confidence * 4);
      }
    }

    const gazMatch = this.getGazetteerMatch(token);
    if (gazMatch) {
      const bLabel = `B-${gazMatch.type}`;
      const iLabel = `I-${gazMatch.type}`;
      scores.set(bLabel, (scores.get(bLabel) ?? 0) + 3.5);
      scores.set(iLabel, (scores.get(iLabel) ?? 0) + 2.5);
    }

    const multiMatch = this.getMultiTokenGazetteerMatch(tokens, tokenIdx);
    if (multiMatch) {
      const bLabel = `B-${multiMatch.type}`;
      scores.set(bLabel, (scores.get(bLabel) ?? 0) + 4.0);
      for (let k = 1; k < multiMatch.length; k++) {
        const iLabel = `I-${multiMatch.type}`;
        scores.set(iLabel, (scores.get(iLabel) ?? 0) + 3.0);
      }
    }

    if (tokenIdx > 0) {
      const prevToken = tokens[tokenIdx - 1]!.replace(/[.,;:!?]$/, '');
      const titleIndicators = [
        'Mr.',
        'Mrs.',
        'Ms.',
        'Dr.',
        'Prof.',
        'President',
        'CEO',
        'Director',
      ];
      if (titleIndicators.some((ind) => prevToken === ind || prevToken === ind.replace('.', ''))) {
        if (/^[A-Z]/.test(cleanToken)) {
          scores.set('B-PERSON', (scores.get('B-PERSON') ?? 0) + 4.0);
        }
      }
    }

    const shape = this.getWordShape(cleanToken);
    if (shape === 'X' || shape === 'Xx') {
      if (tokenIdx > 0) {
        scores.set('B-PERSON', (scores.get('B-PERSON') ?? 0) + 0.5);
        scores.set('B-ORG', (scores.get('B-ORG') ?? 0) + 0.3);
        scores.set('B-LOCATION', (scores.get('B-LOCATION') ?? 0) + 0.3);
      }
    }

    if (tokenIdx > 0) {
      const prevClean = tokens[tokenIdx - 1]!.replace(/[.,;:!?]$/, '');
      if (/^[A-Z][a-z]+$/.test(prevClean) && /^[A-Z][a-z]+$/.test(cleanToken)) {
        if (!this.isCommonWord(prevClean)) {
          scores.set('I-PERSON', (scores.get('I-PERSON') ?? 0) + 2.0);
          scores.set('I-ORG', (scores.get('I-ORG') ?? 0) + 1.0);
        }
      }
    }

    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(cleanToken)) {
      scores.set('B-DATE', (scores.get('B-DATE') ?? 0) + 5.0);
    }
    if (/^\$[\d,]+/.test(cleanToken)) {
      scores.set('B-MONEY', (scores.get('B-MONEY') ?? 0) + 5.0);
    }
    if (/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(cleanToken)) {
      scores.set('B-EMAIL', (scores.get('B-EMAIL') ?? 0) + 6.0);
    }
    if (/^https?:\/\//.test(cleanToken) || /^www\./.test(cleanToken)) {
      scores.set('B-URL', (scores.get('B-URL') ?? 0) + 6.0);
    }

    const suffix2 = cleanToken.substring(cleanToken.length - 2).toLowerCase();
    const suffix3 = cleanToken.substring(cleanToken.length - 3).toLowerCase();

    if (['tion', 'sion', 'ment', 'ness'].includes(suffix3)) {
      scores.set('O', (scores.get('O') ?? 0) + 0.2);
    }
    if (['ing', 'ed', 'ly', 'er', 'est'].includes(suffix2) || suffix3 === 'ing') {
      scores.set('O', (scores.get('O') ?? 0) + 0.1);
    }

    scores.set('O', (scores.get('O') ?? 0) + 1.0);

    return scores;
  }

  private viterbi(
    tokens: string[],
    text: string,
    offsets: { start: number; end: number }[],
    patternMatches: Map<string, Map<EntityType, number>>,
  ): BIOLabel[] {
    const n = tokens.length;
    if (n === 0) return [];

    const numLabels = ALL_LABELS.length;
    const dp: number[][] = Array.from({ length: n }, () => new Array(numLabels).fill(-Infinity));
    const backpointer: number[][] = Array.from({ length: n }, () => new Array(numLabels).fill(0));

    const emissions0 = this.computeEmissionScores(tokens, 0, text, offsets, patternMatches);
    for (let j = 0; j < numLabels; j++) {
      dp[0]![j] = emissions0.get(ALL_LABELS[j]!) ?? 0;
    }

    for (let i = 1; i < n; i++) {
      const emissions = this.computeEmissionScores(tokens, i, text, offsets, patternMatches);
      for (let j = 0; j < numLabels; j++) {
        const toLabel = ALL_LABELS[j]!;
        const emitScore = emissions.get(toLabel) ?? 0;
        let bestScore = -Infinity;
        let bestPrev = 0;
        for (let k = 0; k < numLabels; k++) {
          const fromLabel = ALL_LABELS[k]!;
          const transScore = this.getTransitionScore(fromLabel, toLabel);
          const score = dp[i - 1]![k]! + transScore + emitScore;
          if (score > bestScore) {
            bestScore = score;
            bestPrev = k;
          }
        }
        dp[i]![j] = bestScore;
        backpointer[i]![j] = bestPrev;
      }
    }

    let bestLastIdx = 0;
    let bestLastScore = -Infinity;
    for (let j = 0; j < numLabels; j++) {
      if (dp[n - 1]![j]! > bestLastScore) {
        bestLastScore = dp[n - 1]![j]!;
        bestLastIdx = j;
      }
    }

    const result: BIOLabel[] = new Array(n);
    result[n - 1] = ALL_LABELS[bestLastIdx]!;
    let currentIdx = bestLastIdx;
    for (let i = n - 1; i > 0; i--) {
      currentIdx = backpointer[i]![currentIdx]!;
      result[i - 1] = ALL_LABELS[currentIdx]!;
    }

    return result;
  }

  private labelsToEntities(
    tokens: string[],
    labels: BIOLabel[],
    offsets: { start: number; end: number }[],
    text: string,
  ): NEREntity[] {
    const entities: NEREntity[] = [];
    let i = 0;
    while (i < labels.length) {
      const label = labels[i]!;
      if (label.startsWith('B-')) {
        const type = label.substring(2) as EntityType;
        let end = i + 1;
        while (end < labels.length && labels[end] === `I-${type}`) {
          end++;
        }
        const startOffset = offsets[i]!.start;
        const endOffset = offsets[end - 1]!.end;
        const entityText = text.substring(startOffset, endOffset);
        const confidence = this.computeEntityConfidence(tokens, labels, i, end, type);
        entities.push({
          text: entityText,
          type,
          start: startOffset,
          end: endOffset,
          confidence,
          normalized: this.normalizeEntity(entityText, type),
        });
        i = end;
      } else {
        i++;
      }
    }
    return entities;
  }

  private computeEntityConfidence(
    tokens: string[],
    _labels: BIOLabel[],
    start: number,
    end: number,
    type: EntityType,
  ): number {
    let conf = 0.7;
    const spanLen = end - start;
    if (spanLen === 1) {
      const gazMatch = this.getGazetteerMatch(tokens[start]!);
      if (gazMatch && gazMatch.type === type) conf += 0.15;
    }
    if (spanLen >= 2) conf += 0.05;
    if (/^[A-Z]/.test(tokens[start]!)) conf += 0.05;
    return Math.min(0.99, conf);
  }

  extract(text: string): NEREntity[] {
    const { tokens, offsets } = this.tokenize(text);
    if (tokens.length === 0) return [];

    const patternMatches = this.getPatternMatches(text);
    const labels = this.viterbi(tokens, text, offsets, patternMatches);
    const entities = this.labelsToEntities(tokens, labels, offsets, text);
    return this.resolveOverlaps(entities);
  }

  private isCommonWord(word: string): boolean {
    const common = new Set([
      'The',
      'This',
      'That',
      'These',
      'Those',
      'What',
      'When',
      'Where',
      'Which',
      'Who',
      'How',
      'Its',
      'His',
      'Her',
      'Our',
      'Their',
      'Some',
      'Any',
      'All',
      'Each',
      'Every',
      'Many',
      'Much',
      'More',
      'Most',
      'Other',
      'Another',
      'Such',
      'Both',
      'Few',
      'Several',
    ]);
    return common.has(word);
  }

  private resolveOverlaps(entities: NEREntity[]): NEREntity[] {
    if (entities.length <= 1) return entities;
    entities.sort((a, b) => {
      const lenDiff = b.end - b.start - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return b.confidence - a.confidence;
    });
    const resolved: NEREntity[] = [];
    const occupied = new Set<number>();
    for (const entity of entities) {
      let overlaps = false;
      for (let pos = entity.start; pos < entity.end; pos++) {
        if (occupied.has(pos)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        resolved.push(entity);
        for (let pos = entity.start; pos < entity.end; pos++) {
          occupied.add(pos);
        }
      }
    }
    resolved.sort((a, b) => a.start - b.start);
    return resolved;
  }

  private normalizeEntity(text: string, type: EntityType): string {
    const lower = text.toLowerCase().trim();
    const alias = this.entityAliases.get(lower);
    if (alias) return alias;
    switch (type) {
      case 'MONEY':
        return text.replace(/[,\s]/g, '');
      case 'PHONE':
        return text.replace(/[^+\d]/g, '');
      case 'EMAIL':
        return text.toLowerCase();
      default:
        return text;
    }
  }

  addEntity(text: string, type: EntityType, normalized?: string): void {
    const gazetteer = this.gazetteers.get(type);
    if (!gazetteer) return;
    const lower = text.toLowerCase();
    gazetteer.set(lower, { text: lower, type, normalized: normalized ?? text });
    if (normalized) {
      this.entityAliases.set(lower, normalized);
    }
  }

  addPattern(pattern: RegExp, type: EntityType, confidence: number = 0.8): void {
    this.patterns.push({ pattern, type, confidence });
  }

  getEntitiesByType(entities: NEREntity[], type: EntityType): NEREntity[] {
    return entities.filter((e) => e.type === type);
  }

  extractAndLink(text: string): NEREntity[] {
    const entities = this.extract(text);
    return entities.map((entity) => ({
      ...entity,
      normalized: this.normalizeEntity(entity.text, entity.type),
    }));
  }

  getSupportedTypes(): EntityType[] {
    return Array.from(this.gazetteers.keys());
  }

  getGazetteerSize(type: EntityType): number {
    return this.gazetteers.get(type)?.size ?? 0;
  }
}
