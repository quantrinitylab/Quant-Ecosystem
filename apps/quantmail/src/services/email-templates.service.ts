// ============================================================================
// QuantMail - Email Templates Service
// Create, manage, and apply email templates with variable substitution
// ============================================================================

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: string;
  createdAt: number;
  updatedAt: number;
}

export class EmailTemplateService {
  private templates: Map<string, EmailTemplate> = new Map();
  private templateCounter = 0;

  create(
    template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt' | 'variables'>,
  ): EmailTemplate {
    this.templateCounter += 1;
    const now = Date.now();
    const variables = this.extractVariables(`${template.subject} ${template.body}`);

    const newTemplate: EmailTemplate = {
      ...template,
      id: `template-${this.templateCounter}`,
      variables,
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  update(id: string, changes: Partial<EmailTemplate>): EmailTemplate | null {
    const existing = this.templates.get(id);
    if (!existing) {
      return null;
    }

    const updated: EmailTemplate = {
      ...existing,
      ...changes,
      id: existing.id, // Prevent id change
      createdAt: existing.createdAt, // Prevent createdAt change
      updatedAt: Date.now(),
    };

    // Recalculate variables if subject or body changed
    if (changes.subject !== undefined || changes.body !== undefined) {
      updated.variables = this.extractVariables(`${updated.subject} ${updated.body}`);
    }

    this.templates.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.templates.delete(id);
  }

  list(category?: string): EmailTemplate[] {
    const all = Array.from(this.templates.values());
    if (category) {
      return all.filter((t) => t.category === category);
    }
    return all;
  }

  apply(
    templateId: string,
    variables: Record<string, string>,
  ): { subject: string; body: string } | null {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.split(placeholder).join(value);
      body = body.split(placeholder).join(value);
    }

    return { subject, body };
  }

  extractVariables(text: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match = regex.exec(text);

    while (match !== null) {
      const varName = match[1];
      if (varName) {
        variables.add(varName);
      }
      match = regex.exec(text);
    }

    return Array.from(variables);
  }
}
