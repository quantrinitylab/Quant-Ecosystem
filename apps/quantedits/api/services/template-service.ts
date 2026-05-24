// ============================================================================
// QuantEdits - Template Service
// Template management, rendering, and variable replacement
// ============================================================================

import type { Template, TemplateCategory, TemplateVariable, Layer } from '../../src/types';

export class TemplateService {
  private templates: Map<string, Template> = new Map();

  constructor() {
    this.seedTemplates();
  }

  private seedTemplates(): void {
    const defaultTemplates: Omit<Template, 'id' | 'createdAt'>[] = [
      { name: 'Instagram Story', description: 'Vertical story template with animated text overlays', category: 'story', thumbnail: '/templates/insta-story.png', width: 1080, height: 1920, duration: 15, layers: [], variables: [], tags: ['instagram', 'story', 'vertical'], isPremium: false, usageCount: 15420, creatorId: 'system' },
      { name: 'YouTube Thumbnail', description: 'Eye-catching thumbnail with bold text and effects', category: 'thumbnail', thumbnail: '/templates/yt-thumb.png', width: 1280, height: 720, layers: [], variables: [], tags: ['youtube', 'thumbnail', 'clickbait'], isPremium: false, usageCount: 28300, creatorId: 'system' },
      { name: 'TikTok Video', description: 'Vertical short video template with trendy transitions', category: 'video', thumbnail: '/templates/tiktok.png', width: 1080, height: 1920, duration: 30, layers: [], variables: [], tags: ['tiktok', 'short', 'vertical', 'trendy'], isPremium: false, usageCount: 42100, creatorId: 'system' },
      { name: 'Presentation Slide', description: 'Clean minimalist presentation slide', category: 'presentation', thumbnail: '/templates/presentation.png', width: 1920, height: 1080, layers: [], variables: [], tags: ['presentation', 'business', 'clean'], isPremium: false, usageCount: 8900, creatorId: 'system' },
      { name: 'Social Media Post', description: 'Square post template for Instagram and Facebook', category: 'social-media', thumbnail: '/templates/social-post.png', width: 1080, height: 1080, layers: [], variables: [], tags: ['instagram', 'facebook', 'square'], isPremium: false, usageCount: 34200, creatorId: 'system' },
      { name: 'Ad Banner', description: 'Web advertisement banner template', category: 'ad', thumbnail: '/templates/ad-banner.png', width: 728, height: 90, layers: [], variables: [], tags: ['ad', 'banner', 'web'], isPremium: true, usageCount: 6700, creatorId: 'system' },
      { name: 'Movie Poster', description: 'Cinematic movie poster with dramatic lighting', category: 'poster', thumbnail: '/templates/movie-poster.png', width: 1080, height: 1600, layers: [], variables: [], tags: ['movie', 'poster', 'cinematic'], isPremium: true, usageCount: 12300, creatorId: 'system' },
      { name: 'Photo Collage', description: 'Multi-photo collage layout with frames', category: 'photo', thumbnail: '/templates/collage.png', width: 1080, height: 1080, layers: [], variables: [], tags: ['photo', 'collage', 'frames'], isPremium: false, usageCount: 19800, creatorId: 'system' },
    ];

    for (const tmpl of defaultTemplates) {
      const id = `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      const template: Template = { ...tmpl, id, createdAt: new Date().toISOString() };
      this.addVariablesToTemplate(template);
      this.templates.set(id, template);
    }
  }

  private addVariablesToTemplate(template: Template): void {
    template.variables = [
      { id: `var_title_${template.id}`, name: 'Title', type: 'text', defaultValue: 'Your Title Here', placeholder: 'Enter title...', layerId: '' },
      { id: `var_subtitle_${template.id}`, name: 'Subtitle', type: 'text', defaultValue: 'Subtitle text', placeholder: 'Enter subtitle...', layerId: '' },
      { id: `var_bg_${template.id}`, name: 'Background Image', type: 'image', defaultValue: '', placeholder: 'Upload background...', layerId: '' },
      { id: `var_color_${template.id}`, name: 'Accent Color', type: 'color', defaultValue: '#6366f1', placeholder: '#000000', layerId: '' },
    ];
  }

  listTemplates(options: { category?: TemplateCategory; search?: string; page?: number; limit?: number; premium?: boolean } = {}): { templates: Template[]; total: number } {
    let templates = Array.from(this.templates.values());
    if (options.category) templates = templates.filter(t => t.category === options.category);
    if (options.premium !== undefined) templates = templates.filter(t => t.isPremium === options.premium);
    if (options.search) {
      const q = options.search.toLowerCase();
      templates = templates.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)));
    }
    templates.sort((a, b) => b.usageCount - a.usageCount);
    const total = templates.length;
    const page = options.page || 1;
    const limit = options.limit || 20;
    return { templates: templates.slice((page - 1) * limit, page * limit), total };
  }

  getTemplate(templateId: string): Template | null {
    return this.templates.get(templateId) || null;
  }

  createCustomTemplate(userId: string, input: { name: string; description: string; category: TemplateCategory; width: number; height: number; duration?: number; layers: Layer[]; variables: TemplateVariable[]; tags: string[] }): Template {
    const template: Template = {
      id: `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      name: input.name,
      description: input.description,
      category: input.category,
      thumbnail: '/templates/custom.png',
      width: input.width,
      height: input.height,
      duration: input.duration,
      layers: input.layers,
      variables: input.variables,
      tags: input.tags,
      isPremium: false,
      usageCount: 0,
      creatorId: userId,
      createdAt: new Date().toISOString(),
    };
    this.templates.set(template.id, template);
    return template;
  }

  deleteTemplate(templateId: string, userId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template || template.creatorId !== userId) return false;
    return this.templates.delete(templateId);
  }

  applyTemplate(template: Template, variables: Record<string, string>): { layers: Layer[]; width: number; height: number; duration?: number } {
    const layers = JSON.parse(JSON.stringify(template.layers)) as Layer[];

    for (const variable of template.variables) {
      const value = variables[variable.id] || variable.defaultValue;
      const layer = layers.find(l => l.id === variable.layerId);
      if (layer && variable.type === 'text' && layer.content.text) {
        layer.content.text.text = value;
      } else if (layer && variable.type === 'image') {
        layer.content.src = value;
      } else if (layer && variable.type === 'color') {
        if (layer.content.text) layer.content.text.color = value;
        if (layer.content.shape) layer.content.shape.fill = value;
      }
    }

    template.usageCount++;
    return { layers, width: template.width, height: template.height, duration: template.duration };
  }

  getCategories(): { category: TemplateCategory; count: number; description: string }[] {
    const categoryCounts = new Map<TemplateCategory, number>();
    for (const t of this.templates.values()) {
      categoryCounts.set(t.category, (categoryCounts.get(t.category) || 0) + 1);
    }

    const descriptions: Record<TemplateCategory, string> = {
      'social-media': 'Templates for Instagram, Facebook, Twitter posts',
      'presentation': 'Professional presentation slides and decks',
      'video': 'Video templates with transitions and effects',
      'photo': 'Photo editing and collage templates',
      'story': 'Vertical story templates for Instagram and QuantNeon',
      'thumbnail': 'Video thumbnails for YouTube and QuantTube',
      'ad': 'Advertising banners and promotional materials',
      'poster': 'Poster and flyer designs',
    };

    return Array.from(categoryCounts.entries()).map(([category, count]) => ({
      category,
      count,
      description: descriptions[category] || '',
    }));
  }

  getTrending(limit: number = 10): Template[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }
}

export const templateService = new TemplateService();
