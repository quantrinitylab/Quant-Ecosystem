// ============================================================================
// ML Pipeline - Named Entity Recognition Engine
// ============================================================================

import { NEREntity, EntityType } from '../types';

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

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Regex/dictionary-based NER
 * Production path: Use spaCy, Hugging Face NER, or ONNX model
 */
export class NEREngine {
  private gazetteers: Map<EntityType, Map<string, GazetteerEntry>> = new Map();
  private patterns: PatternRule[] = [];
  private entityAliases: Map<string, string> = new Map();

  constructor() {
    this.initializePatterns();
    this.initializeGazetteers();
  }

  private initializePatterns(): void {
    // Date patterns
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
    // Money patterns
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
    // Email patterns
    this.patterns.push({
      pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
      type: 'EMAIL',
      confidence: 0.99,
    });
    // URL patterns
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
    // Phone patterns
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
    // Initialize maps for each entity type
    for (const type of [
      'PERSON',
      'ORG',
      'LOCATION',
      'DATE',
      'MONEY',
      'EMAIL',
      'URL',
      'PHONE',
    ] as EntityType[]) {
      this.gazetteers.set(type, new Map());
    }
    // Common locations
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
    // Common organizations
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
    // Common first names (for person detection)
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

  // Main entity extraction
  extract(text: string): NEREntity[] {
    const entities: NEREntity[] = [];
    // Pattern-based extraction
    entities.push(...this.extractByPatterns(text));
    // Gazetteer-based extraction
    entities.push(...this.extractByGazetteer(text));
    // Context-based person detection
    entities.push(...this.extractPersonsByContext(text));
    // Resolve overlapping entities
    return this.resolveOverlaps(entities);
  }

  private extractByPatterns(text: string): NEREntity[] {
    const entities: NEREntity[] = [];
    for (const rule of this.patterns) {
      // Reset regex state
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: rule.type,
          start: match.index,
          end: match.index + match[0].length,
          confidence: rule.confidence,
          normalized: this.normalizeEntity(match[0], rule.type),
        });
      }
    }
    return entities;
  }

  private extractByGazetteer(text: string): NEREntity[] {
    const entities: NEREntity[] = [];
    const lowerText = text.toLowerCase();
    for (const [type, gazetteer] of this.gazetteers.entries()) {
      for (const [term, entry] of gazetteer.entries()) {
        let searchFrom = 0;
        while (true) {
          const idx = lowerText.indexOf(term, searchFrom);
          if (idx === -1) break;
          // Check word boundaries
          const before = idx > 0 ? lowerText[idx - 1]! : ' ';
          const after = idx + term.length < lowerText.length ? lowerText[idx + term.length]! : ' ';
          if (/\W/.test(before) && /\W/.test(after)) {
            const originalText = text.substring(idx, idx + term.length);
            entities.push({
              text: originalText,
              type,
              start: idx,
              end: idx + term.length,
              confidence: 0.85,
              normalized: entry.normalized,
            });
          }
          searchFrom = idx + 1;
        }
      }
    }
    return entities;
  }

  private extractPersonsByContext(text: string): NEREntity[] {
    const entities: NEREntity[] = [];
    const personIndicators = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'President', 'CEO', 'Director'];
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      // Check if word is a title followed by capitalized word
      const cleanWord = word.replace(/[.,;:!?]$/, '');
      if (personIndicators.some((ind) => cleanWord === ind || cleanWord === ind.replace('.', ''))) {
        // Next word(s) are likely person name
        let name = '';
        let j = i + 1;
        while (j < words.length && /^[A-Z]/.test(words[j]!)) {
          name += (name ? ' ' : '') + words[j]!.replace(/[.,;:!?]$/, '');
          j++;
        }
        if (name) {
          const fullText = `${cleanWord} ${name}`;
          const idx = text.indexOf(fullText);
          if (idx >= 0) {
            entities.push({
              text: name,
              type: 'PERSON',
              start: idx + cleanWord.length + 1,
              end: idx + fullText.length,
              confidence: 0.9,
              normalized: name,
            });
          }
        }
      }
      // Detect capitalized multi-word sequences (potential names/orgs)
      if (/^[A-Z][a-z]+$/.test(cleanWord) && i > 0) {
        const prevWord = words[i - 1]?.replace(/[.,;:!?]$/, '') ?? '';
        if (/^[A-Z][a-z]+$/.test(prevWord) && !this.isCommonWord(prevWord)) {
          // Two consecutive capitalized words - potential person name
          const fullName = `${prevWord} ${cleanWord}`;
          const idx = text.indexOf(fullName);
          if (idx >= 0) {
            const alreadyFound = entities.some(
              (e) => e.start === idx && e.end === idx + fullName.length,
            );
            if (!alreadyFound) {
              entities.push({
                text: fullName,
                type: 'PERSON',
                start: idx,
                end: idx + fullName.length,
                confidence: 0.7,
                normalized: fullName,
              });
            }
          }
        }
      }
    }
    return entities;
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

  // Resolve overlapping entities (longest match wins)
  private resolveOverlaps(entities: NEREntity[]): NEREntity[] {
    if (entities.length <= 1) return entities;
    // Sort by span length (longest first), then by confidence
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
    // Sort by position for output
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

  // Add custom gazetteer entries
  addEntity(text: string, type: EntityType, normalized?: string): void {
    const gazetteer = this.gazetteers.get(type);
    if (!gazetteer) return;
    const lower = text.toLowerCase();
    gazetteer.set(lower, { text: lower, type, normalized: normalized ?? text });
    if (normalized) {
      this.entityAliases.set(lower, normalized);
    }
  }

  // Add custom pattern
  addPattern(pattern: RegExp, type: EntityType, confidence: number = 0.8): void {
    this.patterns.push({ pattern, type, confidence });
  }

  // Get entities by type
  getEntitiesByType(entities: NEREntity[], type: EntityType): NEREntity[] {
    return entities.filter((e) => e.type === type);
  }

  // Extract and link entities
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
