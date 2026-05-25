// ============================================================================
// QuantAI - AI Memory Management Page
// Memory items grouped by category, edit/delete per item, privacy levels,
// clear all with confirmation, import from file, search, category counts
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface MemoryItem {
  id: string;
  text: string;
  category: string;
  privacyLevel: 'share' | 'app-only' | 'never';
  createdAt: string;
  source: string;
}

interface MemoryCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const CATEGORIES: MemoryCategory[] = [
  { id: 'personal', name: 'Personal', icon: '👤', description: 'Personal information and preferences' },
  { id: 'work', name: 'Work', icon: '💼', description: 'Work-related context and projects' },
  { id: 'preferences', name: 'Preferences', icon: '⚙️', description: 'Settings and style preferences' },
  { id: 'people', name: 'People', icon: '👥', description: 'Information about contacts and relationships' },
];

const INITIAL_MEMORIES: MemoryItem[] = [
  { id: 'm1', text: 'User prefers TypeScript over JavaScript for all projects', category: 'preferences', privacyLevel: 'share', createdAt: '2024-01-10T10:00:00Z', source: 'Conversation' },
  { id: 'm2', text: 'Lives in San Francisco, works remotely', category: 'personal', privacyLevel: 'app-only', createdAt: '2024-01-08T14:00:00Z', source: 'Conversation' },
  { id: 'm3', text: 'Currently working on a SaaS product for team collaboration', category: 'work', privacyLevel: 'share', createdAt: '2024-01-12T09:00:00Z', source: 'Conversation' },
  { id: 'm4', text: 'Prefers concise responses over long explanations', category: 'preferences', privacyLevel: 'share', createdAt: '2024-01-05T16:00:00Z', source: 'Settings' },
  { id: 'm5', text: 'Uses VS Code with Vim keybindings', category: 'preferences', privacyLevel: 'share', createdAt: '2024-01-07T11:00:00Z', source: 'Conversation' },
  { id: 'm6', text: 'Team lead with 5 direct reports', category: 'work', privacyLevel: 'app-only', createdAt: '2024-01-09T13:00:00Z', source: 'Conversation' },
  { id: 'm7', text: 'Partner named Alex works in design', category: 'people', privacyLevel: 'never', createdAt: '2024-01-06T17:00:00Z', source: 'Conversation' },
  { id: 'm8', text: 'Colleague Sarah is the PM on the collaboration project', category: 'people', privacyLevel: 'app-only', createdAt: '2024-01-11T10:30:00Z', source: 'Conversation' },
  { id: 'm9', text: 'Prefers dark mode interfaces', category: 'preferences', privacyLevel: 'share', createdAt: '2024-01-04T08:00:00Z', source: 'Settings' },
  { id: 'm10', text: 'Native English speaker, also speaks Spanish', category: 'personal', privacyLevel: 'app-only', createdAt: '2024-01-03T15:00:00Z', source: 'Conversation' },
  { id: 'm11', text: 'Company uses AWS for cloud infrastructure', category: 'work', privacyLevel: 'share', createdAt: '2024-01-13T12:00:00Z', source: 'Conversation' },
  { id: 'm12', text: 'Manager named David oversees the engineering department', category: 'people', privacyLevel: 'app-only', createdAt: '2024-01-14T09:00:00Z', source: 'Conversation' },
];

const PRIVACY_OPTIONS = [
  { value: 'share', label: 'Share across apps', icon: '🌐' },
  { value: 'app-only', label: 'This app only', icon: '🔒' },
  { value: 'never', label: 'Never remember', icon: '🚫' },
];

