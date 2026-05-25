// ============================================================================
// QuantEdits - Template Browser
// Categories, search, filter by aspect ratio/duration, preview, use template
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

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

interface TemplateBrowserProps {
  userId: string;
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
  onSaveAsTemplate: (id: string) => void;
}> = ({ template, onUse, onPreview, onSaveAsTemplate }) => {
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
            <div className="hover-preview">
              <video src={template.previewUrl} autoPlay muted loop className="preview-video" />
            </div>
            <div className="hover-actions">
              <button className="use-btn" onClick={() => onUse(template.id)}>Use Template</button>
              <button className="preview-btn" onClick={() => onPreview(template)}>Preview</button>
            </div>
          </div>
        )}
      </div>
      <div className="template-info">
        <h4 className="template-title">{template.title}</h4>
        <p className="template-desc">{template.description}</p>
        <div className="template-meta">
          <span className="template-category">{template.category}</span>
          <span className="template-rating">{'★'.repeat(Math.round(template.rating))}</span>
          <span className="template-uses">{template.uses.toLocaleString()} uses</span>
        </div>
        <div className="template-tags">
          {template.tags.slice(0, 3).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        <div className="template-colors">
          {template.colors.map((color, i) => (
            <div key={i} className="color-dot" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    </div>
  );
};

const TemplateBrowser: React.FC<TemplateBrowserProps> = ({ userId }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [selectedRatio, setSelectedRatio] = useState<string>('all');
  const [selectedDuration, setSelectedDuration] = useState(0);
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'rating'>('popular');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<Set<string>>(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveCategory, setSaveCategory] = useState('social-media');

  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      try {
        const categories = ['social-media', 'marketing', 'education', 'entertainment'];
        const ratios: Template['aspectRatio'][] = ['16:9', '9:16', '1:1', '4:5'];
        const mockTemplates: Template[] = Array.from({ length: 32 }, (_, i) => ({
          id: `tmpl-${i}`,
          title: `${['Trendy Reel', 'Product Showcase', 'Tutorial Intro', 'Event Promo', 'Story Template', 'Ad Creative', 'Slideshow', 'Quote Card'][i % 8]} ${Math.floor(i / 8) + 1}`,
          description: `Professional ${categories[i % 4]} template with animations and transitions`,
          thumbnail: `/templates/thumb-${i}.jpg`,
          previewUrl: `/templates/preview-${i}.mp4`,
          category: categories[i % 4],
          subcategory: ['Instagram', 'YouTube', 'TikTok', 'Facebook'][i % 4],
          aspectRatio: ratios[i % 4],
          duration: [15, 30, 45, 60, 90][i % 5],
          uses: Math.floor(Math.random() * 50000) + 100,
          rating: 3.5 + Math.random() * 1.5,
          creator: ['QuantTeam', 'ProDesigner', 'CreativeStudio', 'MediaPro'][i % 4],
          tags: [['trending', 'modern'], ['business', 'clean'], ['educational', 'clear'], ['fun', 'dynamic']][i % 4],
          isPremium: i % 5 === 0,
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          colors: [`#${Math.floor(Math.random() * 16777215).toString(16)}`, `#${Math.floor(Math.random() * 16777215).toString(16)}`, `#${Math.floor(Math.random() * 16777215).toString(16)}`],
          scenes: Math.floor(Math.random() * 8) + 2,
        }));
        setTemplates(mockTemplates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    loadTemplates();
  }, [userId]);

  const filteredTemplates = useMemo(() => {
    let result = templates
      .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
      .filter(t => selectedRatio === 'all' || t.aspectRatio === selectedRatio)
      .filter(t => {
        const dur = DURATION_FILTERS[selectedDuration];
        return t.duration >= dur.min && t.duration <= dur.max;
      })
      .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags.some(tag => tag.includes(searchQuery.toLowerCase())));

    if (sortBy === 'popular') result.sort((a, b) => b.uses - a.uses);
    else if (sortBy === 'newest') result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === 'rating') result.sort((a, b) => b.rating - a.rating);
    return result;
  }, [templates, selectedCategory, selectedRatio, selectedDuration, searchQuery, sortBy]);

  const handleUseTemplate = useCallback((id: string) => {
    console.log(`Using template: ${id}`);
  }, []);

  const handlePreview = useCallback((template: Template) => {
    setPreviewTemplate(template);
  }, []);

  const handleSaveAsTemplate = useCallback(() => {
    if (saveTitle.trim()) {
      console.log(`Saving as template: ${saveTitle} in ${saveCategory}`);
      setShowSaveModal(false);
      setSaveTitle('');
    }
  }, [saveTitle, saveCategory]);

  const handleToggleSave = useCallback((id: string) => {
    setSavedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="templates-loading">
        <div className="loading-spinner" />
        <p>Loading templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="templates-error">
        <h3>Failed to load templates</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="template-browser">
      <header className="browser-header">
        <h1>Templates</h1>
        <div className="header-actions">
          <button className="save-template-btn" onClick={() => setShowSaveModal(true)}>Save as Template</button>
        </div>
      </header>

      <div className="category-tabs">
        {CATEGORIES.map(cat => (
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
            {ASPECT_RATIOS.map(ratio => (
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
          <select value={selectedDuration} onChange={(e) => setSelectedDuration(parseInt(e.target.value))}>
            {DURATION_FILTERS.map((d, i) => (
              <option key={i} value={i}>{d.label}</option>
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
          <div className="empty-state">
            <div className="empty-icon">🎨</div>
            <h3>No templates found</h3>
            <p>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={handleUseTemplate}
              onPreview={handlePreview}
              onSaveAsTemplate={() => handleToggleSave(template.id)}
            />
          ))
        )}
      </div>

      {previewTemplate && (
        <div className="preview-modal-overlay" onClick={() => setPreviewTemplate(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h2>{previewTemplate.title}</h2>
              <button className="close-btn" onClick={() => setPreviewTemplate(null)}>X</button>
            </div>
            <div className="preview-content">
              <video src={previewTemplate.previewUrl} autoPlay loop className="preview-full-video" controls />
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
              <button className="use-btn" onClick={() => { handleUseTemplate(previewTemplate.id); setPreviewTemplate(null); }}>Use This Template</button>
              <button className="save-btn" onClick={() => handleToggleSave(previewTemplate.id)}>
                {savedTemplates.has(previewTemplate.id) ? 'Saved ★' : 'Save ☆'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="save-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="save-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Save as Template</h2>
            <div className="save-form">
              <div className="form-field">
                <label>Template Name</label>
                <input type="text" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="My Template" />
              </div>
              <div className="form-field">
                <label>Category</label>
                <select value={saveCategory} onChange={(e) => setSaveCategory(e.target.value)}>
                  {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button onClick={() => setShowSaveModal(false)}>Cancel</button>
                <button className="save-confirm-btn" onClick={handleSaveAsTemplate} disabled={!saveTitle.trim()}>Save Template</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateBrowser;
