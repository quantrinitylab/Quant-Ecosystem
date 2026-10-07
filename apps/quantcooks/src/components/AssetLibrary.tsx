// ============================================================================
// QuantEdits - Asset Library Panel
// Tabbed panel: Media, Music, Templates, Stickers, Effects, Transitions
// ============================================================================

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

type AssetTab = 'media' | 'music' | 'templates' | 'stickers' | 'effects' | 'transitions';

interface AssetItem {
  id: string;
  name: string;
  thumbnailUrl: string;
  duration?: number;
  size?: number;
  type: string;
}

interface AssetLibraryProps {
  onAssetSelect?: (asset: AssetItem) => void;
  onAssetAdd?: (asset: AssetItem) => void;
}

const TABS: { id: AssetTab; label: string; icon: string }[] = [
  { id: 'media', label: 'Media', icon: '\u{1F3AC}' },
  { id: 'music', label: 'Music', icon: '\u{1F3B5}' },
  { id: 'templates', label: 'Templates', icon: '\u{1F4CB}' },
  { id: 'stickers', label: 'Stickers', icon: '\u{1F600}' },
  { id: 'effects', label: 'Effects', icon: '\u2728' },
  { id: 'transitions', label: 'Transitions', icon: '\u{1F504}' },
];

const MOCK_ASSETS: Record<AssetTab, AssetItem[]> = {
  media: [
    {
      id: 'media-1',
      name: 'Sunset Clip',
      thumbnailUrl: '/assets/thumb-sunset.jpg',
      duration: 12,
      size: 45000000,
      type: 'video',
    },
    {
      id: 'media-2',
      name: 'City Timelapse',
      thumbnailUrl: '/assets/thumb-city.jpg',
      duration: 8,
      size: 32000000,
      type: 'video',
    },
    {
      id: 'media-3',
      name: 'Portrait Shot',
      thumbnailUrl: '/assets/thumb-portrait.jpg',
      size: 4500000,
      type: 'image',
    },
    {
      id: 'media-4',
      name: 'Nature B-roll',
      thumbnailUrl: '/assets/thumb-nature.jpg',
      duration: 15,
      size: 58000000,
      type: 'video',
    },
    {
      id: 'media-5',
      name: 'Product Close-up',
      thumbnailUrl: '/assets/thumb-product.jpg',
      size: 3200000,
      type: 'image',
    },
    {
      id: 'media-6',
      name: 'Drone Footage',
      thumbnailUrl: '/assets/thumb-drone.jpg',
      duration: 22,
      size: 95000000,
      type: 'video',
    },
  ],
  music: [
    {
      id: 'music-1',
      name: 'Chill Beats',
      thumbnailUrl: '/assets/thumb-chill.jpg',
      duration: 180,
      type: 'audio',
    },
    {
      id: 'music-2',
      name: 'Upbeat Pop',
      thumbnailUrl: '/assets/thumb-pop.jpg',
      duration: 210,
      type: 'audio',
    },
    {
      id: 'music-3',
      name: 'Ambient Piano',
      thumbnailUrl: '/assets/thumb-piano.jpg',
      duration: 240,
      type: 'audio',
    },
    {
      id: 'music-4',
      name: 'Electronic Drop',
      thumbnailUrl: '/assets/thumb-edm.jpg',
      duration: 195,
      type: 'audio',
    },
  ],
  templates: [
    {
      id: 'tmpl-1',
      name: 'Vlog Intro',
      thumbnailUrl: '/assets/thumb-vlog.jpg',
      duration: 5,
      type: 'template',
    },
    {
      id: 'tmpl-2',
      name: 'Product Showcase',
      thumbnailUrl: '/assets/thumb-showcase.jpg',
      duration: 30,
      type: 'template',
    },
    {
      id: 'tmpl-3',
      name: 'Travel Montage',
      thumbnailUrl: '/assets/thumb-travel.jpg',
      duration: 60,
      type: 'template',
    },
  ],
  stickers: [
    { id: 'stk-1', name: 'Fire', thumbnailUrl: '/assets/sticker-fire.png', type: 'sticker' },
    { id: 'stk-2', name: 'Heart Eyes', thumbnailUrl: '/assets/sticker-heart.png', type: 'sticker' },
    { id: 'stk-3', name: 'Subscribe', thumbnailUrl: '/assets/sticker-sub.png', type: 'sticker' },
    { id: 'stk-4', name: 'Arrow', thumbnailUrl: '/assets/sticker-arrow.png', type: 'sticker' },
    { id: 'stk-5', name: 'Star Burst', thumbnailUrl: '/assets/sticker-star.png', type: 'sticker' },
  ],
  effects: [
    { id: 'fx-1', name: 'Glitch', thumbnailUrl: '/assets/fx-glitch.jpg', type: 'effect' },
    { id: 'fx-2', name: 'VHS', thumbnailUrl: '/assets/fx-vhs.jpg', type: 'effect' },
    { id: 'fx-3', name: 'Blur Out', thumbnailUrl: '/assets/fx-blur.jpg', type: 'effect' },
    { id: 'fx-4', name: 'Color Grade', thumbnailUrl: '/assets/fx-color.jpg', type: 'effect' },
  ],
  transitions: [
    {
      id: 'tr-1',
      name: 'Cross Dissolve',
      thumbnailUrl: '/assets/tr-dissolve.jpg',
      duration: 1,
      type: 'transition',
    },
    {
      id: 'tr-2',
      name: 'Slide Left',
      thumbnailUrl: '/assets/tr-slide.jpg',
      duration: 0.5,
      type: 'transition',
    },
    {
      id: 'tr-3',
      name: 'Zoom In',
      thumbnailUrl: '/assets/tr-zoom.jpg',
      duration: 0.75,
      type: 'transition',
    },
    {
      id: 'tr-4',
      name: 'Wipe',
      thumbnailUrl: '/assets/tr-wipe.jpg',
      duration: 1,
      type: 'transition',
    },
  ],
};

