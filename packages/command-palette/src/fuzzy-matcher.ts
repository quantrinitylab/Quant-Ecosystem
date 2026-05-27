// ============================================================================
// Fuzzy Matcher - Ranks commands by relevance to user input
// ============================================================================

import type { Command, MatchedCommand } from './types';
import { CommandRegistry } from './command-registry';

export class FuzzyMatcher {
  private registry: CommandRegistry;

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  match(input: string, limit?: number): MatchedCommand[] {
    const normalizedInput = input.toLowerCase().trim();
    if (normalizedInput.length === 0) {
      return [];
    }

    const commands = this.registry.listAll();
    const scored: MatchedCommand[] = [];

    for (const command of commands) {
      const score = this.computeScore(normalizedInput, command);
      if (score > 0) {
        scored.push({ command, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    if (limit != null && limit > 0) {
      return scored.slice(0, limit);
    }

    return scored;
  }

  private computeScore(input: string, command: Command): number {
    let score = 0;

    // Exact name match
    if (command.name.toLowerCase() === input) {
      score += 10;
    }

    // Name contains input
    if (command.name.toLowerCase().includes(input)) {
      score += 5;
    }

    // Input contains name
    if (input.includes(command.name.toLowerCase())) {
      score += 3;
    }

    // Keyword matching
    for (const keyword of command.keywords) {
      if (keyword.toLowerCase() === input) {
        score += 8;
      } else if (keyword.toLowerCase().includes(input)) {
        score += 4;
      } else if (input.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Category matching
    if (command.category.toLowerCase().includes(input)) {
      score += 2;
    }

    // Description substring
    if (command.description.toLowerCase().includes(input)) {
      score += 1;
    }

    return score;
  }
}
