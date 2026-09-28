// ============================================================================
// QuantEdits - Asset Library
// Tabs: Uploads/Stock/Music/Stickers/Fonts, upload, folders, search, favorites
// ============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useAssets } from '../hooks/useAssets';
import { PageTransition } from '../components/PageTransition';

interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'font' | 'sticker';
  url: string;
  thumbnail: string;
  size: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  folder: string;
  uploadedAt: string;
  isFavorite: boolean;
  tags: string[];
}

interface Folder {
  id: string;
  name: string;
  assetCount: number;
  color: string;
}

interface AssetLibraryProps {
  projectId?: string;
  onDragToTimeline?: (asset: Asset) => void;
}

type TabType = 'uploads' | 'stock' | 'music' | 'stickers' | 'fonts';

const AssetLibrary: React.FC<AssetLibraryProps> = ({ projectId, onDragToTimeline }) => {
  const [activeTab, setActiveTab] = useState<TabType>('uploads');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [draggedAsset, setDraggedAsset] = useState<Asset | null>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folders, setFolders] = useState<Folder[]>([
    { id: 'all', name: 'All Assets', assetCount: 0, color: '#6366f1' },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data: assetsData, isLoading, error, refetch } = useAssets(activeTab, searchQuery);

  const assets: Asset[] = (assetsData ?? []) as unknown as Asset[];

  const filteredAssets = useMemo(() => {
    let result = assets
      .filter((a) => {
        if (activeTab === 'uploads') return true;
        if (activeTab === 'stock') return a.type === 'image' || a.type === 'video';
        if (activeTab === 'music') return a.type === 'audio';
        if (activeTab === 'stickers') return a.type === 'sticker';
        if (activeTab === 'fonts') return a.type === 'font';
        return true;
      })
      .filter((a) => selectedFolder === 'all' || a.folder?.toLowerCase() === selectedFolder)
      .filter((a) => !showFavorites || a.isFavorite)
      .filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.tags && a.tags.some((t) => t.includes(searchQuery.toLowerCase()))),
      );

    if (showRecent) result = result.slice(0, 10);
    if (sortBy === 'date')
      result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    else if (sortBy === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') result.sort((a, b) => b.size - a.size);
    return result;
  }, [assets, activeTab, selectedFolder, showFavorites, showRecent, searchQuery, sortBy]);

  const handleFileUpload = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        const progress = new Map(uploadProgress);
        progress.set(file.name, 0);
        setUploadProgress(progress);
        const interval = setInterval(() => {
          setUploadProgress((prev) => {
            const next = new Map(prev);
            const current = next.get(file.name) || 0;
            if (current >= 100) {
              clearInterval(interval);
              next.delete(file.name);
              return next;
            }
            next.set(file.name, current + 10);
            return next;
          });
        }, 200);
      });
    },
    [uploadProgress],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload],
  );

  const handleDragStart = useCallback((asset: Asset) => {
    setDraggedAsset(asset);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedAsset && onDragToTimeline) {
      onDragToTimeline(draggedAsset);
      setDraggedAsset(null);
    }
  }, [draggedAsset, onDragToTimeline]);

  const handleToggleFavorite = useCallback((_id: string) => {
    // Optimistic toggle - would need mutation in production
  }, []);

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) {
      setFolders((prev) => [
        ...prev,
        { id: newFolderName.toLowerCase(), name: newFolderName, assetCount: 0, color: '#64748b' },
      ]);
      setNewFolderName('');
      setShowNewFolderInput(false);
    }
  }, [newFolderName]);

  const handleDeleteAsset = useCallback((_id: string) => {
    // Delete operation would be triggered here in production
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  if (isLoading) {
    return <LoadingState variant="skeleton" text="Loading assets..." />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />;
  }

  return (
    <PageTransition>
      <div className="asset-library">
        <div className="library-tabs">
          {[
            { id: 'uploads' as TabType, label: 'Uploads', icon: '📁' },
            { id: 'stock' as TabType, label: 'Stock', icon: '🖼' },
            { id: 'music' as TabType, label: 'Music', icon: '🎵' },
            { id: 'stickers' as TabType, label: 'Stickers', icon: '✨' },
            { id: 'fonts' as TabType, label: 'Fonts', icon: '🔤' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`lib-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div
          ref={dropZoneRef}
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-content">
            <div className="upload-icon">&#8682;</div>
            <p>Drop files here or click to upload</p>
            <span className="upload-formats">MP4, MOV, JPG, PNG, MP3, WAV, GIF, SVG</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*,.ttf,.otf,.woff"
            hidden
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>

        {uploadProgress.size > 0 && (
          <div className="upload-progress-list">
            {Array.from(uploadProgress.entries()).map(([name, progress]) => (
              <div key={name} className="upload-progress-item">
                <span className="upload-name">{name}</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-percent">{progress}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="library-toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="quick-filters">
            <button
              className={`filter-btn ${showRecent ? 'active' : ''}`}
              onClick={() => {
                setShowRecent(!showRecent);
                setShowFavorites(false);
              }}
            >
              Recent
            </button>
            <button
              className={`filter-btn ${showFavorites ? 'active' : ''}`}
              onClick={() => {
                setShowFavorites(!showFavorites);
                setShowRecent(false);
              }}
            >
              Favorites
            </button>
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Newest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </div>

        <div className="library-sidebar">
          <h4>Folders</h4>
          <div className="folder-list">
            {folders.map((folder) => (
              <button
                key={folder.id}
                className={`folder-item ${selectedFolder === folder.id ? 'active' : ''}`}
                onClick={() => setSelectedFolder(folder.id)}
              >
                <span className="folder-color" style={{ backgroundColor: folder.color }} />
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.assetCount}</span>
              </button>
            ))}
            {showNewFolderInput ? (
              <div className="new-folder-input">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <button onClick={handleCreateFolder}>+</button>
              </div>
            ) : (
              <button className="add-folder-btn" onClick={() => setShowNewFolderInput(true)}>
                + New Folder
              </button>
            )}
          </div>
        </div>

        <div className="assets-grid">
          {filteredAssets.length === 0 ? (
            <EmptyState
              title="No assets found"
              description={
                showFavorites ? 'No favorites yet' : 'Upload files or browse stock media'
              }
            />
          ) : (
            filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="asset-item"
                draggable
                onDragStart={() => handleDragStart(asset)}
                onDragEnd={handleDragEnd}
              >
                <div className="asset-thumbnail">
                  <img src={asset.thumbnail} alt={asset.name} />
                  {asset.type === 'video' && asset.duration && (
                    <span className="asset-duration">
                      {Math.floor(asset.duration / 60)}:
                      {(asset.duration % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                  {asset.type === 'audio' && <div className="audio-waveform">♪</div>}
                </div>
                <div className="asset-info">
                  <span className="asset-name" title={asset.name}>
                    {asset.name}
                  </span>
                  <span className="asset-size">{formatSize(asset.size)}</span>
                </div>
                <div className="asset-actions">
                  <button className="fav-btn" onClick={() => handleToggleFavorite(asset.id)}>
                    {asset.isFavorite ? '★' : '☆'}
                  </button>
                  <button className="delete-btn" onClick={() => handleDeleteAsset(asset.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default AssetLibrary;