export default function MemoryPage(): JSX.Element {
  const [memories, setMemories] = useState<MemoryItem[]>(INITIAL_MEMORIES);
  const [categories] = useState<MemoryCategory[]>(CATEGORIES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(cat => {
      counts[cat.id] = memories.filter(m => m.category === cat.id).length;
    });
    return counts;
  }, [memories, categories]);

  const filteredMemories = useMemo(() => {
    let filtered = memories;
    if (selectedCategory) {
      filtered = filtered.filter(m => m.category === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => m.text.toLowerCase().includes(q));
    }
    return filtered;
  }, [memories, searchQuery, selectedCategory]);

  const groupedMemories = useMemo(() => {
    const groups: Record<string, MemoryItem[]> = {};
    categories.forEach(cat => {
      const items = filteredMemories.filter(m => m.category === cat.id);
      if (items.length > 0) {
        groups[cat.id] = items;
      }
    });
    return groups;
  }, [filteredMemories, categories]);

  const totalCount = useMemo(() => memories.length, [memories]);

  const handleEdit = useCallback((memory: MemoryItem) => {
    setEditingId(memory.id);
    setEditText(memory.text);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editText.trim()) return;
    setMemories(prev => prev.map(m =>
      m.id === editingId ? { ...m, text: editText.trim() } : m
    ));
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  }, []);

  const handlePrivacyChange = useCallback((id: string, level: 'share' | 'app-only' | 'never') => {
    setMemories(prev => prev.map(m =>
      m.id === id ? { ...m, privacyLevel: level } : m
    ));
  }, []);

  const handleClearAll = useCallback(() => {
    setMemories([]);
    setShowClearConfirm(false);
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const lines = content.split('\n').filter(l => l.trim());
        const imported: MemoryItem[] = lines.map((line, i) => ({
          id: `imported-${Date.now()}-${i}`,
          text: line.trim(),
          category: 'personal',
          privacyLevel: 'app-only' as const,
          createdAt: new Date().toISOString(),
          source: 'Import',
        }));
        setMemories(prev => [...prev, ...imported]);
      } catch (err) {
        setError('Failed to import file. Please use a text file with one memory per line.');
      }
      setIsImporting(false);
    };
    reader.readAsText(file);
  }, []);

  if (error) {
    return (
      <div className="memory-page error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div className="memory-page">
      <header className="memory-header">
        <h1>AI Memory</h1>
        <div className="memory-stats">
          <span className="total-count">{totalCount} memories stored</span>
        </div>
      </header>

      <div className="memory-controls">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="search-input"
          />
        </div>
        <div className="control-buttons">
          <button className="btn-import" onClick={handleImport} disabled={isImporting}>
            {isImporting ? 'Importing...' : '📥 Import'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".txt,.json,.csv"
            style={{ display: 'none' }}
          />
          <button className="btn-clear-all" onClick={() => setShowClearConfirm(true)}>
            🗑️ Clear All
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="confirm-dialog">
          <div className="confirm-content">
            <h3>Clear All Memories?</h3>
            <p>This will permanently delete all {totalCount} stored memories. This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn-confirm-delete" onClick={handleClearAll}>Yes, Clear All</button>
              <button className="btn-cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="category-tabs">
        <button
          className={`cat-tab ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All ({totalCount})
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`cat-tab ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.icon} {cat.name} ({categoryCounts[cat.id] || 0})
          </button>
        ))}
      </div>

      <div className="memories-body">
        {Object.keys(groupedMemories).length === 0 ? (
          <div className="empty-memories">
            {searchQuery ? (
              <p>No memories match your search for "{searchQuery}"</p>
            ) : (
              <>
                <h2>No memories stored</h2>
                <p>QuantAI will remember important details from your conversations to provide better assistance.</p>
              </>
            )}
          </div>
        ) : (
          Object.entries(groupedMemories).map(([catId, items]) => {
            const category = categories.find(c => c.id === catId);
            if (!category) return null;
            return (
              <section key={catId} className="memory-group">
                <div className="group-header">
                  <span className="group-icon">{category.icon}</span>
                  <h2>{category.name}</h2>
                  <span className="group-count">{items.length}</span>
                </div>
                <div className="memory-list">
                  {items.map(memory => (
                    <div key={memory.id} className="memory-item">
                      {editingId === memory.id ? (
                        <div className="edit-form">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="edit-textarea"
                            rows={2}
                          />
                          <div className="edit-actions">
                            <button className="btn-save" onClick={handleSaveEdit}>Save</button>
                            <button className="btn-cancel" onClick={handleCancelEdit}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="memory-content">
                            <p className="memory-text">{memory.text}</p>
                            <div className="memory-meta">
                              <span className="memory-source">{memory.source}</span>
                              <span className="memory-date">{new Date(memory.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="memory-controls-row">
                            <select
                              value={memory.privacyLevel}
                              onChange={e => handlePrivacyChange(memory.id, e.target.value as any)}
                              className="privacy-select"
                            >
                              {PRIVACY_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.icon} {opt.label}
                                </option>
                              ))}
                            </select>
                            <button className="btn-edit-memory" onClick={() => handleEdit(memory)}>✏️</button>
                            <button className="btn-delete-memory" onClick={() => handleDelete(memory.id)}>🗑️</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
