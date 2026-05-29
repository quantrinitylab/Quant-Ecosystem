import type { IntentMatch, ToolDefinition } from '../types.js';

export class IntentRouter {
  private tools: ToolDefinition[];

  constructor(tools: ToolDefinition[]) {
    this.tools = tools;
  }

  route(input: string): IntentMatch[] {
    const lower = input.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 2);
    const matches: IntentMatch[] = [];

    for (const tool of this.tools) {
      let confidence = 0;
      const extractedParams: Record<string, unknown> = {};

      // Check tool name match
      const nameLower = tool.name.toLowerCase();
      if (lower.includes(nameLower)) {
        confidence += 0.5;
      }

      // Check individual name words
      const nameWords = nameLower.split(/\s+/);
      for (const nw of nameWords) {
        if (words.includes(nw)) {
          confidence += 0.15;
        }
      }

      // Check tag matches
      for (const tag of tool.tags) {
        if (words.includes(tag.toLowerCase())) {
          confidence += 0.1;
        }
      }

      // Check description keyword overlap
      const descWords = tool.description.toLowerCase().split(/\s+/);
      let descMatches = 0;
      for (const w of words) {
        if (descWords.includes(w)) {
          descMatches++;
        }
      }
      if (descMatches > 0) {
        confidence += Math.min(descMatches * 0.05, 0.2);
      }

      // Extract parameters from input using schema hints
      for (const [key, schema] of Object.entries(tool.inputSchema)) {
        if (schema.type === 'string') {
          // Look for email-like patterns
          if (key.includes('email') || key.includes('to') || key.includes('recipient')) {
            const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch) {
              extractedParams[key] = emailMatch[0];
              confidence += 0.05;
            }
          }
        }
      }

      if (confidence > 0.1) {
        matches.push({
          toolId: tool.id,
          confidence: Math.min(confidence, 1.0),
          extractedParams,
          appId: tool.appId,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }
}
