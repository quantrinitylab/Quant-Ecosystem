// ============================================================================
// QuantAI - AI Memory Management Page
// Full CRUD, export/import, search, category filtering, disclosure view,
// pending candidates with approve/reject, lock/unlock per memory
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface MemoryAccess {
  accessedAt: number;
  reason: string;
  requestingApp: string;
}

interface MemoryItem {
  id: string;
  userId: string;
  category: string;
  content: string;
  source: string;
  sourceApp: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  accessLog: MemoryAccess[];
  explanation: string;
  accessScopes: string[];
  writeSignal: 'explicit' | 'digest-approved' | 'pending-review';
  status: 'active' | 'pending';
  tags: string[];
  locked?: boolean;
}

interface MemoryCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface FullDisclosure {
  memories: MemoryItem[];
  accessLogs: Array<{ memoryId: string; content: string; logs: MemoryAccess[] }>;
}

const CATEGORIES: MemoryCategory[] = [
  { id: 'people', name: 'People', icon: '👥', description: 'People and relationships' },
  { id: 'places', name: 'Places', icon: '📍', description: 'Locations and geography' },
  { id: 'projects', name: 'Projects', icon: '📂', description: 'Work projects and tasks' },
  {
    id: 'preferences',
    name: 'Preferences',
    icon: '⚙️',
    description: 'Settings and style preferences',
  },
  { id: 'skills', name: 'Skills', icon: '🧠', description: 'Skills and expertise' },
  { id: 'goals', name: 'Goals', icon: '🎯', description: 'Goals and objectives' },
  { id: 'schedules', name: 'Schedules', icon: '📅', description: 'Timing and schedules' },
  { id: 'routines', name: 'Routines', icon: '🔄', description: 'Habits and routines' },
];

const API_BASE = '/memory';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

