// ============================================================================
// QuantEdits - Templates Controller
// Business logic for template management
// ============================================================================

import { templateService } from '../services/template-service';
import type { Template, TemplateCategory, TemplateVariable, Layer } from '../../src/types';

export class TemplatesController {
  listTemplates(category?: TemplateCategory, search?: string, page?: number, limit?: number) {
    return templateService.listTemplates({ category, search, page, limit });
  }

  getTemplate(id: string): Template | null {
    return templateService.getTemplate(id);
  }

  createCustomTemplate(userId: string, input: { name: string; description: string; category: TemplateCategory; width: number; height: number; duration?: number; layers: Layer[]; variables: TemplateVariable[]; tags: string[] }): Template {
    return templateService.createCustomTemplate(userId, input);
  }

  deleteTemplate(id: string, userId: string): boolean {
    return templateService.deleteTemplate(id, userId);
  }

  applyTemplate(templateId: string, variables: Record<string, string>) {
    const template = templateService.getTemplate(templateId);
    if (!template) return null;
    return templateService.applyTemplate(template, variables);
  }

  getCategories() {
    return templateService.getCategories();
  }

  getTrending(limit?: number) {
    return templateService.getTrending(limit);
  }
}

export const templatesController = new TemplatesController();
