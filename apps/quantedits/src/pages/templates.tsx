// ============================================================================
// QuantEdits - Templates Page
// Template browser, categories, and preview
// ============================================================================

import type { Template, TemplateCategory } from '../types';

interface TemplatesPageProps {
  templates: Template[];
  categories: { category: TemplateCategory; count: number; description: string }[];
  selectedCategory: TemplateCategory | null;
  searchQuery: string;
  onSelectCategory: (category: TemplateCategory | null) => void;
  onSearch: (query: string) => void;
  onApplyTemplate: (templateId: string) => void;
  onPreview: (templateId: string) => void;
}

export function TemplatesPage({ templates, categories, selectedCategory, searchQuery, onSelectCategory, onSearch, onApplyTemplate, onPreview }: TemplatesPageProps) {
  return {
    type: 'div',
    className: 'templates-page',
    children: [
      { type: 'header', children: [
        { type: 'h1', text: 'Templates' },
        { type: 'input', inputType: 'search', placeholder: 'Search templates...', value: searchQuery, onChange: onSearch },
      ]},
      { type: 'nav', className: 'category-nav', children: [
        { type: 'button', text: 'All', className: selectedCategory === null ? 'active' : '', onClick: () => onSelectCategory(null) },
        ...categories.map(cat => ({
          type: 'button',
          text: `${cat.category} (${cat.count})`,
          className: selectedCategory === cat.category ? 'active' : '',
          onClick: () => onSelectCategory(cat.category),
        })),
      ]},
      { type: 'div', className: 'templates-grid', children: templates.map(template => ({
        type: 'div',
        className: 'template-card',
        children: [
          { type: 'div', className: 'template-thumbnail', style: { backgroundImage: `url(${template.thumbnail})` }, children: [
            template.isPremium ? { type: 'span', className: 'premium-badge', text: 'PRO' } : null,
          ]},
          { type: 'h3', text: template.name },
          { type: 'p', text: template.description },
          { type: 'div', className: 'template-meta', children: [
            { type: 'span', text: `${template.width}x${template.height}` },
            { type: 'span', text: `${template.usageCount.toLocaleString()} uses` },
          ]},
          { type: 'div', className: 'template-actions', children: [
            { type: 'button', text: 'Preview', onClick: () => onPreview(template.id) },
            { type: 'button', text: 'Use Template', onClick: () => onApplyTemplate(template.id), className: 'btn-primary' },
          ]},
        ],
      }))},
    ],
  };
}

export default TemplatesPage;
