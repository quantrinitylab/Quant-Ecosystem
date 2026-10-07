// ============================================================================
// Memory Explainer - Generates human-readable explanations
// ============================================================================

import type { MemoryEntry } from './types';

export class MemoryExplainer {
  explain(entry: MemoryEntry): string {
    const parts: string[] = [];

    parts.push(`This memory was created from ${entry.sourceApp}.`);
    parts.push(`Source: ${entry.source}.`);
    parts.push(`Category: ${entry.category}.`);

    if (entry.accessLog.length > 0) {
      const lastAccess = entry.accessLog[entry.accessLog.length - 1];
      if (lastAccess) {
        parts.push(`Last accessed by ${lastAccess.requestingApp} (reason: ${lastAccess.reason}).`);
      }
    }

    if (entry.expiresAt != null) {
      const expiresDate = new Date(entry.expiresAt).toISOString();
      parts.push(`This memory expires on ${expiresDate}.`);
    }

    return parts.join(' ');
  }

  generateCreationExplanation(source: string, sourceApp: string, category: string): string {
    return `Extracted from ${sourceApp} via ${source}. Categorized as ${category} based on content analysis.`;
  }
}