export default function MemoryPage(): JSX.Element {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [candidates, setCandidates] = useState<MemoryItem[]>([]);
  const [disclosure, setDisclosure] = useState<FullDisclosure | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDisclosure, setShowDisclosure] = useState<boolean>(false);
  // NOTE: Lock/unlock is client-side only for now (ephemeral state stored in React useState).
  // Locked IDs are lost on page refresh. Backend persistence of lock state is planned
  // for a future phase (e.g., a `locked` field or `accessScopes: []` override).
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch memories from API
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory) params.set('category', selectedCategory);
    if (searchQuery) params.set('search', searchQuery);
    const query = params.toString();
    const url = query ? `/?${query}` : '/';

    apiFetch<MemoryItem[]>(url).then((data) => {
      if (data) setMemories(data);
    });
  }, [selectedCategory, searchQuery]);

  // Fetch pending candidates
  useEffect(() => {
    apiFetch<MemoryItem[]>('/candidates').then((data) => {
      if (data) setCandidates(data);
    });
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CATEGORIES.forEach((cat) => {
      counts[cat.id] = memories.filter((m) => m.category === cat.id).length;
    });
    return counts;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    return memories;
  }, [memories]);

  const groupedMemories = useMemo(() => {
    const groups: Record<string, MemoryItem[]> = {};
    CATEGORIES.forEach((cat) => {
      const items = filteredMemories.filter((m) => m.category === cat.id);
      if (items.length > 0) {
        groups[cat.id] = items;
      }
    });
    return groups;
  }, [filteredMemories]);

  const totalCount = useMemo(() => memories.length, [memories]);

  const handleEdit = useCallback((memory: MemoryItem) => {
    setEditingId(memory.id);
    setEditText(memory.content);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editText.trim()) return;
    const updated = await apiFetch<MemoryItem>(`/${editingId}`, {
      method: 'PUT',
      body: JSON.stringify({ content: editText.trim() }),
    });
    if (updated) {
      setMemories((prev) => prev.map((m) => (m.id === editingId ? updated : m)));
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await apiFetch(`/${id}`, { method: 'DELETE' });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleClearAll = useCallback(async () => {
    // Delete all memories one by one (or purge by common tag if available)
    for (const m of memories) {
      await apiFetch(`/${m.id}`, { method: 'DELETE' });
    }
    setMemories([]);
    setShowClearConfirm(false);
  }, [memories]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const imported = await apiFetch<MemoryItem[]>('/import', {
          method: 'POST',
          body: JSON.stringify(parsed),
        });
        if (imported) {
          setMemories((prev) => [...prev, ...imported]);
        }
      } catch {
        setError('Failed to import file. Please use a valid JSON export.');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/export?format=json`);
      if (!res.ok) return;
      const data = await res.text();
      if (data) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'memory-export.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Export failed silently
    }
  }, []);

  const handleApproveCandidate = useCallback(async (id: string) => {
    const approved = await apiFetch<MemoryItem>(`/candidates/${id}/approve`, {
      method: 'POST',
    });
    if (approved) {
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      setMemories((prev) => [...prev, approved]);
    }
  }, []);

  const handleRejectCandidate = useCallback(async (id: string) => {
    await apiFetch(`/candidates/${id}/reject`, { method: 'POST' });
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleToggleLock = useCallback((id: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleShowDisclosure = useCallback(async () => {
    if (showDisclosure) {
      setShowDisclosure(false);
      return;
    }
    const data = await apiFetch<FullDisclosure>('/disclosure');
    if (data) {
      setDisclosure(data);
    }
    setShowDisclosure(true);
  }, [showDisclosure]);

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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="search-input"
          />
        </div>
        <div className="control-buttons">
          <button className="btn-export" onClick={handleExport}>
            📤 Export
          </button>
          <button className="btn-import" onClick={handleImport}>
            📥 Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json"
            style={{ display: 'none' }}
          />
          <button className="btn-disclosure" onClick={handleShowDisclosure}>
            🔎 What does Quant know about me?
          </button>
          <button className="btn-clear-all" onClick={() => setShowClearConfirm(true)}>
            🗑️ Clear All
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="confirm-dialog">
          <div className="confirm-content">
            <h3>Clear All Memories?</h3>
            <p>
              This will permanently delete all {totalCount} stored memories. This action cannot be
              undone.
            </p>
            <div className="confirm-actions">
              <button className="btn-confirm-delete" onClick={handleClearAll}>
                Yes, Clear All
              </button>
              <button className="btn-cancel" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
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
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`cat-tab ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.icon} {cat.name} ({categoryCounts[cat.id] || 0})
          </button>
        ))}
      </div>

      {/* Pending Candidates Section */}
      {candidates.length > 0 && (
        <section className="candidates-section">
          <h2>Pending Candidates (Weekly Digest)</h2>
          <p className="candidates-description">
            These memories were pattern-detected and need your approval.
          </p>
          <div className="candidates-list">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="candidate-item">
                <div className="candidate-content">
                  <span className="candidate-category">
                    {CATEGORIES.find((c) => c.id === candidate.category)?.icon} {candidate.category}
                  </span>
                  <p>{candidate.content}</p>
                  <span className="candidate-source">Source: {candidate.sourceApp}</span>
                </div>
                <div className="candidate-actions">
                  <button
                    className="btn-approve"
                    onClick={() => handleApproveCandidate(candidate.id)}
                  >
                    ✅ Approve
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => handleRejectCandidate(candidate.id)}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full Disclosure Section */}
      {showDisclosure && (
        <section className="disclosure-section">
          <h2>What does Quant know about me?</h2>
          <p className="disclosure-description">
            Full disclosure of all memories grouped by source app, including access logs.
          </p>
          {disclosure ? (
            <div className="disclosure-content">
              {disclosure.accessLogs.map((entry) => (
                <div key={entry.memoryId} className="disclosure-entry">
                  <p className="disclosure-memory">{entry.content}</p>
                  {entry.logs.length > 0 ? (
                    <ul className="access-log-list">
                      {entry.logs.map((log, i) => (
                        <li key={i} className="access-log-item">
                          <span className="log-app">{log.requestingApp}</span> accessed for:{' '}
                          {log.reason} ({new Date(log.accessedAt).toLocaleDateString()})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-access">No access recorded</p>
                  )}
                </div>
              ))}
              {disclosure.accessLogs.length === 0 && <p>No memories stored yet.</p>}
            </div>
          ) : (
            <p>Loading disclosure data...</p>
          )}
        </section>
      )}

      <div className="memories-body">
        {Object.keys(groupedMemories).length === 0 ? (
          <div className="empty-memories">
            {searchQuery ? (
              <p>No memories match your search for &quot;{searchQuery}&quot;</p>
            ) : (
              <>
                <h2>No memories stored</h2>
                <p>
                  QuantAI will remember important details from your conversations to provide better
                  assistance.
                </p>
              </>
            )}
          </div>
        ) : (
          Object.entries(groupedMemories).map(([catId, items]) => {
            const category = CATEGORIES.find((c) => c.id === catId);
            if (!category) return null;
            return (
              <section key={catId} className="memory-group">
                <div className="group-header">
                  <span className="group-icon">{category.icon}</span>
                  <h2>{category.name}</h2>
                  <span className="group-count">{items.length}</span>
                </div>
                <div className="memory-list">
                  {items.map((memory) => (
                    <div key={memory.id} className="memory-item">
                      {editingId === memory.id ? (
                        <div className="edit-form">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="edit-textarea"
                            rows={2}
                          />
                          <div className="edit-actions">
                            <button className="btn-save" onClick={handleSaveEdit}>
                              Save
                            </button>
                            <button className="btn-cancel" onClick={handleCancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="memory-content">
                            <p className="memory-text">{memory.content}</p>
                            <div className="memory-meta">
                              <span className="memory-source">{memory.sourceApp}</span>
                              <span className="memory-date">
                                {new Date(memory.createdAt).toLocaleDateString()}
                              </span>
                              {memory.tags.length > 0 && (
                                <span className="memory-tags">{memory.tags.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          <div className="memory-controls-row">
                            <button
                              className={`btn-lock ${lockedIds.has(memory.id) ? 'locked' : ''}`}
                              onClick={() => handleToggleLock(memory.id)}
                              title={
                                lockedIds.has(memory.id)
                                  ? 'Unlock (resume access)'
                                  : 'Lock (pause access)'
                              }
                            >
                              {lockedIds.has(memory.id) ? '🔒' : '🔓'}
                            </button>
                            <button className="btn-edit-memory" onClick={() => handleEdit(memory)}>
                              ✏️
                            </button>
                            <button
                              className="btn-delete-memory"
                              onClick={() => handleDelete(memory.id)}
                            >
                              🗑️
                            </button>
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
