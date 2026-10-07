// ============================================================================
// AI Core - Prompt Registry
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { PromptTemplate } from '../types';

/**
 * Prompt Registry
 *
 * Loads and manages YAML prompt templates from the prompts/ directory.
 * Supports variable interpolation and versioning.
 */
export class PromptRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  private promptsDir: string;

  constructor(promptsDir?: string) {
    this.promptsDir = promptsDir ?? join(import.meta.dirname ?? '.', '../../prompts');
  }

  /**
   * Load a prompt template by feature name and optional version
   */
  loadPrompt(feature: string, version?: string): PromptTemplate {
    // Guard against path traversal: `feature` is interpolated into a filename
    // (`${feature}.yaml`) and read from disk. Restrict it to a safe identifier
    // so a caller passing untrusted input cannot escape the prompts directory.
    if (!/^[a-zA-Z0-9_-]+$/.test(feature)) {
      throw new Error(`Invalid prompt feature name: ${feature}`);
    }
    const cacheKey = version ? `${feature}@${version}` : feature;

    // Return cached if available
    const cached = this.templates.get(cacheKey);
    if (cached) return cached;

    // Load from filesystem
    const filename = `${feature}.yaml`;
    const filePath = join(this.promptsDir, filename);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content) as PromptTemplate;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid prompt template: ${filename}`);
      }

      // If version specified, check it matches
      if (version && parsed.version !== version) {
        throw new Error(`Version mismatch: expected ${version}, got ${parsed.version}`);
      }

      this.templates.set(cacheKey, parsed);
      return parsed;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        throw new Error(`Prompt template not found: ${filename}`);
      }
      throw error;
    }
  }

  /**
   * Interpolate variables in a template string
   */
  interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (key in variables) {
        return variables[key] ?? match;
      }
      return match; // Leave unmatched variables as-is
    });
  }

  /**
   * Load a prompt and interpolate variables in one step
   */
  render(
    feature: string,
    variables: Record<string, string>,
    version?: string,
  ): { systemPrompt: string; userPrompt: string; parameters: PromptTemplate['parameters'] } {
    const template = this.loadPrompt(feature, version);
    return {
      systemPrompt: this.interpolate(template.system_prompt, variables),
      userPrompt: this.interpolate(template.user_template, variables),
      parameters: template.parameters,
    };
  }

  /**
   * Register a template directly (useful for testing)
   */
  register(name: string, template: PromptTemplate): void {
    this.templates.set(name, template);
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templates.clear();
  }

  /**
   * Check if a prompt template exists in cache
   */
  has(feature: string): boolean {
    return this.templates.has(feature);
  }
}
