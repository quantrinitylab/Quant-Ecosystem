// ============================================================================
// QuantEdits - Template Browser
// Categories, search, filter by aspect ratio/duration, preview, use template
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { useTemplates } from '../hooks/useTemplates';
import { PageTransition } from '../components/PageTransition';

interface Template {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  previewUrl: string;
  category: string;
  subcategory: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  duration: number;
  uses: number;
  rating: number;
  creator: string;
  tags: string[];
  isPremium: boolean;
  createdAt: string;
  colors: string[];
  scenes: number;
}

type Category = 'all' | 'social-media' | 'marketing' | 'education' | 'entertainment';

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'all', label: 'All Templates', icon: '🎯' },
  { id: 'social-media', label: 'Social Media', icon: '📱' },
  { id: 'marketing', label: 'Marketing', icon: '📊' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
];

const ASPECT_RATIOS = ['all', '16:9', '9:16', '1:1', '4:5'] as const;
const DURATION_FILTERS = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '< 15s', min: 0, max: 15 },
  { label: '15-30s', min: 15, max: 30 },
  { label: '30-60s', min: 30, max: 60 },
  { label: '> 60s', min: 60, max: Infinity },
];

const TemplateCard: React.FC<{
  template: Template;
  onUse: (id: string) => void;
  onPreview: (template: Template) => void;
}> = ({ template, onUse, onPreview }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="template-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="template-thumbnail-wrapper">
        <img src={template.thumbnail} alt={template.title} className="template-thumb" />
        {template.isPremium && <span className="premium-badge">PRO</span>}
        <span className="ratio-badge">{template.aspectRatio}</span>
        <span className="duration-badge">{template.duration}s</span>
        {isHovered && (
          <div className="template-hover-overlay">
            <div className="hover-actions">
              <button className="use-btn" onClick={() => onUse(template.id)}>
                Use Template
              </button>
              <button className="preview-btn" onClick={() => onPreview(template)}>
                Preview
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="template-info">
        <h4 className="template-title">{template.title}</h4>
        <p className="template-desc">{template.description}</p>
        <div className="template-meta">
          <span className="template-category">{template.category}</span>
          <span className="template-rating">{'★'.repeat(Math.round(template.rating || 0))}</span>
          <span className="template-uses">{(template.uses || 0).toLocaleString()} uses</span>
        </div>
        <div className="template-tags">
          {(template.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const TemplateBrowser: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [selectedRatio, setSelectedRatio] = useState<string>('all');
  const [selectedDuration, setSelectedDuration] = useState(0);
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'rating'>('popular');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const categoryParam = selectedCategory === 'all' ? undefined : selectedCategory;
  const {
    data: templatesData,
    isLoading,
    error,
    refetch,
  } = useTemplates(categoryParam, searchQuery || undefined);

  const templates: Template[] = (templatesData ?? []) as unknown as Template[];

  const filteredTemplates = useMemo(() => {
    let result = templates
      .filter((t) => selectedRatio === 'all' || t.aspectRatio === selectedRatio)
      .filter((t) => {
        const dur = DURATION_FILTERS[selectedDuration];
        return (t.duration || 0) >= dur.min && (t.duration || 0) <= dur.max;
      });

    if (sortBy === 'popular') result.sort((a, b) => (b.uses || 0) - (a.uses || 0));
    else if (sortBy === 'newest')
      result.sort(
        (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime(),
      );
    else if (sortBy === 'rating') result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return result;
  }, [templates, selectedRatio, selectedDuration, sortBy]);

  const handleUseTemplate = useCallback((_id: string) => {
    // Template usage would be triggered here in production
  }, []);
  const handlePreview = useCallback((template: Template) => {
    setPreviewTemplate(template);
  }, []);

  if (isLoading) return <LoadingState variant="skeleton" text="Loading templates..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <PageTransition>
      <div className="template-browser">
        <header className="browser-header">
          <h1>Templates</h1>
        </header>

        <div className="category-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span className="cat-icon">{cat.icon}</span>
              <span className="cat-label">{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="filter-group">
            <label>Aspect Ratio</label>
            <div className="ratio-filter">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  className={`ratio-btn ${selectedRatio === ratio ? 'active' : ''}`}
                  onClick={() => setSelectedRatio(ratio)}
                >
                  {ratio === 'all' ? 'All' : ratio}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Duration</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(parseInt(e.target.value))}
            >
              {DURATION_FILTERS.map((d, i) => (
                <option key={i} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="popular">Most Popular</option>
              <option value="newest">Newest</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>
        </div>

        <div className="templates-count">
          <span>{filteredTemplates.length} templates found</span>
        </div>

        <div className="templates-grid">
          {filteredTemplates.length === 0 ? (
            <EmptyState
              title="No templates found"
              description="Try adjusting your filters or search terms"
            />
          ) : (
            filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={handleUseTemplate}
                onPreview={handlePreview}
              />
            ))
          )}
        </div>

        {previewTemplate && (
          <div className="preview-modal-overlay" onClick={() => setPreviewTemplate(null)}>
            <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="preview-header">
                <h2>{previewTemplate.title}</h2>
                <button className="close-btn" onClick={() => setPreviewTemplate(null)}>
                  X
                </button>
              </div>
              <div className="preview-content">
                <video
                  src={previewTemplate.previewUrl}
                  autoPlay
                  loop
                  className="preview-full-video"
                  controls
                />
              </div>
              <div className="preview-details">
                <p>{previewTemplate.description}</p>
                <div className="preview-specs">
                  <span>Aspect Ratio: {previewTemplate.aspectRatio}</span>
                  <span>Duration: {previewTemplate.duration}s</span>
                  <span>Scenes: {previewTemplate.scenes}</span>
                  <span>Creator: {previewTemplate.creator}</span>
                </div>
              </div>
              <div className="preview-actions">
                <button
                  className="use-btn"
                  onClick={() => {
                    handleUseTemplate(previewTemplate.id);
                    setPreviewTemplate(null);
                  }}
                >
                  Use This Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default TemplateBrowser;
