import type { PrismaClient, EmailTemplate } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface CreateTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
  shortcut?: string;
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  bodyHtml?: string;
  shortcut?: string | null;
}

export interface RenderedTemplate {
  subject: string;
  bodyHtml: string;
}

/**
 * Normalize a shortcut so that it always starts with a single ':' prefix.
 * Surrounding whitespace is trimmed and any leading ':' characters are
 * collapsed into one. Returns null for empty/whitespace-only input.
 */
function normalizeShortcut(shortcut: string): string | null {
  const trimmed = shortcut.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withoutColons = trimmed.replace(/^:+/, '');
  if (withoutColons.length === 0) {
    return null;
  }
  return `:${withoutColons}`;
}

/**
 * HTML-escape a value before it is substituted into template output so that
 * variable content cannot inject markup into the rendered email.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Replace every {{key}} placeholder in `text` with the HTML-escaped value from
 * `vars`. Placeholders without a matching key are blanked (replaced with '').
 */
function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, key: string): string => {
    const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : undefined;
    if (value === undefined) {
      return '';
    }
    return escapeHtml(value);
  });
}

export class EmailTemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  async createTemplate(userId: string, input: CreateTemplateInput): Promise<EmailTemplate> {
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { userId, name: input.name },
    });

    if (existing) {
      throw createAppError(
        `Template with name "${input.name}" already exists`,
        409,
        'TEMPLATE_NAME_DUPLICATE',
      );
    }

    let shortcut: string | null = null;
    if (input.shortcut !== undefined) {
      shortcut = normalizeShortcut(input.shortcut);
      if (shortcut !== null) {
        const shortcutClash = await this.prisma.emailTemplate.findFirst({
          where: { userId, shortcut },
        });
        if (shortcutClash) {
          throw createAppError(
            `Template with shortcut "${shortcut}" already exists`,
            409,
            'TEMPLATE_SHORTCUT_DUPLICATE',
          );
        }
      }
    }

    return this.prisma.emailTemplate.create({
      data: {
        userId,
        name: input.name,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        shortcut,
      },
    });
  }

  async listTemplates(userId: string): Promise<EmailTemplate[]> {
    return this.prisma.emailTemplate.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async getTemplate(id: string, userId: string): Promise<EmailTemplate> {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });

    if (!template) {
      throw createAppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
    }

    if (template.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return template;
  }

  async updateTemplate(
    id: string,
    userId: string,
    input: UpdateTemplateInput,
  ): Promise<EmailTemplate> {
    const template = await this.getTemplate(id, userId);

    const data: Record<string, unknown> = {};

    if (input.name !== undefined && input.name !== template.name) {
      const clash = await this.prisma.emailTemplate.findFirst({
        where: { userId, name: input.name },
      });
      if (clash) {
        throw createAppError(
          `Template with name "${input.name}" already exists`,
          409,
          'TEMPLATE_NAME_DUPLICATE',
        );
      }
      data.name = input.name;
    }

    if (input.subject !== undefined) {
      data.subject = input.subject;
    }

    if (input.bodyHtml !== undefined) {
      data.bodyHtml = input.bodyHtml;
    }

    if (input.shortcut !== undefined) {
      const normalized = input.shortcut === null ? null : normalizeShortcut(input.shortcut);
      if (normalized !== null && normalized !== template.shortcut) {
        const shortcutClash = await this.prisma.emailTemplate.findFirst({
          where: { userId, shortcut: normalized },
        });
        if (shortcutClash) {
          throw createAppError(
            `Template with shortcut "${normalized}" already exists`,
            409,
            'TEMPLATE_SHORTCUT_DUPLICATE',
          );
        }
      }
      data.shortcut = normalized;
    }

    return this.prisma.emailTemplate.update({
      where: { id },
      data,
    });
  }

  async deleteTemplate(id: string, userId: string): Promise<EmailTemplate> {
    await this.getTemplate(id, userId);
    return this.prisma.emailTemplate.delete({ where: { id } });
  }

  /**
   * Pure helper: render a template's subject and body by substituting
   * {{key}} placeholders with HTML-escaped values from `vars`. Unknown
   * placeholders are blanked. Does not touch the database.
   */
  render(
    template: Pick<EmailTemplate, 'subject' | 'bodyHtml'>,
    vars: Record<string, string> = {},
  ): RenderedTemplate {
    return {
      subject: substitute(template.subject, vars),
      bodyHtml: substitute(template.bodyHtml, vars),
    };
  }

  async findByShortcut(userId: string, shortcut: string): Promise<EmailTemplate | null> {
    const normalized = normalizeShortcut(shortcut);
    if (normalized === null) {
      return null;
    }
    return this.prisma.emailTemplate.findFirst({
      where: { userId, shortcut: normalized },
    });
  }
}
