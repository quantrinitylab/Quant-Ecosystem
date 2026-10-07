// ============================================================================
// QuantChat - ARFilters Component
// AR filter selector and preview carousel
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { ARFilter, FilterCategory } from '../types';
import { apiClient } from '../services/api-client';

interface ARFiltersProps {
  onSelect: (filter: ARFilter | null) => void;
  selectedFilter?: ARFilter | null;
}

export const ARFilters: React.FC<ARFiltersProps> = ({ onSelect, selectedFilter }) => {
  const [filters, setFilters] = useState<ARFilter[]>([]);
  const [favorites, setFavorites] = useState<ARFilter[]>([]);
  const [activeTab, setActiveTab] = useState<'trending' | 'favorites' | 'all'>('trending');
  const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null);
  const [loading, setLoading] = useState(true);

  const categories: Array<{ key: FilterCategory; label: string; icon: string }> = [
    { key: 'funny', label: 'Funny', icon: '😂' },
    { key: 'beauty', label: 'Beauty', icon: '✨' },
    { key: 'artistic', label: 'Artistic', icon: '🎨' },
    { key: 'seasonal', label: 'Seasonal', icon: '🎄' },
    { key: 'community', label: 'Community', icon: '👥' },
  ];

  useEffect(() => {
    loadFilters();
  }, [activeTab, activeCategory]);

  const loadFilters = async () => {
    setLoading(true);

    if (activeTab === 'trending') {
      const response = await apiClient.getTrendingFilters();
      if (response.success && response.data) {
        setFilters(response.data);
      }
    } else {
      const response = await apiClient.getFilters({
        category: activeCategory || undefined,
      } as any);
      if (response.success && response.data) {
        setFilters(response.data);
      }
    }

    setLoading(false);
  };

  const handleSelect = (filter: ARFilter) => {
    if (selectedFilter?.id === filter.id) {
      onSelect(null);
    } else {
      onSelect(filter);
    }
  };

  return (
    <div className="ar-filters-panel">
      {/* Tabs */}
      <div className="filter-tabs">
        <button
          className={activeTab === 'trending' ? 'active' : ''}
          onClick={() => setActiveTab('trending')}
        >
          🔥 Trending
        </button>
        <button
          className={activeTab === 'favorites' ? 'active' : ''}
          onClick={() => setActiveTab('favorites')}
        >
          ⭐ Favorites
        </button>
        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
          All
        </button>
      </div>

      {/* Categories */}
      <div className="filter-categories">
        <button className={!activeCategory ? 'active' : ''} onClick={() => setActiveCategory(null)}>
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={activeCategory === cat.key ? 'active' : ''}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Filter grid */}
      <div className="filter-grid">
        {/* No filter option */}
        <div
          className={`filter-item ${!selectedFilter ? 'selected' : ''}`}
          onClick={() => onSelect(null)}
        >
          <div className="filter-thumbnail no-filter">
            <span>✕</span>
          </div>
          <span className="filter-name">None</span>
        </div>

        {loading ? (
          <div className="filters-loading">Loading filters...</div>
        ) : (
          filters.map((filter) => (
            <div
              key={filter.id}
              className={`filter-item ${selectedFilter?.id === filter.id ? 'selected' : ''}`}
              onClick={() => handleSelect(filter)}
            >
              <div className="filter-thumbnail">
                <img src={filter.thumbnailUrl} alt={filter.name} />
                {filter.isTrending && <span className="trending-badge">🔥</span>}
              </div>
              <span className="filter-name">{filter.name}</span>
              <span className="filter-creator">{filter.creatorName}</span>
            </div>
          ))
        )}
      </div>

      {/* Selected filter preview */}
      {selectedFilter && (
        <div className="filter-preview">
          <div className="preview-info">
            <h4>{selectedFilter.name}</h4>
            <p>{selectedFilter.description}</p>
            <div className="preview-stats">
              <span>Used {formatCount(selectedFilter.usageCount)} times</span>
              <span>⭐ {selectedFilter.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return String(count);
}

export default ARFilters;
