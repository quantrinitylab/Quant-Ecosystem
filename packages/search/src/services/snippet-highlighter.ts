// ============================================================================
// Snippet Highlighter - Produces highlighted snippets with <mark> tags
// ============================================================================

export interface SnippetHighlightOptions {
  /** Number of characters of context before/after a match in the snippet window */
  contextWindow?: number;
  /** Maximum snippet length */
  maxSnippetLength?: number;
  /** Tag to wrap matched terms (default: 'mark') */
  highlightTag?: string;
}

export interface HighlightedSnippet {
  text: string;
  matchCount: number;
}

const DEFAULT_CONTEXT_WINDOW = 80;
const DEFAULT_MAX_SNIPPET_LENGTH = 300;
const DEFAULT_HIGHLIGHT_TAG = 'mark';

/**
 * SnippetHighlighter - Takes raw document text + query terms and produces
 * highlighted snippets with configurable context window size.
 *
 * Uses <mark> tags for highlighting. Includes logic to find the best snippet
 * window around matched terms.
 */
export class SnippetHighlighter {
  private readonly contextWindow: number;
  private readonly maxSnippetLength: number;
  private readonly highlightTag: string;

  constructor(options?: SnippetHighlightOptions) {
    this.contextWindow = options?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    this.maxSnippetLength = options?.maxSnippetLength ?? DEFAULT_MAX_SNIPPET_LENGTH;
    this.highlightTag = options?.highlightTag ?? DEFAULT_HIGHLIGHT_TAG;
  }

  /**
   * Highlight query terms in text and return the best snippet window.
   */
  highlight(text: string, queryTerms: string[]): HighlightedSnippet {
    if (!text || queryTerms.length === 0) {
      return { text: text ? text.slice(0, this.maxSnippetLength) : '', matchCount: 0 };
    }

    const normalizedTerms = queryTerms.map((t) => t.trim()).filter((t) => t.length > 0);

    if (normalizedTerms.length === 0) {
      return { text: text.slice(0, this.maxSnippetLength), matchCount: 0 };
    }

    // Find all match positions
    const matches = this.findMatches(text, normalizedTerms);

    if (matches.length === 0) {
      return { text: text.slice(0, this.maxSnippetLength), matchCount: 0 };
    }

    // Select best snippet window
    const window = this.selectBestWindow(text, matches);

    // Extract snippet and apply highlighting
    const snippet = this.extractSnippet(text, window.start, window.end);
    const highlighted = this.applyHighlighting(snippet, normalizedTerms);

    return { text: highlighted, matchCount: matches.length };
  }

  private findMatches(text: string, terms: string[]): Array<{ start: number; end: number }> {
    const matches: Array<{ start: number; end: number }> = [];
    const textLower = text.toLowerCase();

    for (const term of terms) {
      const termLower = term.toLowerCase();
      let searchFrom = 0;

      while (searchFrom < textLower.length) {
        const idx = textLower.indexOf(termLower, searchFrom);
        if (idx === -1) break;
        matches.push({ start: idx, end: idx + term.length });
        searchFrom = idx + 1;
      }
    }

    // Sort by position
    matches.sort((a, b) => a.start - b.start);
    return matches;
  }

  private selectBestWindow(
    text: string,
    matches: Array<{ start: number; end: number }>,
  ): { start: number; end: number } {
    // Score each possible window by how many matches it contains
    let bestStart = 0;
    let bestEnd = Math.min(this.maxSnippetLength, text.length);
    let bestScore = 0;

    for (const match of matches) {
      const windowStart = Math.max(0, match.start - this.contextWindow);
      const windowEnd = Math.min(text.length, windowStart + this.maxSnippetLength);

      // Count matches within this window
      let score = 0;
      for (const m of matches) {
        if (m.start >= windowStart && m.end <= windowEnd) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestStart = windowStart;
        bestEnd = windowEnd;
      }
    }

    return { start: bestStart, end: bestEnd };
  }

  private extractSnippet(text: string, start: number, end: number): string {
    let snippet = text.slice(start, end);

    // Add ellipsis if we're not at the boundaries
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < text.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }

  private applyHighlighting(snippet: string, terms: string[]): string {
    // HTML-escape the source text to prevent XSS
    const escaped = this.escapeHtml(snippet);

    // Escape special regex characters in terms
    const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // Build a single regex that matches any term (case-insensitive)
    const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

    const openTag = `<${this.highlightTag}>`;
    const closeTag = `</${this.highlightTag}>`;

    return escaped.replace(pattern, `${openTag}$1${closeTag}`);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
