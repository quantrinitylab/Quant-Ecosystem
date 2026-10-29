// ============================================================================
// QuantEdits - Asset Library Panel
// Tabbed panel: Media, Music, Templates, Stickers, Effects, Transitions
//
// P0-3: the Media/Music tabs render the caller's REAL assets via useAssets
// (this panel previously rendered a hard-coded MOCK_ASSETS table). The
// Templates/Stickers/Effects/Transitions tabs are catalogue surfaces owned
// by other units — until those land they show an honest empty state, never
// mock rows. P0-5: mounted in the editor as the collapsible asset panel
// (the assets page's same-named component was renamed AssetsPageLibrary,
// so this shared panel is the only `AssetLibrary` in the app).
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { useAssets } from '../hooks/useAssets';
import type { ServerAsset } from '../services/api-client';

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
  /** When given, the panel shows only this project's assets. */
  projectId?: string;
}

function toAssetItem(asset: ServerAsset): AssetItem {
  return {
    id: asset.id,
    name: asset.filename,
    thumbnailUrl: asset.url ?? '',
    size: asset.size,
    type: asset.type,
  };
}

const TABS: { id: AssetTab; label: string; icon: string }[] = [
  { id: 'media', label: 'Media', icon: '\u{1F3AC}' },
  { id: 'music', label: 'Music', icon: '\u{1F3B5}' },
  { id: 'templates', label: 'Templates', icon: '\u{1F4CB}' },
  { id: 'stickers', label: 'Stickers', icon: '\u{1F600}' },
  { id: 'effects', label: 'Effects', icon: '\u2728' },
  { id: 'transitions', label: 'Transitions', icon: '\u{1F504}' },
];

const AssetLibrary: React.FC<AssetLibraryProps> = ({ onAssetSelect, onAssetAdd, projectId }) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('media');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);

  // Real data (P0-3): the caller's assets from GET /assets. The backend
  // `category` filter matches asset `type` verbatim, so tab bucketing
  // (media = video+image, music = audio) happens here, client-side.
  const { data: serverAssets } = useAssets(undefined, undefined, projectId);

  const assets = useMemo<AssetItem[]>(() => {
    const all = (serverAssets ?? []).map(toAssetItem);
    if (activeTab === 'media') return all.filter((a) => a.type === 'video' || a.type === 'image');
    if (activeTab === 'music') return all.filter((a) => a.type === 'audio');
    return []; // catalogue tabs: honest empty state until their units land
  }, [serverAssets, activeTab]);

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
                {asset.thumbnailUrl && asset.type === 'video' ? (
                  <video src={asset.thumbnailUrl} preload="metadata" muted aria-label={asset.name} />
                ) : asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt={asset.name} loading="lazy" />
                ) : (
                  // PENDING upload or storage unconfigured: no URL exists —
                  // show a neutral tile, never a placeholder image URL.
                  <div className="asset-thumb-missing" aria-hidden="true">
                    {asset.type === 'audio' ? '\u{1F3B5}' : asset.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}'}
                  </div>
                )}
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
            <p>No items yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetLibrary;
