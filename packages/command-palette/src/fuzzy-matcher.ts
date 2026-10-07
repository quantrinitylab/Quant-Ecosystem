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

  private matchesCharSequence(input: string, target: string): boolean {
    let targetIdx = 0;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]!;
      // Skip spaces in input for multi-word abbreviations
      if (ch === ' ') continue;
      const found = target.indexOf(ch, targetIdx);
      if (found === -1) return false;
      targetIdx = found + 1;
    }
    return true;
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

    // Character-sequence matching: check if each character of input appears in order
    if (score === 0) {
      const nameMatch = this.matchesCharSequence(input, command.name.toLowerCase());
      if (nameMatch) {
        score += 3;
      }

      for (const keyword of command.keywords) {
        if (this.matchesCharSequence(input, keyword.toLowerCase())) {
          score += 2;
          break;
        }
      }

      if (this.matchesCharSequence(input, command.description.toLowerCase())) {
        score += 1;
      }
    }

    return score;
  }
}
