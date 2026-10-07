import { createAppError } from '@quant/server-core';

// ============================================================================
// Davinci AI Categorized Prompt Template Marketplace & Dynamic Variable Parser
// ============================================================================

export type PromptCategory =
  | 'coding'
  | 'writing'
  | 'marketing'
  | 'sales'
  | 'finance'
  | 'legal'
  | 'hr'
  | 'support';

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category: PromptCategory;
  templateText: string;
  variables: string[]; // Extracted variable keys e.g. ['feature_name', 'platform']
  isCurated?: boolean;
  usageCount: number;
  tags: string[];
  createdAt: string;
}

/**
 * Extracts unique variable placeholders from double-curly-braced template text.
 * E.g. "Generate tests for {{feature_name}} targeting {{platform}}" -> ['feature_name', 'platform']
 */
export function extractTemplateVariables(templateText: string): string[] {
  if (!templateText) return [];
  const regex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  const variables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(templateText)) !== null) {
    const key = match[1]!.trim();
    if (!variables.includes(key)) {
      variables.push(key);
    }
  }
  return variables;
}

/**
 * Replaces all occurrences of {{key}} with values from the variables record.
 * Identifies and returns any required keys not provided in the variables record.
 */
export function substituteTemplateVariables(
  templateText: string,
  variables: Record<string, string>,
): { resultText: string; missingVariables: string[] } {
  if (!templateText) {
    return { resultText: '', missingVariables: [] };
  }

  const allRequiredVariables = extractTemplateVariables(templateText);
  const missingVariables = allRequiredVariables.filter(
    (key) => !(key in variables) || variables[key] === undefined,
  );

  const resultText = templateText.replace(
    /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g,
    (match, key: string) => {
      if (key in variables && variables[key] !== undefined) {
        return variables[key];
      }
      return match;
    },
  );

  return {
    resultText,
    missingVariables,
  };
}

export const CURATED_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'curated-unit-test-generator',
    title: 'Unit Test Generator',
    description:
      'Generate comprehensive unit tests for a specific function or component with high coverage.',
    category: 'coding',
    templateText:
      'Write a comprehensive unit test suite for {{function_or_component_name}} in {{language_or_framework}}. Ensure tests cover happy paths, edge cases, and error handling with emphasis on {{test_runner}}.',
    variables: ['function_or_component_name', 'language_or_framework', 'test_runner'],
    isCurated: true,
    usageCount: 142,
    tags: ['coding', 'testing', 'unit-tests', 'qa'],
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    id: 'curated-bug-postmortem',
    title: 'Bug Postmortem',
    description:
      'Draft a detailed engineering incident postmortem report including root cause and remediation.',
    category: 'coding',
    templateText:
      'Draft an engineering incident postmortem report for {{incident_title}} affecting {{service_name}}. Include timeline, root cause analysis of {{root_cause}}, customer impact, and action items to prevent recurrence.',
    variables: ['incident_title', 'service_name', 'root_cause'],
    isCurated: true,
    usageCount: 89,
    tags: ['coding', 'incident', 'postmortem', 'devops'],
    createdAt: '2026-01-20T10:30:00.000Z',
  },
  {
    id: 'curated-viral-tweet-thread',
    title: 'Viral Tweet Thread',
    description:
      'Create an engaging, hook-driven Twitter/X thread designed to maximize engagement and virality.',
    category: 'marketing',
    templateText:
      'Write a high-converting {{thread_length}}-tweet thread about {{topic}} targeted at {{target_audience}}. Include an irresistible hook in the first tweet, actionable insights, and a strong call-to-action in the conclusion.',
    variables: ['thread_length', 'topic', 'target_audience'],
    isCurated: true,
    usageCount: 235,
    tags: ['marketing', 'twitter', 'social-media', 'copywriting'],
    createdAt: '2026-02-01T12:00:00.000Z',
  },
  {
    id: 'curated-executive-summary',
    title: 'Executive Summary',
    description: 'Condense complex reports and project updates into a concise executive briefing.',
    category: 'writing',
    templateText:
      'Write an executive summary for {{project_or_report_name}} outlining key achievements, current status, strategic risks regarding {{risk_factors}}, and next milestone recommendations for {{executive_stakeholders}}.',
    variables: ['project_or_report_name', 'risk_factors', 'executive_stakeholders'],
    isCurated: true,
    usageCount: 178,
    tags: ['writing', 'executive', 'summary', 'business'],
    createdAt: '2026-02-10T14:15:00.000Z',
  },
  {
    id: 'curated-pnl-breakdown',
    title: 'P&L Breakdown',
    description:
      'Analyze revenue, COGS, and operating expenses to generate financial insights and variance analysis.',
    category: 'finance',
    templateText:
      'Analyze the Profit and Loss statement for {{company_or_division}} covering {{fiscal_period}}. Detail revenue streams, cost drivers in {{major_expense_category}}, gross margins, and EBITDA trajectory.',
    variables: ['company_or_division', 'fiscal_period', 'major_expense_category'],
    isCurated: true,
    usageCount: 94,
    tags: ['finance', 'pnl', 'accounting', 'ebitda'],
    createdAt: '2026-02-15T09:45:00.000Z',
  },
  {
    id: 'curated-nda-review',
    title: 'NDA Review',
    description:
      'Analyze a Non-Disclosure Agreement for one-sided terms, indemnities, and governing law clauses.',
    category: 'legal',
    templateText:
      'Review the Non-Disclosure Agreement between {{disclosing_party}} and {{receiving_party}} under {{governing_jurisdiction}} law. Highlight non-standard terms, confidentiality duration of {{confidentiality_term}}, and potential liabilities.',
    variables: [
      'disclosing_party',
      'receiving_party',
      'governing_jurisdiction',
      'confidentiality_term',
    ],
    isCurated: true,
    usageCount: 112,
    tags: ['legal', 'contracts', 'nda', 'compliance'],
    createdAt: '2026-02-22T16:00:00.000Z',
  },
  {
    id: 'curated-cold-outreach',
    title: 'B2B Cold Outreach',
    description: 'Craft a high-converting B2B cold email pitching value proposition.',
    category: 'sales',
    templateText:
      'Write a compelling 3-sentence B2B cold email to {{prospect_role}} at {{company_name}} proposing {{product_value_prop}} to solve {{pain_point}}.',
    variables: ['prospect_role', 'company_name', 'product_value_prop', 'pain_point'],
    isCurated: true,
    usageCount: 67,
    tags: ['sales', 'cold-email', 'b2b'],
    createdAt: '2026-03-01T11:00:00.000Z',
  },
  {
    id: 'curated-customer-support',
    title: 'Customer Support Ticket Resolution',
    description:
      'Resolve an escalated customer support ticket with empathy and clear action steps.',
    category: 'support',
    templateText:
      'Draft an empathetic customer support reply addressing {{customer_issue}} with product {{product_name}}, offering {{resolution_steps}} and {{compensation_or_goodwill}}.',
    variables: ['customer_issue', 'product_name', 'resolution_steps', 'compensation_or_goodwill'],
    isCurated: true,
    usageCount: 83,
    tags: ['support', 'customer-service', 'resolution'],
    createdAt: '2026-03-05T13:30:00.000Z',
  },
];

