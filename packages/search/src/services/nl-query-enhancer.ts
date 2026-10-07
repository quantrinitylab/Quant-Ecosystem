// ============================================================================
// NL Query Enhancer - Natural language query enhancement with intent & entities
// ============================================================================

import { QueryParser, type ParsedQuery } from './query-parser';

export type QueryIntent = 'informational' | 'navigational' | 'action';

export interface ExtractedEntity {
  type: 'person' | 'project' | 'topic';
  value: string;
}

export interface EnhancedQuery extends ParsedQuery {
  intent: QueryIntent;
  entities: ExtractedEntity[];
  originalQuery: string;
}

const NAVIGATIONAL_PATTERNS: RegExp[] = [
  /\b(go to|open|show me|find|navigate to|take me to)\b/i,
  /\b(where is|where are)\b/i,
];

const ACTION_PATTERNS: RegExp[] = [
  /\b(create|delete|update|edit|move|send|share|upload|download|cancel|approve)\b/i,
  /\b(what changed|what's new|what happened)\b/i,
  /\bsince\s+(yesterday|last|today|this)\b/i,
];

const PROJECT_PATTERNS: RegExp[] = [
  /\babout\s+[Pp]roject\s+([A-Z][a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)(?:\s+and|\s+or|$)/,
  /\b[Pp]roject\s+([A-Z][a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)(?:\s+and|\s+or|$)/,
  /\brelated\s+to\s+([A-Z][a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)(?:\s+and|\s+or|$)/,
];

const PERSON_PATTERNS: RegExp[] = [
  /\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\b/,
];

const TOPIC_PATTERNS: RegExp[] = [
  /\babout\s+(\S+(?:\s+\S+)*)(?:\s+from|\s+by|\s+since|\s+in\s|$)/i,
  /\bregarding\s+(\S+(?:\s+\S+)*)(?:\s+from|\s+by|\s+since|\s+in\s|$)/i,
  /\brelated\s+to\s+(\S+(?:\s+\S+)*)(?:\s+from|\s+by|\s+since|\s+in\s|$)/i,
];

/**
 * NLQueryEnhancer - Wraps QueryParser with intent detection and entity extraction
 *
 * Enhances natural language queries with:
 * - Intent classification (informational, navigational, action)
 * - Entity extraction (person names, project names, topic clusters)
 * - Full QueryParser output (type, keywords, filters, dateRange)
 */
export class NLQueryEnhancer {
  private readonly queryParser: QueryParser;

  constructor(queryParser?: QueryParser) {
    this.queryParser = queryParser ?? new QueryParser();
  }

  enhance(query: string): EnhancedQuery {
    const parsed = this.queryParser.parse(query);
    const intent = this.detectIntent(query);
    const entities = this.extractEntities(query);

    return {
      ...parsed,
      intent,
      entities,
      originalQuery: query,
    };
  }

  private detectIntent(query: string): QueryIntent {
    for (const pattern of ACTION_PATTERNS) {
      if (pattern.test(query)) {
        return 'action';
      }
    }

    for (const pattern of NAVIGATIONAL_PATTERNS) {
      if (pattern.test(query)) {
        return 'navigational';
      }
    }

    return 'informational';
  }

  private extractEntities(query: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const seen = new Set<string>();

    // Guard against excessively long inputs to prevent regex performance issues
    if (query.length > 1000) {
      return entities;
    }

    // Extract project names
    for (const pattern of PROJECT_PATTERNS) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
        if (value.length > 1 && !seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
          entities.push({ type: 'project', value });
        }
      }
    }

    // Extract person names
    for (const pattern of PERSON_PATTERNS) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
        if (value.length > 1 && !seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
          entities.push({ type: 'person', value });
        }
      }
    }

    // Extract topics (only if no project already found from same phrase)
    for (const pattern of TOPIC_PATTERNS) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
        if (value.length > 2 && !seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
          entities.push({ type: 'topic', value });
        }
      }
    }

    return entities;
  }
}
