// ============================================================================
// QuantEdits - Asset Library
// Tabs: Uploads/Stock/Music/Stickers/Fonts, upload, folders, search, favorites
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

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
  projectId: string;
  onDragToTimeline: (asset: Asset) => void;
}

type TabType = 'uploads' | 'stock' | 'music' | 'stickers' | 'fonts';

const AssetLibrary: React.FC<AssetLibraryProps> = ({ projectId, onDragToTimeline }) => {
  const [activeTab, setActiveTab] = useState<TabType>('uploads');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [draggedAsset, setDraggedAsset] = useState<Asset | null>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadAssets = async () => {
      setLoading(true);
      try {
        const types: Asset['type'][] = ['image', 'video', 'audio', 'font', 'sticker'];
        const mockAssets: Asset[] = Array.from({ length: 30 }, (_, i) => ({
          id: `asset-${i}`,
          name: `${['Background', 'Clip', 'Sound', 'Overlay', 'Logo', 'Music'][i % 6]}_${i + 1}.${['jpg', 'mp4', 'mp3', 'png', 'ttf'][i % 5]}`,
          type: types[i % 5],
          url: `/assets/${i}.${['jpg', 'mp4', 'mp3', 'png', 'ttf'][i % 5]}`,
          thumbnail: `/assets/thumb-${i}.jpg`,
          size: Math.floor(Math.random() * 50 + 1) * 1024 * 1024,
          duration: i % 5 === 1 || i % 5 === 2 ? Math.floor(Math.random() * 120) + 5 : undefined,
          dimensions: i % 5 !== 2 && i % 5 !== 4 ? { width: 1920, height: 1080 } : undefined,
          folder: ['All', 'Backgrounds', 'Music', 'Graphics'][i % 4],
          uploadedAt: new Date(Date.now() - i * 3600000).toISOString(),
          isFavorite: i < 5,
          tags: [['nature', 'landscape'], ['urban', 'city'], ['abstract', 'modern'], ['minimal', 'clean']][i % 4],
        }));
        setAssets(mockAssets);
        setFolders([
          { id: 'all', name: 'All Assets', assetCount: 30, color: '#6366f1' },
          { id: 'backgrounds', name: 'Backgrounds', assetCount: 8, color: '#10b981' },
          { id: 'music', name: 'Music', assetCount: 7, color: '#f59e0b' },
          { id: 'graphics', name: 'Graphics', assetCount: 6, color: '#ec4899' },
          { id: 'footage', name: 'Footage', assetCount: 9, color: '#8b5cf6' },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assets');
      } finally {
        setLoading(false);
      }
    };
    loadAssets();
  }, [projectId, activeTab]);

  const filteredAssets = useMemo(() => {
    let result = assets
      .filter(a => {
        if (activeTab === 'uploads') return true;
        if (activeTab === 'stock') return a.type === 'image' || a.type === 'video';
        if (activeTab === 'music') return a.type === 'audio';
        if (activeTab === 'stickers') return a.type === 'sticker';
        if (activeTab === 'fonts') return a.type === 'font';
        return true;
      })
      .filter(a => selectedFolder === 'all' || a.folder.toLowerCase() === selectedFolder)
      .filter(a => !showFavorites || a.isFavorite)
      .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.tags.some(t => t.includes(searchQuery.toLowerCase())));

    if (showRecent) result = result.slice(0, 10);
    if (sortBy === 'date') result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    else if (sortBy === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') result.sort((a, b) => b.size - a.size);
    return result;
  }, [assets, activeTab, selectedFolder, showFavorites, showRecent, searchQuery, sortBy]);

  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const progress = new Map(uploadProgress);
      progress.set(file.name, 0);
      setUploadProgress(progress);
      const interval = setInterval(() => {
        setUploadProgress(prev => {
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
  }, [uploadProgress]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDragStart = useCallback((asset: Asset) => {
    setDraggedAsset(asset);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedAsset) {
      onDragToTimeline(draggedAsset);
      setDraggedAsset(null);
    }
  }, [draggedAsset, onDragToTimeline]);

  const handleToggleFavorite = useCallback((id: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, isFavorite: !a.isFavorite } : a));
  }, []);

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) {
      setFolders(prev => [...prev, { id: newFolderName.toLowerCase(), name: newFolderName, assetCount: 0, color: '#64748b' }]);
      setNewFolderName('');
      setShowNewFolderInput(false);
    }
  }, [newFolderName]);

  const handleDeleteAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  if (loading) {
    return (
      <div className="assets-loading">
        <div className="loading-spinner" />
        <p>Loading assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="assets-error">
        <h3>Failed to load assets</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="asset-library">
      <div className="library-tabs">
        {([
          { id: 'uploads' as TabType, label: 'Uploads', icon: '📁' },
          { id: 'stock' as TabType, label: 'Stock', icon: '🖼' },
          { id: 'music' as TabType, label: 'Music', icon: '🎵' },
          { id: 'stickers' as TabType, label: 'Stickers', icon: '✨' },
          { id: 'fonts' as TabType, label: 'Fonts', icon: '🔤' },
        ]).map(tab => (
          <button key={tab.id} className={`lib-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        ref={dropZoneRef}
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-content">
          <div className="upload-icon">&#8682;</div>
          <p>Drop files here or click to upload</p>
          <span className="upload-formats">MP4, MOV, JPG, PNG, MP3, WAV, GIF, SVG</span>
        </div>
        <input ref={fileInputRef} type="file" multiple accept="video/*,image/*,audio/*,.ttf,.otf,.woff" hidden onChange={(e) => handleFileUpload(e.target.files)} />
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
          <button className={`filter-btn ${showRecent ? 'active' : ''}`} onClick={() => { setShowRecent(!showRecent); setShowFavorites(false); }}>Recent</button>
          <button className={`filter-btn ${showFavorites ? 'active' : ''}`} onClick={() => { setShowFavorites(!showFavorites); setShowRecent(false); }}>Favorites</button>
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
          {folders.map(folder => (
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
              <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
              <button onClick={handleCreateFolder}>+</button>
            </div>
          ) : (
            <button className="add-folder-btn" onClick={() => setShowNewFolderInput(true)}>+ New Folder</button>
          )}
        </div>
      </div>

      <div className={`assets-${viewMode}`}>
        {filteredAssets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>No assets found</h3>
            <p>{showFavorites ? 'No favorites yet' : 'Upload files or browse stock media'}</p>
          </div>
        ) : (
          filteredAssets.map(asset => (
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
                  <span className="asset-duration">{Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}</span>
                )}
                {asset.type === 'audio' && (
                  <div className="audio-waveform">♪</div>
                )}
              </div>
              <div className="asset-info">
                <span className="asset-name" title={asset.name}>{asset.name}</span>
                <span className="asset-size">{formatSize(asset.size)}</span>
              </div>
              <div className="asset-actions">
                <button className="fav-btn" onClick={() => handleToggleFavorite(asset.id)}>
                  {asset.isFavorite ? '★' : '☆'}
                </button>
                <button className="delete-btn" onClick={() => handleDeleteAsset(asset.id)}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AssetLibrary;
