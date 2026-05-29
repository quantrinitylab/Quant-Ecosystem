import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface A11yViolation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodes: number;
}

/**
 * Runs axe accessibility analysis on the given page and returns
 * formatted violations filtered by impact level.
 */
export async function runAxeAnalysis(
  page: Page,
  options?: { impactFilter?: string[] },
): Promise<{ violations: A11yViolation[]; summary: string }> {
  const impactFilter = options?.impactFilter ?? ['critical', 'serious'];

  const results = await new AxeBuilder({ page }).analyze();

  const filtered = results.violations.filter((v) => impactFilter.includes(v.impact ?? ''));

  const violations: A11yViolation[] = filtered.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    description: v.description,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
  }));

  const summary = formatViolationSummary(violations);

  return { violations, summary };
}

function formatViolationSummary(violations: A11yViolation[]): string {
  if (violations.length === 0) {
    return 'No critical or serious accessibility violations found.';
  }

  const lines = violations.map(
    (v) =>
      `  [${v.impact.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes} element${v.nodes === 1 ? '' : 's'})\n    Help: ${v.helpUrl}`,
  );

  return [
    `Found ${violations.length} accessibility violation${violations.length === 1 ? '' : 's'}:`,
    ...lines,
  ].join('\n');
}
