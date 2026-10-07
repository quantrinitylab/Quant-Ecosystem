// ============================================================================
// Query Parser - Natural language query to structured search parameters
// ============================================================================

import { z } from 'zod';

export const DateRangeSchema = z.object({
  from: z.date(),
  to: z.date(),
});

export type DateRange = z.infer<typeof DateRangeSchema>;

export const ParsedFilterSchema = z.object({
  field: z.string(),
  value: z.string(),
});

export type ParsedFilter = z.infer<typeof ParsedFilterSchema>;

export const ParsedQuerySchema = z.object({
  type: z.string().optional(),
  filters: z.array(ParsedFilterSchema),
  keywords: z.array(z.string()),
  dateRange: z.optional(DateRangeSchema),
});

export type ParsedQuery = z.infer<typeof ParsedQuerySchema>;

const TYPE_PATTERNS: Record<string, RegExp> = {
  email: /\b(emails?)\b/i,
  message: /\b(messages?|chats?|conversations?)\b/i,
  file: /\b(files?|documents?|attachments?)\b/i,
  video: /\b(videos?|recordings?)\b/i,
  post: /\b(posts?|articles?)\b/i,
  user: /\b(users?|people|contacts?|persons?)\b/i,
};

const PERSON_PATTERNS: Array<{ field: string; regex: RegExp }> = [
  { field: 'from', regex: /\bfrom\s+(\w+(?:\s+\w+)?)\b/i },
  { field: 'to', regex: /\bto\s+(\w+(?:\s+\w+)?)\b/i },
  { field: 'by', regex: /\bby\s+(\w+(?:\s+\w+)?)\b/i },
];

const DATE_PATTERNS: Array<{ regex: RegExp; resolve: () => DateRange }> = [
  {
    regex: /\byesterday\b/i,
    resolve: (): DateRange => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: start, to: end };
    },
  },
  {
    regex: /\btoday\b/i,
    resolve: (): DateRange => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { from: start, to: end };
    },
  },
  {
    regex: /\bthis\s+week\b/i,
    resolve: (): DateRange => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { from: start, to: end };
    },
  },
  {
    regex: /\blast\s+week\b/i,
    resolve: (): DateRange => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      return { from: start, to: end };
    },
  },
  {
    regex: /\blast\s+month\b/i,
    resolve: (): DateRange => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: end };
    },
  },
  {
    regex: /\blast\s+(\d+)\s+days?\b/i,
    resolve: (match?: RegExpMatchArray): DateRange => {
      const days = parseInt(match?.[1] ?? '7', 10);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { from: start, to: end };
    },
  },
];

/**
 * QueryParser - Regex-based natural language query parser
 *
 * Extracts type filters, person references, date ranges, and keywords
 * from plain-text search queries.
 */
export class QueryParser {
  parse(query: string): ParsedQuery {
    const filters: ParsedFilter[] = [];
    let remaining = query;
    let type: string | undefined;
    let dateRange: DateRange | undefined;

    // Extract type
    for (const [typeName, pattern] of Object.entries(TYPE_PATTERNS)) {
      if (pattern.test(remaining)) {
        type = typeName;
        remaining = remaining.replace(pattern, '').trim();
        break;
      }
    }

    // Extract date ranges (before person references to avoid overlap)
    for (const pattern of DATE_PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (match) {
        dateRange = (pattern.resolve as (m?: RegExpMatchArray) => DateRange)(match);
        remaining = remaining.replace(pattern.regex, '').trim();
        break;
      }
    }

    // Extract person references
    for (const { field, regex } of PERSON_PATTERNS) {
      const match = remaining.match(regex);
      if (match?.[1]) {
        filters.push({ field, value: match[1].trim() });
        remaining = remaining.replace(regex, '').trim();
      }
    }

    // Remaining words become keywords
    const keywords = remaining
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .filter((w) => !['the', 'a', 'an', 'in', 'on', 'at', 'and', 'or'].includes(w.toLowerCase()));

    return ParsedQuerySchema.parse({
      type,
      filters,
      keywords,
      dateRange,
    });
  }
}