const AssetLibrary: React.FC<AssetLibraryProps> = ({ onAssetSelect, onAssetAdd }) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('media');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);

  const assets = MOCK_ASSETS[activeTab] || [];
  const filteredAssets = searchQuery
    ? assets.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : assets;

  const formatDuration = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  return (
    <div className="asset-library" role="region" aria-label="Asset library">
      {/* Tabs */}
      <div className="asset-tabs" role="tablist" aria-label="Asset categories">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`asset-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="asset-search">
        <input
          className="asset-search-input"
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={`Search ${activeTab}`}
        />
      </div>

      {/* Asset Grid */}
      <div
        className="asset-grid"
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-label={`${activeTab} assets`}
      >
        <AnimatePresence mode="popLayout">
          {filteredAssets.map((asset) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="asset-card"
              onMouseEnter={() => setHoveredAsset(asset.id)}
              onMouseLeave={() => setHoveredAsset(null)}
              onClick={() => onAssetSelect?.(asset)}
              role="button"
              aria-label={`Select ${asset.name}`}
            >
              <div className="asset-thumbnail">
                <img src={asset.thumbnailUrl} alt={asset.name} loading="lazy" />
                {hoveredAsset === asset.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="asset-hover-overlay"
                  >
                    <button
                      className="add-to-timeline-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssetAdd?.(asset);
                      }}
                      aria-label={`Add ${asset.name} to timeline`}
                    >
                      + Add
                    </button>
                  </motion.div>
                )}
                {asset.duration !== undefined && (
                  <span className="asset-duration-badge">{formatDuration(asset.duration)}</span>
                )}
              </div>
              <div className="asset-info">
                <span className="asset-name">{asset.name}</span>
                {asset.size && <span className="asset-size">{formatSize(asset.size)}</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredAssets.length === 0 && (
          <div className="asset-empty">
            <p>No {activeTab} found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetLibrary;