let customTemplatesStore: PromptTemplate[] = [];

export function listPromptTemplates(filter?: {
  category?: PromptCategory;
  search?: string;
  tag?: string;
}): PromptTemplate[] {
  let combined = [...CURATED_PROMPT_TEMPLATES, ...customTemplatesStore];

  if (filter?.category) {
    combined = combined.filter((t) => t.category === filter.category);
  }

  if (filter?.tag) {
    const normalizedTag = filter.tag.trim().toLowerCase();
    combined = combined.filter((t) => t.tags.some((tag) => tag.toLowerCase() === normalizedTag));
  }

  if (filter?.search) {
    const q = filter.search.trim().toLowerCase();
    combined = combined.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.templateText.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  return combined;
}

export function createCustomTemplate(
  data: Omit<PromptTemplate, 'id' | 'variables' | 'usageCount' | 'createdAt'>,
): PromptTemplate {
  const variables = extractTemplateVariables(data.templateText);
  const newTemplate: PromptTemplate = {
    id: `template-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: data.title.trim(),
    description: data.description.trim(),
    category: data.category,
    templateText: data.templateText,
    variables,
    isCurated: false,
    usageCount: 0,
    tags: (data.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    createdAt: new Date().toISOString(),
  };

  customTemplatesStore.push(newTemplate);
  return newTemplate;
}

export function incrementTemplateUsage(templateId: string): PromptTemplate | null {
  // Check curated first
  const curated = CURATED_PROMPT_TEMPLATES.find((t) => t.id === templateId);
  if (curated) {
    curated.usageCount += 1;
    return curated;
  }

  // Check custom
  const custom = customTemplatesStore.find((t) => t.id === templateId);
  if (custom) {
    custom.usageCount += 1;
    return custom;
  }

  return null;
}

export function clearTemplatesForTesting(): void {
  customTemplatesStore = [];
  for (const t of CURATED_PROMPT_TEMPLATES) {
    if (t.id === 'curated-unit-test-generator') t.usageCount = 142;
    else if (t.id === 'curated-bug-postmortem') t.usageCount = 89;
    else if (t.id === 'curated-viral-tweet-thread') t.usageCount = 235;
    else if (t.id === 'curated-executive-summary') t.usageCount = 178;
    else if (t.id === 'curated-pnl-breakdown') t.usageCount = 94;
    else if (t.id === 'curated-nda-review') t.usageCount = 112;
    else if (t.id === 'curated-cold-outreach') t.usageCount = 67;
    else if (t.id === 'curated-customer-support') t.usageCount = 83;
    else t.usageCount = 0;
  }
}

// ============================================================================
// Legacy User-Owned Database-Backed PromptTemplateService
// ============================================================================

export interface UserPromptTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptInput {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
}

export interface UpdatePromptInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface ListPromptOptions {
  search?: string;
  category?: string;
  favoritesOnly?: boolean;
}

interface PromptTemplateRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: string;
  tags: unknown;
  isFavorite: boolean;
  usageCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PromptTemplatePrismaClient {
  aiPromptTemplate: {
    findMany: (args: Record<string, unknown>) => Promise<PromptTemplateRow[]>;
    findUnique: (args: { where: { id: string } }) => Promise<PromptTemplateRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<PromptTemplateRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<PromptTemplateRow>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
}

const MAX_TITLE = 200;
const MAX_CONTENT = 100000;
const MAX_TAGS = 20;

export class PromptTemplateService {
  constructor(private readonly prisma: PromptTemplatePrismaClient) {}

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }

  private rowToTemplate(row: PromptTemplateRow): UserPromptTemplate {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      tags: this.toStringArray(row.tags),
      isFavorite: row.isFavorite,
      usageCount: row.usageCount,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const cleaned = tags
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, MAX_TAGS);
    return [...new Set(cleaned)];
  }

  private async getOwned(id: string, userId: string): Promise<PromptTemplateRow> {
    const row = await this.prisma.aiPromptTemplate.findUnique({ where: { id } });
    if (!row) {
      throw createAppError('Prompt not found', 404, 'PROMPT_NOT_FOUND');
    }
    if (row.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }
    return row;
  }

  async list(userId: string, options: ListPromptOptions = {}): Promise<UserPromptTemplate[]> {
    const where: Record<string, unknown> = { userId };
    if (options.category) where['category'] = options.category;
    if (options.favoritesOnly) where['isFavorite'] = true;

    const rows = await this.prisma.aiPromptTemplate.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { updatedAt: 'desc' }],
    });

    let templates = rows.map((row) => this.rowToTemplate(row));

    const query = options.search?.trim().toLowerCase();
    if (query) {
      templates = templates.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.content.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return templates;
  }

  async get(id: string, userId: string): Promise<UserPromptTemplate> {
    return this.rowToTemplate(await this.getOwned(id, userId));
  }

  async create(userId: string, input: CreatePromptInput): Promise<UserPromptTemplate> {
    const title = input.title?.trim();
    const content = input.content?.trim();
    if (!title || !content) {
      throw createAppError('Title and content are required', 400, 'INVALID_PROMPT');
    }
    if (title.length > MAX_TITLE) {
      throw createAppError('Title is too long', 400, 'INVALID_PROMPT');
    }
    if (content.length > MAX_CONTENT) {
      throw createAppError('Content is too long', 400, 'INVALID_PROMPT');
    }

    const row = await this.prisma.aiPromptTemplate.create({
      data: {
        userId,
        title,
        content,
        category: input.category?.trim() || 'general',
        tags: this.normalizeTags(input.tags),
      },
    });
    return this.rowToTemplate(row);
  }

  async update(id: string, userId: string, input: UpdatePromptInput): Promise<UserPromptTemplate> {
    await this.getOwned(id, userId);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title || title.length > MAX_TITLE) {
        throw createAppError('Invalid title', 400, 'INVALID_PROMPT');
      }
      data['title'] = title;
    }
    if (input.content !== undefined) {
      const content = input.content.trim();
      if (!content || content.length > MAX_CONTENT) {
        throw createAppError('Invalid content', 400, 'INVALID_PROMPT');
      }
      data['content'] = content;
    }
    if (input.category !== undefined) data['category'] = input.category.trim() || 'general';
    if (input.tags !== undefined) data['tags'] = this.normalizeTags(input.tags);
    if (input.isFavorite !== undefined) data['isFavorite'] = input.isFavorite;

    const row = await this.prisma.aiPromptTemplate.update({ where: { id }, data });
    return this.rowToTemplate(row);
  }

  async toggleFavorite(id: string, userId: string): Promise<UserPromptTemplate> {
    const current = await this.getOwned(id, userId);
    const row = await this.prisma.aiPromptTemplate.update({
      where: { id },
      data: { isFavorite: !current.isFavorite },
    });
    return this.rowToTemplate(row);
  }

  async recordUsage(id: string, userId: string): Promise<UserPromptTemplate> {
    const current = await this.getOwned(id, userId);
    const row = await this.prisma.aiPromptTemplate.update({
      where: { id },
      data: { usageCount: current.usageCount + 1 },
    });
    return this.rowToTemplate(row);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getOwned(id, userId);
    await this.prisma.aiPromptTemplate.delete({ where: { id } });
  }

  async getCategories(userId: string): Promise<string[]> {
    const rows = await this.prisma.aiPromptTemplate.findMany({ where: { userId } });
    return [...new Set(rows.map((r) => r.category))].sort();
  }
}
